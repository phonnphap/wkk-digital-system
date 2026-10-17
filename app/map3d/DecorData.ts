// ข้อมูลฉากตกแต่ง — พิกัดเป็น pixel ของรูปแผนผัง (world = (px - 480|400)/30)
// ค่าตั้งต้นอยู่ใน DEFAULT_DECOR; แอดมินแก้ได้ในแท็บ "ฉาก/ประตู" แล้วบันทึกลง map_config
import { MapEdge, MapLocation, MapNode, localToWorld, px, XZ } from "./schoolData";

/** แนวรั้วโรงเรียน (วนปิดรอบ)
 *  มีรอยบากตามเส้นแดง: (900,508)→(843,518)→(835,437)→(637,467)→(652,554) พื้นที่ในรอยบากไม่ใช่ของโรงเรียน */
export const FENCE_PX: [number, number][] = [
  [92, 208], [560, 196], [752, 226], [770, 300], [838, 378],
  [895, 380], [900, 508], [843, 518], [835, 437], [637, 467], [652, 554],
  [445, 592], [338, 598], [105, 620],
];
export const FENCE: XZ[] = FENCE_PX.map(([x, y]) => px(x, y));

export function pointInPoly(p: XZ, poly: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function snapFence(p: XZ) {
  let best = { d: Infinity, pt: p, ang: 0 };
  for (let i = 0; i < FENCE.length; i++) {
    const a = FENCE[i], b = FENCE[(i + 1) % FENCE.length];
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / (vx * vx + vz * vz)));
    const q: XZ = [a[0] + vx * t, a[1] + vz * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { d, pt: q, ang: Math.atan2(vz, vx) };
  }
  return best;
}

/** จุดบนรั้วที่ใกล้พิกัด px ที่สุด + มุมรั้ว + เวกเตอร์ชี้ออกนอกรั้ว */
export function fenceFrame(x: number, y: number) {
  const s = snapFence(px(x, y));
  const n1: XZ = [-Math.sin(s.ang), Math.cos(s.ang)];
  const test: XZ = [s.pt[0] + n1[0] * 0.8, s.pt[1] + n1[1] * 0.8];
  const out: XZ = pointInPoly(test, FENCE) ? [-n1[0], -n1[1]] : n1;
  return { x: s.pt[0], z: s.pt[1], ang: s.ang, out };
}

/* ───────────── ชนิดของตกแต่ง ───────────── */
export type DecorType = "tree" | "pavilion" | "shrine" | "toilet" | "shed" | "barrier" | "flag" | "bridge" | "sign" | "carport" | "busbay" | "kiosk";
export const DECOR_LABEL: Record<DecorType, string> = {
  tree: "ต้นไม้", pavilion: "ศาลา/ซุ้มนั่งเล่น", shrine: "ซุ้มพระ", toilet: "ตึกห้องน้ำ (นอกอาคาร)",
  shed: "โรงจอดมอเตอร์ไซค์", barrier: "ประตูกั้น", flag: "เสาธง", bridge: "ทางเชื่อมระหว่างอาคาร", sign: "ป้ายโรงเรียน",
  carport: "โรงจอดรถยนต์", busbay: "ช่องจอดรถตู้/รถรับส่ง", kiosk: "ซุ้มขายน้ำ",
};
export interface DecorItem {
  id: string; type: DecorType;
  x: number; y: number;      // pixel ของแผนผัง
  rot?: number;              // องศา (ค่าลบ = ยกด้านขวาขึ้น)
  s?: number; h?: number;    // ต้นไม้: ขนาด / ความสูง (ตัวคูณ)
  w?: number; d?: number;    // ขนาดเป็น pixel
  color?: string; name?: string;
  levels?: string;           // ทางเชื่อม: ชั้นที่มี เช่น "2,3"
  n?: number;                // ช่องจอด (busbay)
  since?: number;            // เวอร์ชันที่เพิ่มรายการนี้ (ใช้เติมค่าตั้งต้นใหม่ให้ข้อมูลที่เคยบันทึกไว้)
}
export interface GateItem {
  id: string; name: string; x: number; y: number;
  width: number;             // world
  color: string;
  node: string;              // id โหนดเส้นทางของประตู
  link?: string;             // โหนดถนนที่ต่อเข้า (ว่าง = ใกล้สุด)
  main?: boolean;
  since?: number;
}
export interface DecorConfig { items: DecorItem[]; gates: GateItem[]; version?: number }

const trees = (list: [number, number, number][], h = 1): DecorItem[] =>
  list.map(([x, y, s], i) => ({ id: `tree-${x}-${y}-${i}`, type: "tree", x, y, s, h }));

export const DECOR_VERSION = 3;
export const DEFAULT_DECOR: DecorConfig = {
  version: DECOR_VERSION,
  gates: [
    { id: "g1", name: "ประตู 1 ประตูหลังโรงเรียน", x: 104, y: 577, width: 1.8, color: "#f97316", node: "gW", link: "w3" },
    { id: "g2", name: "ประตู 2 ทางเข้าผู้บริหาร", x: 397, y: 594, width: 1.8, color: "#7c3aed", node: "g2n", link: "gate" },
    { id: "g5", name: "ประตูทางเข้าคนเดิน (ติดประตู 2)", x: 355, y: 596, width: 1.0, color: "#a78bfa", node: "g5n", link: "gate", since: 3 },
    { id: "g3", name: "ประตู 3 ทางเข้าลานจอดรถหลัก", x: 517, y: 579, width: 2.4, color: "#7c3aed", node: "g3n", link: "gate", main: true },
    { id: "g4", name: "ประตู 4 ประตูข้างลานจอดรถ", x: 897, y: 445, width: 2.2, color: "#be123c", node: "gE", link: "p1" },
  ],
  items: [
    ...trees([
      [560, 225, 1.1], [582, 232, 1.2], [606, 230, 1], [718, 238, 1.1], [690, 222, 0.9],
      [541, 322, 0.75], [548, 342, 0.75],
      [398, 408, 0.65], [398, 440, 0.65], [398, 470, 0.65], [400, 498, 0.65],
      [281, 433, 0.7], [282, 450, 0.7], [281, 473, 0.7],
      [118, 300, 1], [120, 262, 1], [122, 225, 1],
      [250, 224, 1], [290, 226, 0.9], [330, 222, 0.9],
      [480, 300, 0.8], [650, 400, 0.9], [700, 420, 0.9], [760, 390, 1], [810, 400, 1],
      [330, 540, 0.9], [495, 470, 0.8],
    ]),
    // ต้นไม้สูงริมรั้วหลังอาคาร 9
    ...trees([[101, 365, 1.1], [101, 395, 1.1], [101, 425, 1.1], [101, 455, 1.1], [101, 485, 1.1], [101, 515, 1.1]], 1.7)
      .map((t, i) => ({ ...t, id: `tall-${i}` })),
    ...([
      [545, 311, "#3b5bdb"], [548, 350, "#3b5bdb"], [547, 385, "#3b5bdb"],
      [240, 222, "#e5484d"], [140, 548, "#e5484d"], [140, 606, "#e5484d"],
    ] as [number, number, string][]).map(([x, y, color], i): DecorItem => ({ id: `pav-${i}`, type: "pavilion", x, y, color })),
    { id: "flag-1", type: "flag", x: 460, y: 503 },                       // หน้าโดม 13
    { id: "shrine-1", type: "shrine", x: 478, y: 552, name: "ซุ้มพระ" },  // หลังป้อมยาม
    { id: "shed-1", type: "shed", x: 690, y: 444, w: 76, d: 26, rot: -8.6, name: "โรงจอดมอเตอร์ไซค์", color: "#f59f00" },
    { id: "shed-2", type: "shed", x: 552, y: 296, w: 34, d: 30, name: "ที่จอดมอเตอร์ไซค์", color: "#f59f00" },
    { id: "barrier-1", type: "barrier", x: 527, y: 277, w: 26, rot: 90, name: "ประตูกั้น" },
    { id: "bridge-43", type: "bridge", x: 358, y: 282, w: 30, d: 28, levels: "2,3", name: "ทางเชื่อมอาคาร 4-3" },
    { id: "bridge-53", type: "bridge", x: 498, y: 277, w: 30, d: 18, levels: "2,3", name: "ทางเชื่อมอาคาร 5-3" },
    { id: "sign-1", type: "sign", x: 457, y: 590, w: 42, name: "โรงเรียนวัดเขียนเขต" },
    // ── เพิ่มในเวอร์ชัน 2 ──
    { id: "carport-exec", type: "carport", x: 455, y: 310, w: 50, d: 22, rot: 90, name: "โรงจอดรถผู้บริหาร", color: "#7c3aed", since: 2 },
    { id: "carport-teacher", type: "carport", x: 680, y: 380, w: 100, d: 24, name: "โรงจอดรถครู", color: "#2563eb", since: 2 },
    { id: "busbay-1", type: "busbay", x: 410, y: 276, w: 78, d: 18, n: 3, name: "ที่จอดรถตู้/รถรับส่ง นร.", since: 2 },
    { id: "kiosk-1", type: "kiosk", x: 350, y: 535, name: "ซุ้มขายน้ำ", color: "#0ea5e9", since: 2 },
    { id: "barrier-2", type: "barrier", x: 505, y: 508, w: 36, name: "ประตูกั้น อนุบาล–อาคาร 4", since: 2 },
    { id: "barrier-3", type: "barrier", x: 435, y: 503, w: 34, name: "ประตูกั้น ห้องปกครอง–โดม", since: 2 },
    { id: "pav-lib", type: "pavilion", x: 362, y: 531, color: "#3b5bdb", since: 2 },
    { id: "pav-coop", type: "pavilion", x: 322, y: 548, color: "#e5484d", since: 2 },
  ],
};

export function sanitizeDecor(v: any): DecorConfig {
  const okPos = (i: any) => i && typeof i.x === "number" && typeof i.y === "number";
  const ver = typeof v?.version === "number" ? v.version : 1;
  const items: DecorItem[] = Array.isArray(v?.items)
    ? v.items.filter((i: any) => okPos(i) && typeof i.type === "string") : [...DEFAULT_DECOR.items];
  // หมายเหตุ: ประตูไม่มีฟิลด์ type — เช็กด้วย node แทน (บั๊กเดิมทำให้ประตูหายหลังรีเฟรช)
  const gates: GateItem[] = Array.isArray(v?.gates)
    ? v.gates.filter((g: any) => okPos(g) && typeof g.node === "string") : [...DEFAULT_DECOR.gates];
  if (ver < DECOR_VERSION) {
    const hi = new Set(items.map((i) => i.id)), hg = new Set(gates.map((g) => g.id));
    DEFAULT_DECOR.items.forEach((i) => { if ((i.since ?? 1) > ver && !hi.has(i.id)) items.push(i); });
    DEFAULT_DECOR.gates.forEach((g) => { if ((g.since ?? 1) > ver && !hg.has(g.id)) gates.push(g); });
  }
  return { items, gates, version: DECOR_VERSION };
}

/* ───────────── ประตูรั้ว ───────────── */
export interface GateDef {
  id: string; name: string; node: string; link?: string; main: boolean; width: number; color: string;
  x: number; z: number; ang: number; out: XZ;
}
export function buildGates(defs: GateItem[]): GateDef[] {
  return defs.map((g) => {
    const f = fenceFrame(g.x, g.y);
    return { id: g.id, name: g.name, node: g.node, link: g.link, main: !!g.main, width: g.width, color: g.color, x: f.x, z: f.z, ang: f.ang, out: f.out };
  });
}

/** วางโหนดประตูตามตำแหน่งจริง และต่อเข้าถนนใกล้เคียง (ตัดเส้นเก่าของโหนดประตูทิ้ง) */
export function withGateNodes(nodes: MapNode[], edges: MapEdge[], gates: GateDef[]) {
  const ids = new Set(gates.map((g) => g.node));
  const base = nodes.filter((n) => !ids.has(n.id));
  const outNodes: MapNode[] = [...base, ...gates.map((g) => ({ id: g.node, x: g.x, z: g.z }))];
  const outEdges: MapEdge[] = edges.filter((e) => !ids.has(e.a) && !ids.has(e.b));
  gates.forEach((g) => {
    let link = g.link && base.some((n) => n.id === g.link) ? g.link : "";
    if (!link) {
      let bd = Infinity;
      base.forEach((n) => { const d = Math.hypot(n.x - g.x, n.z - g.z); if (d < bd) { bd = d; link = n.id; } });
    }
    if (link) outEdges.push({ a: g.node, b: link });
  });
  return { nodes: outNodes, edges: outEdges };
}

/* ───────────── ถนน ─────────────
   พิกัด px ของแผนผัง (ประมาณจากแผนผังจราจร)
   - ถนนหลักรังสิต–นครนายก: สีน้ำเงิน 4 เลน (ฝั่งละ 2) อยู่ทางตะวันตกของวัด
   - ถนนในซอย (ผ่านวัดเขียนเขต): สีดำ ขอบเหลือง 2 เลน
   - ถนนเข้า-ออกลานจอดรถ (ในโรงเรียน): สีเหลือง */
export const ROAD_W = 1.6;
export const MAIN_ROAD = { x: -410, y0: -150, y1: 900, w: 4.0 };
export const SOI_ROADS_PX: [number, number][][] = [
  [[-410, 224], [-44, 212], [10, 628]],                                         // ทางเข้าซอย → ด้านตะวันออกของวัด
  [[-286, 224], [-280, 672]],                                                    // ริมวัดด้านตะวันตก
  [[-286, 428], [-200, 428], [-196, 668]],                                       // ซอยย่อยวัดหลังเล็ก
  [[-410, 672], [-196, 668], [10, 660], [100, 662], [335, 650], [454, 641], [661, 603], [852, 567], [958, 520], [1010, 505]], // ทางออก ผ่านหน้าโรงเรียน
];
export const OUTSIDE_ROADS_PX = SOI_ROADS_PX;
export const PARK_ROADS_PX: [number, number][][] = [
  [[576, 420], [540, 432], [505, 500], [500, 560], [517, 579]],                  // ลานจอดรถ ↔ ประตู 3
  [[564, 243], [747, 243], [790, 392], [576, 416], [564, 243]],                  // วนรอบลานจอดรถ
  [[790, 392], [845, 415], [880, 440], [897, 445]],                              // ลานจอดรถ ↔ ประตู 4
];
export const ROAD_LABELS_PX: { x: number; y: number; text: string }[] = [
  { x: -380, y: 200, text: "ทางเข้า" },
  { x: -380, y: 695, text: "ทางออก" },
  { x: -243, y: 330, text: "วัดเขียนเขต" },
];

/** ช่วงถนนซอยนอกรั้ว + ทางต่อจากประตูแต่ละบานไปยังถนน */
export function outsideRoadSegs(gates: GateDef[]): { a: XZ; b: XZ }[] {
  const segs: { a: XZ; b: XZ }[] = [];
  SOI_ROADS_PX.forEach((pl) => {
    for (let i = 0; i < pl.length - 1; i++) segs.push({ a: px(pl[i][0], pl[i][1]), b: px(pl[i + 1][0], pl[i + 1][1]) });
  });
  const roadSegs = [...segs];
  gates.forEach((g) => {
    let best: { d: number; q: XZ } = { d: Infinity, q: [g.x, g.z] };
    roadSegs.forEach(({ a, b }) => {
      const vx = b[0] - a[0], vz = b[1] - a[1];
      const t = Math.min(1, Math.max(0, ((g.x - a[0]) * vx + (g.z - a[1]) * vz) / (vx * vx + vz * vz)));
      const q: XZ = [a[0] + vx * t, a[1] + vz * t];
      const d = Math.hypot(g.x - q[0], g.z - q[1]);
      if (d < best.d) best = { d, q };
    });
    if (best.d > 0.2 && best.d < 8) segs.push({ a: [g.x, g.z], b: best.q });
  });
  return segs;
}

/** (เก็บไว้เพื่อความเข้ากันได้กับโค้ดเดิม) */
export const GATES: GateDef[] = buildGates(DEFAULT_DECOR.gates);
export const GATE_GAP_CENTER: XZ = [GATES[0].x, GATES[0].z];
export const GATE_GAP_RADIUS = GATES[0].width / 2 + 0.25;

/* ───────────── ตรวจผัง: อาคารทับกัน / เลยรั้ว ───────────── */
function corners(l: MapLocation): XZ[] {
  const [w, d] = l.size;
  return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as XZ[]).map(([x, z]) => localToWorld(l, x, z));
}
function penetration(a: XZ[], b: XZ[]): number {
  let min = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const p = poly[i], q = poly[i + 1];
      let ax = -(q[1] - p[1]), az = q[0] - p[0];
      const len = Math.hypot(ax, az) || 1; ax /= len; az /= len;
      const range = (c: XZ[]) => {
        const v = c.map(([x, z]) => x * ax + z * az);
        return [Math.min(...v), Math.max(...v)];
      };
      const [a0, a1] = range(a), [b0, b1] = range(b);
      const pen = Math.min(a1, b1) - Math.max(a0, b0);
      if (pen <= 0) return 0;
      min = Math.min(min, pen);
    }
  }
  return min;
}

export function layoutWarnings(locs: MapLocation[]): string[] {
  const out: string[] = [];
  const cs = locs.map(corners);
  for (let i = 0; i < locs.length; i++) {
    if (cs[i].some((c) => !pointInPoly(c, FENCE))) out.push(`${locs[i].code}. ${locs[i].name} เลยออกนอกรั้ว`);
    for (let j = i + 1; j < locs.length; j++) {
      if (penetration(cs[i], cs[j]) > 0.05) out.push(`${locs[i].code} ทับกับ ${locs[j].code}`);
    }
  }
  return out;
}