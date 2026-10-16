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
export type DecorType = "tree" | "pavilion" | "shrine" | "toilet" | "shed" | "barrier" | "flag" | "bridge" | "sign";
export const DECOR_LABEL: Record<DecorType, string> = {
  tree: "ต้นไม้", pavilion: "ศาลา/ซุ้มนั่งเล่น", shrine: "ซุ้มพระ", toilet: "ตึกห้องน้ำ (นอกอาคาร)",
  shed: "โรงจอดมอเตอร์ไซค์", barrier: "ประตูกั้น", flag: "เสาธง", bridge: "ทางเชื่อมระหว่างอาคาร", sign: "ป้ายโรงเรียน",
};
export interface DecorItem {
  id: string; type: DecorType;
  x: number; y: number;      // pixel ของแผนผัง
  rot?: number;              // องศา (ค่าลบ = ยกด้านขวาขึ้น)
  s?: number; h?: number;    // ต้นไม้: ขนาด / ความสูง (ตัวคูณ)
  w?: number; d?: number;    // ขนาดเป็น pixel
  color?: string; name?: string;
  levels?: string;           // ทางเชื่อม: ชั้นที่มี เช่น "2,3"
}
export interface GateItem {
  id: string; name: string; x: number; y: number;
  width: number;             // world
  color: string;
  node: string;              // id โหนดเส้นทางของประตู
  link?: string;             // โหนดถนนที่ต่อเข้า (ว่าง = ใกล้สุด)
  main?: boolean;
}
export interface DecorConfig { items: DecorItem[]; gates: GateItem[] }

const trees = (list: [number, number, number][], h = 1): DecorItem[] =>
  list.map(([x, y, s], i) => ({ id: `tree-${x}-${y}-${i}`, type: "tree", x, y, s, h }));

export const DEFAULT_DECOR: DecorConfig = {
  gates: [
    { id: "g1", name: "ประตู 1 ประตูหลังโรงเรียน", x: 104, y: 577, width: 1.8, color: "#f97316", node: "gW", link: "w3" },
    { id: "g2", name: "ประตู 2 ทางเข้าผู้บริหาร", x: 397, y: 594, width: 1.8, color: "#7c3aed", node: "g2n", link: "gate" },
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
    { id: "sign-1", type: "sign", x: 457, y: 590, w: 66, name: "โรงเรียนวัดเขียนเขต" },
  ],
};

export function sanitizeDecor(v: any): DecorConfig {
  const okItem = (i: any) => i && typeof i.x === "number" && typeof i.y === "number" && typeof i.type === "string";
  const items = Array.isArray(v?.items) ? v.items.filter(okItem) : DEFAULT_DECOR.items;
  const gates = Array.isArray(v?.gates) && v.gates.length ? v.gates.filter(okItem) : DEFAULT_DECOR.gates;
  return { items, gates };
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