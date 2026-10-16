// ข้อมูลฉากตกแต่ง (รั้ว ประตู ต้นไม้ ศาลา สระ เสาธง) — พิกัดเป็น pixel ของรูปแผนผัง
// แก้ตัวเลขตรงนี้เพื่อเพิ่ม/ย้ายต้นไม้ ศาลา ประตู ฯลฯ ได้เลย
import { MapLocation, localToWorld, px, XZ } from "./schoolData";

/** แนวรั้วโรงเรียน (วนปิดรอบ) */
export const FENCE_PX: [number, number][] = [
  [92, 208], [560, 196], [752, 226], [770, 300], [838, 378],
  [895, 380], [900, 508], [445, 592], [338, 598], [105, 620],
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

/** จุดบนรั้วที่ใกล้ที่สุด + มุมของรั้วช่วงนั้น */
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

/** ประตูรั้ว: [id, ชื่อ, px, py, ความกว้าง(world), โหนดเส้นทาง, ประตูหลักหรือไม่] */
const GATES_PX: [string, string, number, number, number, string, boolean][] = [
  ["main", "ประตูหลัก", 457, 590, 2.4, "gate", true],
  ["east", "ประตูลานจอดรถ", 804, 339, 2.2, "gE", false],
  ["west", "ประตูหลังโรงเรียน", 96, 334, 1.8, "gW", false],
];

export interface GateDef {
  id: string; name: string; node: string; main: boolean; width: number;
  x: number; z: number;   // ตำแหน่งบนรั้ว (world)
  ang: number;            // มุมรั้ว ณ จุดนี้ (three: rotation.y = -ang)
  out: XZ;                // เวกเตอร์หน่วยชี้ออกนอกรั้ว
}

export const GATES: GateDef[] = GATES_PX.map(([id, name, x, y, width, node, main]) => {
  const s = snapFence(px(x, y));
  const n1: XZ = [-Math.sin(s.ang), Math.cos(s.ang)];
  const test: XZ = [s.pt[0] + n1[0] * 0.8, s.pt[1] + n1[1] * 0.8];
  const out: XZ = pointInPoly(test, FENCE) ? [-n1[0], -n1[1]] : n1;
  return { id, name, node, main, width, x: s.pt[0], z: s.pt[1], ang: s.ang, out };
});

/** (เก็บไว้เพื่อความเข้ากันได้กับโค้ดเดิม) */
export const GATE_GAP_CENTER: XZ = [GATES[0].x, GATES[0].z];
export const GATE_GAP_RADIUS = GATES[0].width / 2 + 0.25;

/** ต้นไม้: [x, y, ขนาด] */
export const TREES_PX: [number, number, number][] = [
  [560, 225, 1.1], [582, 232, 1.2], [606, 230, 1], [718, 238, 1.1], [690, 222, 0.9],
  [530, 296, 0.75], [541, 322, 0.75], [548, 342, 0.75],
  [398, 408, 0.65], [398, 440, 0.65], [398, 470, 0.65], [400, 498, 0.65],
  [281, 433, 0.7], [282, 450, 0.7], [281, 473, 0.7],
  [136, 586, 1.2], [118, 560, 1], [118, 300, 1], [120, 262, 1], [122, 225, 1],
  [250, 224, 1], [290, 226, 0.9], [330, 222, 0.9],
  [480, 300, 0.8], [650, 400, 0.9], [700, 420, 0.9], [760, 390, 1], [810, 400, 1],
  [640, 520, 1], [700, 540, 1.1], [760, 520, 1], [820, 505, 1.1], [860, 495, 1],
  [330, 540, 0.9], [495, 470, 0.8],
];

/** ศาลา/ที่นั่ง: [x, y, สีหลังคา] */
export const PAVILIONS_PX: [number, number, string][] = [
  [545, 311, "#3b5bdb"], [548, 350, "#3b5bdb"], [547, 385, "#3b5bdb"],
  [240, 222, "#e5484d"], [140, 548, "#e5484d"], [140, 606, "#e5484d"],
];

/** สระน้ำ/น้ำพุ */
export const POND = { cx: 590, cy: 445, w: 44, h: 56 };

/** เสาธง */
export const FLAG_PX: [number, number] = [478, 548];

/* ───────────── ตรวจผัง: อาคารทับกัน / เลยรั้ว ───────────── */
function corners(l: MapLocation): XZ[] {
  const [w, d] = l.size;
  return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as XZ[]).map(([x, z]) => localToWorld(l, x, z));
}
/** ความลึกที่ซ้อนกัน (SAT) — 0 = ไม่ซ้อน */
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

/** คืนรายการคำเตือน (ภาษาไทย) — ใช้แสดงในหน้าตั้งค่าแอดมินและ console */
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