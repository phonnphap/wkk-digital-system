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
export type DecorType = "tree" | "pavilion" | "shrine" | "toilet" | "shed" | "barrier" | "flag" | "bridge" | "sign" | "carport" | "busbay" | "kiosk" | "temple" | "roadsign" | "zebra" | "fieldfence" | "people";
export const DECOR_LABEL: Record<DecorType, string> = {
  tree: "ต้นไม้", pavilion: "ศาลา/ซุ้มนั่งเล่น", shrine: "ซุ้มพระ", toilet: "ตึกห้องน้ำ (นอกอาคาร)",
  shed: "โรงจอดมอเตอร์ไซค์", barrier: "ประตูกั้น", flag: "เสาธง", bridge: "ทางเชื่อมระหว่างอาคาร", sign: "ป้ายโรงเรียน",
  carport: "โรงจอดรถยนต์", busbay: "ช่องจอดรถตู้/รถรับส่ง", kiosk: "ซุ้มขายน้ำ",
  temple: "วัด (โมเดล)", roadsign: "ป้ายจราจร/บอกทาง", zebra: "ทางม้าลาย", fieldfence: "รั้วสนามกีฬา", people: "กลุ่มนักเรียน/ครู",
};
export interface DecorItem {
  id: string; type: DecorType;
  x: number; y: number;      // pixel ของแผนผัง
  rot?: number;              // องศา (ค่าลบ = ยกด้านขวาขึ้น)
  s?: number; h?: number;    // ต้นไม้: ขนาด / ความสูง (ตัวคูณ)
  w?: number; d?: number;    // ขนาดเป็น pixel
  color?: string; name?: string;
  levels?: string;           // ทางเชื่อม: ชั้นที่มี เช่น "2,3"
  hs?: number;               // ตัวคูณความสูง (ซุ้ม/ห้องน้ำ/โรงจอด ฯลฯ)
  road?: string;             // people kind=follow: id ของถนน/ฟุตบาทที่เดินตาม
  n?: number;                // busbay: จำนวนช่อง / people: จำนวนนักเรียน
  m?: number;                // people: จำนวนครู
  kind?: string;             // tree: round|pine|palm|bush|flower, people: walk|assemble|sit|play|exercise, temple: ubosot|prasat
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
  h?: number;                          // ความสูงเสาประตู (world)
  mode?: "double" | "single" | "slide"; // เปิด 2 บาน / 1 บาน / ประตูเลื่อน
  closed?: boolean;                    // ปิดประตู
  ped?: boolean;                       // ประตูคนเดิน (ไม่มีถนนต่อ)
}
export type RoadKind = "main" | "soi" | "park" | "walk" | "route" | "gray";
/** กำลังโหมด "วางตำแหน่ง" — วัตถุไม่ต้องดักคลิก ปล่อยให้ถึงพื้นเพื่อวาง */
export const pickState = { placing: false };
export type PickFn = (x: number, z: number, label: string, ref?: { kind: "item" | "gate" | "road" | "loc" | "room" | "gray"; id: string }) => void;
export interface GrayRoad { w: number; color: string; edge: string }
export const ROAD_KIND_LABEL: Record<RoadKind, string> = {
  main: "ถนนหลัก (น้ำเงิน 4 เลน)", soi: "ถนนซอย (ดำ ขอบเหลือง)", park: "ถนนลานจอดรถ (เหลือง)",
  walk: "ฟุตบาท (มีหลังคา)", route: "เส้นทางรถวิ่ง (ไม่แสดงถนน)", gray: "ถนนในโรงเรียน (เทา ขอบขาว)",
};
export interface RoadItem {
  id: string; name: string; kind: RoadKind;
  pts: [number, number][];   // px
  curve?: number;            // ความโค้ง 0 = เส้นตรง, 1 = โค้งเรียบ
  w?: number;                // ความกว้าง (world)
  roof?: boolean;            // ฟุตบาท: มีหลังคา
  label?: string;            // ป้ายชื่อถนน
  since?: number;
}
export interface DecorConfig {
  items: DecorItem[]; gates: GateItem[]; roads: RoadItem[];
  traffic?: { cars: number; speed: number };
  grayRoad?: GrayRoad;       // ถนนเทาในโรงเรียนที่มีอยู่เดิม (สีและความกว้าง)
  version?: number;
}

const trees = (list: [number, number, number][], h = 1): DecorItem[] =>
  list.map(([x, y, s], i) => ({ id: `tree-${x}-${y}-${i}`, type: "tree", x, y, s, h }));

type P = [number, number];
const offsetPts = (pts: P[], d: number): P[] => pts.map((p, i) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  return [Math.round(p[0] - (dy / L) * d), Math.round(p[1] + (dx / L) * d)] as P;
});
const RD = (id: string, name: string, kind: RoadKind, pts: P[], extra: Partial<RoadItem> = {}): RoadItem =>
  ({ id, name, kind, pts, since: 4, ...extra });

/** เส้นทางรถ: ถนนน้ำเงิน → ซอย → ประตู 3 → ลานจอดรถ → ประตู 4 → ออกซอย → ถนนน้ำเงิน (ขับชิดซ้าย) */
const CAR_ROUTE: P[] = [
  [-380, -120], [-380, 195], [-368, 208], [-300, 211], [-120, 205], [-44, 205], [-26, 260], [-5, 430], [22, 620],
  [60, 648], [100, 650], [335, 638], [454, 629], [520, 622], [522, 600], [517, 579],
  [500, 560], [505, 500], [540, 432], [576, 420], [790, 394], [845, 415], [880, 440], [897, 445],
  [940, 480], [958, 530], [852, 579], [661, 615], [454, 653], [335, 662], [100, 674], [10, 672],
  [-196, 680], [-380, 684], [-380, 720], [-380, 900],
];
export const DEFAULT_ROADS: RoadItem[] = [
  RD("main", "ถนนรังสิต–นครนายก (4 เลน)", "main", [[-410, -150], [-410, 900]], { w: 4, label: "🛣 ถนนรังสิต–นครนายก (4 เลน)" }),
  RD("soi-in", "ซอยทางเข้า", "soi", [[-410, 224], [-44, 212], [10, 628]], { w: 1.6 }),
  RD("soi-w", "ซอยริมวัด", "soi", [[-286, 224], [-280, 672]], { w: 1.6 }),
  RD("soi-w2", "ซอยย่อยวัด", "soi", [[-286, 428], [-200, 428], [-196, 668]], { w: 1.6 }),
  RD("soi-out", "ซอยทางออก (หน้าโรงเรียน)", "soi",
    [[-410, 672], [-196, 668], [10, 660], [100, 662], [335, 650], [454, 641], [661, 603], [852, 567], [958, 520], [1010, 505]], { w: 1.6 }),
  RD("park-3", "ถนนเหลือง ลานจอดรถ ↔ ประตู 3", "park", [[576, 420], [540, 432], [505, 500], [500, 560], [517, 579]], { w: 1.0 }),
  RD("park-loop", "ถนนเหลือง วนรอบลานจอดรถ", "park", [[564, 243], [747, 243], [790, 392], [576, 416], [564, 243]], { w: 1.0 }),
  RD("park-4", "ถนนเหลือง ลานจอดรถ ↔ ประตู 4", "park", [[790, 392], [845, 415], [880, 440], [897, 445]], { w: 1.0 }),
  RD("walk-1", "ฟุตบาทมีหลังคา (ฝั่งตรงข้ามโรงเรียน)", "walk",
    offsetPts([[-196, 668], [10, 660], [100, 662], [335, 650], [454, 641], [661, 603], [852, 567], [958, 520]], 42), { w: 1.0, roof: true }),
  RD("walk-in", "ทางเดิน นร. จากซอยเข้าโรงเรียน", "walk",
    [[120, 704], [250, 698], [355, 692], [355, 640], [355, 597], [352, 560], [380, 528], [400, 525]], { w: 0.9, curve: 0.6, since: 5 }),
  RD("route-1", "เส้นทางรถ (เข้าประตู 3 → ออกประตู 4)", "route", CAR_ROUTE, { curve: 0.8 }),
];

export const DECOR_VERSION = 5;
export const DEFAULT_DECOR: DecorConfig = {
  version: DECOR_VERSION,
  roads: DEFAULT_ROADS,
  traffic: { cars: 4, speed: 2.4 },
  grayRoad: { w: 1.02, color: "#9ca3af", edge: "#ffffff" },
  gates: [
    { id: "g1", name: "ประตู 1 ประตูหลังโรงเรียน", x: 104, y: 577, width: 1.8, color: "#f97316", node: "gW", link: "w3" },
    { id: "g2", name: "ประตู 2 ทางเข้าผู้บริหาร", x: 397, y: 594, width: 1.8, color: "#7c3aed", node: "g2n", link: "gate" },
    { id: "g5", name: "ประตูทางเข้าคนเดิน (ติดประตู 2)", x: 355, y: 596, width: 1.0, color: "#a78bfa", node: "g5n", link: "gate", ped: true, since: 3 },
    { id: "g6", name: "ประตูทางเข้าคนเดิน (ข้างตึกอนุบาล)", x: 588, y: 563, width: 1.0, color: "#a78bfa", node: "g6n", link: "e1", ped: true, since: 4 },
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
    // ── เพิ่มในเวอร์ชัน 4 ──
    { id: "temple-1", type: "temple", x: -158, y: 330, kind: "ubosot", s: 1, name: "วัดเขียนเขต (อุโบสถ)", since: 4 },
    { id: "temple-2", type: "temple", x: -103, y: 518, kind: "prasat", s: 1, name: "วัดเขียนเขต (วิหาร)", since: 4 },
    { id: "rs-in", type: "roadsign", x: -352, y: 196, w: 70, name: "ทางเข้า|โรงเรียนวัดเขียนเขต ➜", color: "#15803d", since: 4 },
    { id: "rs-out", type: "roadsign", x: -352, y: 702, w: 80, name: "ทางออก|ไปถนนรังสิต–นครนายก ➜", color: "#15803d", since: 4 },
    { id: "rs-g4", type: "roadsign", x: 968, y: 468, w: 120, name: "ทางออก|⬅ เลี้ยวซ้าย ไปคลอง 3|เลี้ยวขวา ไปรังสิต–นครนายก ➡", color: "#15803d", since: 4 },
    { id: "zebra-1", type: "zebra", x: 355, y: 649, w: 52, d: 12, rot: -4, since: 4 },
    { id: "fence-14", type: "fieldfence", x: 240, y: 462, w: 69, d: 104, h: 1, name: "รั้วสนาม 14", since: 4 },
    { id: "bridge-83", type: "bridge", x: 421, y: 275, w: 30, d: 14, levels: "2", name: "ทางเชื่อมอาคาร 8-3", since: 4 },
    { id: "ppl-walk", type: "people", x: 440, y: 545, w: 70, d: 30, n: 10, m: 1, kind: "walk", name: "นักเรียนเดิน", since: 4 },
    { id: "ppl-play", type: "people", x: 240, y: 462, w: 55, d: 85, n: 8, m: 1, kind: "play", name: "เล่นสนามฟุตซอล", since: 4 },
    { id: "ppl-in", type: "people", x: 355, y: 640, n: 12, m: 1, kind: "follow", road: "walk-in", name: "นักเรียนเดินเข้าโรงเรียน", since: 5 },
    { id: "pine-1", type: "tree", x: 640, y: 238, kind: "pine", s: 1, h: 1, since: 4 },
    { id: "pine-2", type: "tree", x: 664, y: 234, kind: "pine", s: 1.1, h: 1, since: 4 },
    { id: "palm-1", type: "tree", x: 580, y: 455, kind: "palm", s: 1, h: 1, since: 4 },
    { id: "palm-2", type: "tree", x: 598, y: 448, kind: "palm", s: 1.1, h: 1, since: 4 },
    { id: "flower-1", type: "tree", x: 545, y: 262, kind: "flower", s: 1, h: 1, since: 4 },
    { id: "bush-1", type: "tree", x: 560, y: 330, kind: "bush", s: 1, h: 1, since: 4 },
    { id: "bush-2", type: "tree", x: 560, y: 372, kind: "bush", s: 1, h: 1, since: 4 },
  ],
};

export function sanitizeDecor(v: any): DecorConfig {
  const okPos = (i: any) => i && typeof i.x === "number" && typeof i.y === "number";
  const ver = typeof v?.version === "number" ? v.version : 1;
  const items: DecorItem[] = Array.isArray(v?.items)
    ? v.items.filter((i: any) => okPos(i) && typeof i.type === "string") : [...DEFAULT_DECOR.items];
  // ประตูไม่มีฟิลด์ type — เช็กด้วย node แทน
  let gates: GateItem[] = Array.isArray(v?.gates)
    ? v.gates.filter((g: any) => okPos(g) && typeof g.node === "string") : [...DEFAULT_DECOR.gates];
  const roads: RoadItem[] = Array.isArray(v?.roads)
    ? v.roads.filter((r: any) => r && typeof r.kind === "string" && Array.isArray(r.pts)) : [];
  if (ver < DECOR_VERSION) {
    const hi = new Set(items.map((i) => i.id)), hg = new Set(gates.map((g) => g.id)), hr = new Set(roads.map((r) => r.id));
    DEFAULT_DECOR.items.forEach((i) => { if ((i.since ?? 1) > ver && !hi.has(i.id)) items.push(i); });
    DEFAULT_DECOR.gates.forEach((g) => { if ((g.since ?? 1) > ver && !hg.has(g.id)) gates.push(g); });
    DEFAULT_DECOR.roads.forEach((r) => { if ((r.since ?? 1) > ver && !hr.has(r.id)) roads.push(r); });
    if (ver < 4) gates = gates.map((g) => (g.id === "g5" ? { ...g, ped: true } : g)); // ประตูคนเดินไม่มีถนนต่อ
    if (ver < 5) gates = gates.map((g) => (g.id === "g5" ? { ...g, link: "rd:walk-in:4" } : g));
  }
  return { items, gates, roads, traffic: v?.traffic ?? DEFAULT_DECOR.traffic, grayRoad: v?.grayRoad ?? DEFAULT_DECOR.grayRoad, version: DECOR_VERSION };
}

/* ───────────── ประตูรั้ว ───────────── */
export interface GateDef {
  id: string; name: string; node: string; link?: string; main: boolean; width: number; color: string;
  h?: number; mode: "double" | "single" | "slide"; closed: boolean; ped: boolean;
  x: number; z: number; ang: number; out: XZ;
}
export function buildGates(defs: GateItem[]): GateDef[] {
  return defs.map((g) => {
    const f = fenceFrame(g.x, g.y);
    return { id: g.id, name: g.name, node: g.node, link: g.link, main: !!g.main, width: g.width, color: g.color, h: g.h, mode: g.mode ?? "double", closed: !!g.closed, ped: !!g.ped, x: f.x, z: f.z, ang: f.ang, out: f.out };
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

/* ───────────── ถนน (ตั้งค่าได้ใน DecorConfig.roads) ───────────── */
export const ROAD_W = 1.6;

/** แปลงจุด px เป็นเส้นทาง world — curve > 0 = ปรับให้โค้งเรียบ (Hermite/Catmull-Rom) */
export function sampleRoad(pts: [number, number][], curve = 0): XZ[] {
  const P = pts.map(([x, y]) => px(x, y));
  if (P.length < 3 || curve <= 0.01) return P;
  const out: XZ[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const m1x = (p2[0] - p0[0]) * 0.5 * curve, m1z = (p2[1] - p0[1]) * 0.5 * curve;
    const m2x = (p3[0] - p1[0]) * 0.5 * curve, m2z = (p3[1] - p1[1]) * 0.5 * curve;
    const N = 10;
    for (let k = 0; k < N; k++) {
      const t = k / N, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x, h00 * p1[1] + h10 * m1z + h01 * p2[1] + h11 * m2z]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}

/** ช่วงถนนซอยนอกรั้ว + ทางต่อจากประตู (ยกเว้นประตูคนเดิน) ไปยังถนนซอย */
export function outsideRoadSegs(roads: RoadItem[], gates: GateDef[]): { a: XZ; b: XZ }[] {
  const segs: { a: XZ; b: XZ }[] = [];
  roads.filter((r) => r.kind === "soi").forEach((r) => {
    const pl = sampleRoad(r.pts, r.curve ?? 0);
    for (let i = 0; i < pl.length - 1; i++) segs.push({ a: pl[i], b: pl[i + 1] });
  });
  const roadSegs = [...segs];
  gates.filter((g) => !g.ped).forEach((g) => {
    let best: { d: number; q: XZ } = { d: Infinity, q: [g.x, g.z] };
    roadSegs.forEach(({ a, b }) => {
      const vx = b[0] - a[0], vz = b[1] - a[1];
      const L2 = vx * vx + vz * vz || 1;
      const t = Math.min(1, Math.max(0, ((g.x - a[0]) * vx + (g.z - a[1]) * vz) / L2));
      const q: XZ = [a[0] + vx * t, a[1] + vz * t];
      const d = Math.hypot(g.x - q[0], g.z - q[1]);
      if (d < best.d) best = { d, q };
    });
    if (best.d > 0.2 && best.d < 8) segs.push({ a: [g.x, g.z], b: best.q });
  });
  return segs;
}

/** เพิ่มโหนด/เส้นทางจากถนนเทาและฟุตบาทที่ตั้งค่าไว้ เพื่อให้หุ่นนำทางเดินผ่านได้ (ต่อปลายเข้ากับโหนดเดิมที่ใกล้ที่สุด) */
export function withRoadNodes(nodes: MapNode[], edges: MapEdge[], roads: RoadItem[]) {
  const ns = [...nodes], es = [...edges];
  roads.filter((r) => r.kind === "gray" || r.kind === "walk").forEach((r) => {
    const ids = r.pts.map((_, i) => `rd:${r.id}:${i}`);
    r.pts.forEach((p, i) => {
      const [x, z] = px(p[0], p[1]);
      ns.push({ id: ids[i], x, z });
      if (i > 0) es.push({ a: ids[i - 1], b: ids[i] });
    });
    [0, r.pts.length - 1].forEach((k) => {
      const [x, z] = px(r.pts[k][0], r.pts[k][1]);
      let best = "", bd = 1.6;
      nodes.forEach((n) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n.id; } });
      if (best) es.push({ a: ids[k], b: best });
    });
  });
  return { nodes: ns, edges: es };
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
