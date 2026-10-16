// ข้อมูลตั้งต้น (fallback) จากแผนผังโรงเรียน — ใช้เมื่อยังไม่ได้รัน SQL หรือ Supabase ว่าง
// พิกัดมาจาก pixel ของรูปแผนผัง: world = (pixel - center) / 30
export const FH = 1.2; // ความสูงต่อชั้น (หน่วย world)

// dome = โดมกีฬา (หลังคาโค้ง พื้นสนาม ไม่มีผนัง)
export type LocKind = "building" | "facility" | "field" | "parking" | "gate" | "dome";
export type XZ = [number, number];
export type CorridorSide = "a" | "b";
export type StairsMode = "start" | "end" | "both";
export type ToiletMode = "none" | "m" | "f" | "mf" | "t" | "tmf";
export type StageMode = "none" | "start" | "end";

export interface MapLocation {
  id: string;
  code: string;
  name: string;
  kind: LocKind;
  pos: XZ;
  size: XZ;
  color: string;
  floors: number;
  entrance: XZ;
  building_id?: string | null;
  rot?: number;
  corridor?: CorridorSide;
  stairs?: StairsMode;
  perFloor?: number;   // จำนวนห้องต่อแถว (building: 0 = อัตโนมัติ, facility: 0 = ไม่มีห้องภายใน)
  toilet?: ToiletMode;
  stage?: StageMode;   // โดมกีฬา: เวทีอยู่ปลายด้านไหน
}
export interface MapRoom {
  id: string;
  location_id: string;
  level: number;
  code: string;
  name: string;
  x: number; z: number; w: number; d: number;
  door: XZ;
  placeholder?: boolean;
  type?: string;
  desks?: number;
  ac?: string;
}
export interface MapNode { id: string; x: number; z: number }
export interface MapEdge { a: string; b: string }

/** สถานที่ที่มีห้องภายในให้เข้าไปดู: อาคารเรียน หรืออาคารทั่วไปที่ตั้ง "ห้องต่อแถว" > 0 */
export const hasInterior = (l: { kind: LocKind; perFloor?: number }) =>
  l.kind === "building" || (l.kind === "facility" && (l.perFloor ?? 0) > 0);

export const px = (x: number, y: number): XZ => [(x - 480) / 30, (y - 400) / 30];

export const rotRad = (l: { rot?: number }) => ((l.rot ?? 0) * Math.PI) / 180;

export function localToWorld(l: { pos: XZ; rot?: number }, lx: number, lz: number): XZ {
  const t = rotRad(l), c = Math.cos(t), s = Math.sin(t);
  return [l.pos[0] + lx * c - lz * s, l.pos[1] + lx * s + lz * c];
}
export function worldToLocal(l: { pos: XZ; rot?: number }, wx: number, wz: number): XZ {
  const t = rotRad(l), c = Math.cos(t), s = Math.sin(t);
  const dx = wx - l.pos[0], dz = wz - l.pos[1];
  return [dx * c + dz * s, -dx * s + dz * c];
}

const BLUE = "#4263eb", RED = "#e5484d", GREY = "#adb5bd", GREEN = "#2f9e44";

function L(
  code: string, name: string, kind: LocKind,
  cx: number, cy: number, w: number, h: number,
  color: string, floors: number, ex: number, ey: number, rot = 0
): MapLocation {
  return {
    id: `loc-${code}`, code, name, kind,
    pos: px(cx, cy), size: [w / 30, h / 30], color, floors,
    entrance: px(ex, ey), rot,
  };
}

export const FALLBACK_LOCATIONS: MapLocation[] = [
  L("1", "อาคาร 1 เจริญเบิกฟ้า", "building", 303, 365, 38, 290, BLUE, 3, 270, 360),
  L("2", "อาคาร 2 วิริยะประชานุสรณ์", "building", 228, 588, 125, 32, BLUE, 3, 200, 573, -5.4),
  L("3", "อาคาร 3 เฉลิมพระเกียรติ", "building", 422, 247, 195, 45, BLUE, 3, 421, 290),
  L("4", "อาคาร 4 พระองค์เจ้าสายสนิทวงศ์ ณ อยุธยา", "building", 358, 395, 66, 200, RED, 4, 358, 505),
  L("5", "อาคาร 5 องค์การบริหารส่วนจังหวัดปทุมธานี", "building", 498, 370, 60, 170, GREY, 3, 535, 370),
  L("6", "อาคาร 6 อาคารหม่อมหลวงฟ้อน สนิทวงศ์ ณ อยุธยา", "building", 572, 538, 110, 50, RED, 3, 516, 545, -10.5),
  L("7", "อาคาร 7 อาคารหอสมุด", "building", 386, 566, 65, 47, BLUE, 2, 386, 538, -3.2),
  L("8", "อาคาร 8 อาคารสำนักงาน", "building", 421, 301, 40, 42, RED, 2, 421, 330),
  L("9", "อาคาร 9 อาคาร มรว.สุวพรรณ สนิทวงศ์ ณ อยุธยา", "building", 136, 445, 58, 190, RED, 3, 150, 545),
  L("10", "หอประชุมปาริชาติ", "building", 165, 274, 134, 88, BLUE, 2, 200, 325),
  L("11", "โดมอเนกประสงค์ อาคาร 2 (ประถม)", "dome", 238, 548, 133, 40, GREEN, 1, 240, 524, -5.4),
  L("12", "โดมอเนกประสงค์ อาคาร 6 (อนุบาล)", "facility", 560, 495, 65, 29, GREEN, 1, 527, 498, -10.5),
  L("13", "โดมอเนกประสงค์ อบจ.", "dome", 437, 411, 58, 147, BLUE, 1, 430, 490),
  L("14", "สนามฟุตซอล", "field", 240, 462, 65, 100, GREEN, 0, 240, 515),
  L("15", "สนามบาสเกตบอล", "field", 232, 363, 59, 83, "#0b7285", 0, 232, 412),
  L("16", "ร้านสวัสดิการโรงเรียน", "facility", 326, 578, 45, 28, BLUE, 1, 326, 561),
  L("17", "ป้อมยาม", "gate", 457, 579, 16, 16, "#f59f00", 1, 457, 579),
  L("18", "ลานจอดรถ", "parking", 655, 305, 190, 110, "#868e96", 0, 650, 372),
];

const N = (id: string, x: number, y: number): MapNode => {
  const [wx, wz] = px(x, y);
  return { id, x: wx, z: wz };
};

export const FALLBACK_GATE_NODES: MapNode[] = [
  N("gW", 96, 334), N("gE", 804, 339), N("p1", 730, 372), N("pk", 650, 372),
];
export const FALLBACK_GATE_EDGES: MapEdge[] = ([
  ["gW", "w5"], ["gE", "p1"], ["p1", "pk"], ["pk", "e4"],
] as [string, string][]).map(([a, b]) => ({ a, b }));

export const FALLBACK_NODES: MapNode[] = [
  N("gate", 457, 585), N("plaza", 440, 525), N("w1", 400, 525), N("c1", 275, 520), N("w3", 195, 520),
  N("w4", 190, 420), N("w5", 190, 335), N("c2", 275, 420), N("c3", 275, 330), N("c4", 275, 275),
  N("m1", 400, 450), N("m2", 395, 380), N("m3", 395, 290), N("t1", 330, 275), N("t2", 470, 275), N("t3", 550, 275),
  N("e1", 500, 560), N("e2", 505, 500), N("e3", 540, 430), N("e4", 620, 400), N("r1", 545, 380),
  ...FALLBACK_GATE_NODES,
];
export const FALLBACK_EDGES: MapEdge[] = ([
  ["gate", "plaza"], ["plaza", "w1"], ["w1", "c1"], ["c1", "w3"], ["w3", "w4"], ["w4", "w5"],
  ["c1", "c2"], ["c2", "c3"], ["c3", "c4"], ["c4", "t1"], ["t1", "m3"], ["m3", "t2"], ["t2", "t3"],
  ["w1", "m1"], ["m1", "m2"], ["m2", "m3"], ["plaza", "e1"], ["e1", "e2"], ["e2", "e3"], ["e3", "e4"],
  ["e3", "r1"], ["r1", "t3"], ["w4", "c2"], ["w5", "c3"],
] as [string, string][]).map(([a, b]) => ({ a, b })).concat(FALLBACK_GATE_EDGES);

// ── การวางผังภายในอาคาร ──
export const isLongX = (loc: MapLocation) => loc.size[0] >= loc.size[1];
export const CORRIDOR_W = 0.16;

export const TOILET_OPTIONS: Record<ToiletMode, { label: string; rooms: string[] }> = {
  none: { label: "ไม่มีห้องน้ำ", rooms: [] },
  m: { label: "ห้องน้ำชาย 1 ห้อง/ชั้น", rooms: ["ห้องน้ำชาย"] },
  f: { label: "ห้องน้ำหญิง 1 ห้อง/ชั้น", rooms: ["ห้องน้ำหญิง"] },
  mf: { label: "ชาย + หญิง 2 ห้อง/ชั้น", rooms: ["ห้องน้ำชาย", "ห้องน้ำหญิง"] },
  t: { label: "ห้องน้ำครู 1 ห้อง/ชั้น", rooms: ["ห้องน้ำครู"] },
  tmf: { label: "ห้องน้ำครู ชาย + หญิง 2 ห้อง/ชั้น", rooms: ["ห้องน้ำครูชาย", "ห้องน้ำครูหญิง"] },
};

export const longLen = (l: MapLocation) => Math.max(l.size[0], l.size[1]);
/** บันไดเล็กลง */
export const stairLen = (l: MapLocation) => Math.min(0.45, Math.max(0.24, longLen(l) * 0.045));
/** พื้นที่ห้องน้ำ "ต่อฝั่ง" คงที่ — ถ้ามีหลายห้อง (ชาย/หญิง) จะแบ่งกันในพื้นที่นี้ ไม่ขยายเพิ่ม */
export const toiletLen = (l: MapLocation) => Math.min(0.6, Math.max(0.32, longLen(l) * 0.07));

export const corridorV = (loc: MapLocation): number => (loc.corridor === "b" ? 1 - CORRIDOR_W / 2 : CORRIDOR_W / 2);

export const stairEnds = (loc: MapLocation): ("s" | "e")[] =>
  loc.stairs === "both" ? ["s", "e"] : loc.stairs === "end" ? ["e"] : ["s"];

/* ── ผังพิเศษรายอาคาร (ชั้นล่าง) ──
   เรียงจากปลาย "start" (แกนยาวด้านค่าน้อย: ซ้าย/บน) ไปปลาย "end"
   w = น้ำหนักความยาวห้อง (บันไดใช้ความยาวบันไดคงที่) ถ้าต้องการกลับด้านให้ .reverse() */
interface SegDef { k: "stairs" | "room"; name?: string; type?: string; w: number }
export interface SegPlaced extends SegDef { a: number; len: number }
const SPECIAL_LAYOUTS: Record<string, SegDef[]> = {
  "1": [
    { k: "stairs", w: 0 },
    { k: "room", name: "โรงอาหารใหญ่", type: "canteen", w: 2.4 },
    { k: "stairs", w: 0 },
    { k: "room", name: "ห้องกินข้าวครู", type: "canteen", w: 0.7 },
    { k: "room", name: "ห้องเรียน", type: "classroom", w: 1.1 },
    { k: "room", name: "ห้องพยาบาล", type: "nurse", w: 0.9 },
    { k: "room", name: "ห้องภาษาอังกฤษ", type: "classroom", w: 1.1 },
    { k: "room", name: "ห้องนาฏศิลป์", type: "other", w: 1.1 },
    { k: "stairs", w: 0 },
    { k: "room", name: "ห้องขายชุด นร.", type: "office", w: 0.8 },
    { k: "room", name: "ห้องพักครู", type: "office", w: 1.4 },
  ],
};
export const hasSpecialLayout = (loc: MapLocation) => loc.kind === "building" && !!SPECIAL_LAYOUTS[loc.code];

export function specialLayout(loc: MapLocation): SegPlaced[] | null {
  const def = loc.kind === "building" ? SPECIAL_LAYOUTS[loc.code] : undefined;
  if (!def) return null;
  const Lg = longLen(loc), SL = stairLen(loc);
  const nSt = def.filter((s) => s.k === "stairs").length;
  const totalW = def.filter((s) => s.k === "room").reduce((a, s) => a + s.w, 0);
  const free = Math.max(Lg - nSt * SL, 0.5);
  let a = 0;
  return def.map((s) => {
    const len = s.k === "stairs" ? SL : (s.w / totalW) * free;
    const out = { ...s, a, len };
    a += len;
    return out;
  });
}

/** ช่วงบันได: c = กึ่งกลางตามแกนยาว (เมตร world จากจุดกึ่งกลางอาคาร), dir = ทิศที่ขั้นบันไดสูงขึ้น */
export interface StairSpan { c: number; len: number; dir: 1 | -1 }
export function stairSpans(loc: MapLocation): StairSpan[] {
  const Lg = longLen(loc), SL = stairLen(loc);
  const sp = specialLayout(loc);
  if (sp) return sp.filter((s) => s.k === "stairs").map((s) => ({ c: s.a + s.len / 2 - Lg / 2, len: s.len, dir: -1 as const }));
  return stairEnds(loc).map((e) =>
    e === "s" ? { c: -Lg / 2 + SL / 2, len: SL, dir: -1 as const } : { c: Lg / 2 - SL / 2, len: SL, dir: 1 as const });
}

export function stairsList(loc: MapLocation): XZ[] {
  const v = corridorV(loc), Lg = longLen(loc);
  return stairSpans(loc).map((s) => {
    const u = (s.c + Lg / 2) / Lg;
    return (isLongX(loc) ? [u, v] : [v, u]) as XZ;
  });
}
export const stairsNorm = (loc: MapLocation): XZ => stairsList(loc)[0];

/** เลือกบันไดที่ทางรวม (ทางเข้า → บันได → ห้อง) สั้นที่สุด */
export function bestStair(loc: MapLocation, from: XZ, to: XZ): XZ {
  const k = isLongX(loc) ? 0 : 1;
  const cost = (s: XZ) => Math.abs(from[k] - s[k]) + Math.abs(s[k] - to[k]);
  return stairsList(loc).reduce((b, s) => (cost(s) < cost(b) ? s : b));
}
export const corridorNorm = (loc: MapLocation, p: XZ): XZ =>
  isLongX(loc) ? [p[0], corridorV(loc)] : [corridorV(loc), p[1]];

export function roomCenter(loc: MapLocation, room: MapRoom): [number, number, number] {
  const [wx, wz] = localToWorld(
    loc,
    (room.x + room.w / 2 - 0.5) * loc.size[0],
    (room.z + room.d / 2 - 0.5) * loc.size[1]
  );
  return [wx, (room.level - 1) * FH, wz];
}

function roomType(loc: MapLocation, level: number): string {
  if (loc.code === "8") return "office";
  if (loc.code === "7" && level === 1) return "library";
  if (loc.code === "10") return "hall";
  return "classroom";
}

/** สร้างห้องตัวอย่างอัตโนมัติ */
export function genRooms(loc: MapLocation): MapRoom[] {
  if (!hasInterior(loc)) return [];
  const longX = isLongX(loc);
  const Lg = longLen(loc);
  const sideB = loc.corridor === "b";
  const v0 = sideB ? 0 : CORRIDOR_W;
  const vLen = 1 - CORRIDOR_W;
  const doorV = sideB ? vLen - 0.01 : v0 + 0.01;
  const conv = (u: number, v: number): XZ => (longX ? [u, v] : [v, u]);
  const pad = (n: number) => String(n).padStart(2, "0");

  const out: MapRoom[] = [];
  const add = (level: number, tag: string, code: string, name: string, u0: number, len: number, type: string, desks: number) => {
    const [x, z] = conv(u0, v0);
    const [w, d] = longX ? [len, vLen] : [vLen, len];
    out.push({
      id: `gen-${loc.code}-${level}-${tag}`, location_id: loc.id, level, code, name,
      x, z, w, d, door: conv(u0 + len / 2, doorV), placeholder: true, type, desks, ac: "none",
    });
  };

  const sp = specialLayout(loc);
  const floors = Math.max(loc.floors, 1);

  // ── ผังพิเศษ (อาคาร 1 ฯลฯ)
  if (sp) {
    for (let level = 1; level <= floors; level++) {
      let n = 1;
      sp.forEach((s, i) => {
        if (s.k === "stairs") return;
        const u0 = s.a / Lg, len = s.len / Lg;
        if (level === 1) {
          const code = `${loc.code}-${level}${pad(n++)}`;
          add(level, `S${i}`, code, s.name ?? `ห้อง ${code}`, u0, len, s.type ?? "classroom", (s.type ?? "classroom") === "classroom" ? 30 : 0);
        } else {
          const parts = Math.max(1, Math.round(s.w / 1.2));
          for (let p = 0; p < parts; p++) {
            const code = `${loc.code}-${level}${pad(n++)}`;
            add(level, `S${i}-${p}`, code, `ห้อง ${code}`, u0 + (p * len) / parts, len / parts, "classroom", 30);
          }
        }
      });
    }
    return out;
  }

  // ── ผังปกติ: บันได → ห้องน้ำ (พื้นที่คงที่) → ห้องเรียนแบ่งเท่า ๆ กันเต็มพื้นที่ที่เหลือ
  const ends = stairEnds(loc);
  const names = TOILET_OPTIONS[loc.toilet ?? "none"].rooms;
  const SL = stairLen(loc), TL = toiletLen(loc);
  const perEnd: Record<"s" | "e", string[]> = { s: [], e: [] };
  if (ends.length === 2 && names.length === 2) { perEnd[ends[0]] = [names[0]]; perEnd[ends[1]] = [names[1]]; }
  else names.forEach((n) => perEnd[ends[0]].push(n));
  const resS = ends.includes("s") ? SL + (perEnd.s.length ? TL : 0) : 0;
  const resE = ends.includes("e") ? SL + (perEnd.e.length ? TL : 0) : 0;
  const uStart = resS / Lg, uEnd = 1 - resE / Lg;

  const avail = (uEnd - uStart) * Lg;
  const perRow = loc.perFloor && loc.perFloor > 0
    ? Math.round(loc.perFloor)
    : Math.max(2, Math.min(14, Math.round(avail / 1.2)));
  const span = (uEnd - uStart) / perRow;

  for (let level = 1; level <= floors; level++) {
    for (let i = 0; i < perRow; i++) {
      const num = `${level}${pad(i + 1)}`;
      add(level, String(i + 1), `${loc.code}-${num}`, `ห้อง ${loc.code}-${num}`, uStart + i * span, span,
        roomType(loc, level), roomType(loc, level) === "classroom" ? 30 : 0);
    }
    let tk = 1;
    (["s", "e"] as const).forEach((e) => {
      const list = perEnd[e], k = list.length;
      list.forEach((name, i) => {
        const each = TL / k;
        const off = SL + i * each;
        const u0 = e === "s" ? off / Lg : 1 - (off + each) / Lg;
        add(level, `T${tk}`, `${loc.code}-${level}T${tk}`, name, u0, each / Lg, "toilet", 0);
        tk++;
      });
    });
  }
  return out;
}