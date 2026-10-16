// ข้อมูลตั้งต้น (fallback) จากแผนผังโรงเรียน — ใช้เมื่อยังไม่ได้รัน SQL หรือ Supabase ว่าง
// พิกัดมาจาก pixel ของรูปแผนผัง: world = (pixel - center) / 30
export const FH = 1.2; // ความสูงต่อชั้น (หน่วย world)

// dome = โดมกีฬา (หลังคาโค้ง พื้นสนาม ไม่มีผนัง)
export type LocKind = "building" | "facility" | "field" | "parking" | "gate" | "dome";
export type XZ = [number, number];

export interface MapLocation {
  id: string;
  code: string;
  name: string;
  kind: LocKind;
  pos: XZ;       // จุดกึ่งกลาง
  size: XZ;      // [กว้าง x, ลึก z] ก่อนหมุน
  color: string;
  floors: number;
  entrance: XZ;  // จุดทางเข้า (พิกัด world)
  building_id?: string | null;
  rot?: number;  // องศา หมุนอาคารรอบจุดกึ่งกลาง (ค่าลบ = ยกด้านขวาขึ้น ตามรั้วเฉียง)
}
export interface MapRoom {
  id: string;
  location_id: string;
  level: number;
  code: string;
  name: string;
  x: number; z: number; w: number; d: number; // สัดส่วน 0..1 ของพื้นที่อาคาร
  door: XZ;                                    // สัดส่วน 0..1
  placeholder?: boolean;
  type?: string;   // classroom | office | library | lab | toilet | hall | other
  desks?: number;  // จำนวนโต๊ะนักเรียน (เฉพาะ classroom)
}
export interface MapNode { id: string; x: number; z: number }
export interface MapEdge { a: string; b: string }

export const px = (x: number, y: number): XZ => [(x - 480) / 30, (y - 400) / 30];

/* ── การหมุนอาคาร ──
   rot = มุมของแกน x ของอาคารในระนาบ (x,z)  →  three.js ใช้ rotation.y = -rot */
export const rotRad = (l: { rot?: number }) => ((l.rot ?? 0) * Math.PI) / 180;

/** จากพิกัดในอาคาร (ก่อนหมุน, หน่วย world, 0,0 = กึ่งกลาง) → พิกัด world */
export function localToWorld(l: { pos: XZ; rot?: number }, lx: number, lz: number): XZ {
  const t = rotRad(l), c = Math.cos(t), s = Math.sin(t);
  return [l.pos[0] + lx * c - lz * s, l.pos[1] + lx * s + lz * c];
}
/** จากพิกัด world → พิกัดในอาคาร */
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

// ปรับตำแหน่งแล้ว: ไม่ทับกัน / 2,6,7,11,12 เอียงตามแนวรั้ว / 11,13 เป็นโดมกีฬา
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

/** โหนด/เส้นทางของประตูรั้ว (ต่อเข้าถนนในโรงเรียน) — ถ้า DB ไม่มี จะถูกเติมให้อัตโนมัติ */
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

// ── การวางผังภายในอาคาร (พิกัดสัดส่วน 0..1) ──────────────────────────
// ทางเดินกลางอยู่ที่ 0.5 ของแกนสั้น, บันไดอยู่ปลายแกนยาวด้านหนึ่ง
export const isLongX = (loc: MapLocation) => loc.size[0] >= loc.size[1];

/** จุดกึ่งกลางห้องในพิกัด world (รวมการหมุนอาคาร) */
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
export const stairsNorm = (loc: MapLocation): XZ => (isLongX(loc) ? [0.03, 0.5] : [0.5, 0.03]);
export const corridorNorm = (loc: MapLocation, p: XZ): XZ => (isLongX(loc) ? [p[0], 0.5] : [0.5, p[1]]);

/** สร้างห้องตัวอย่างอัตโนมัติ (ใช้เมื่อยังไม่มีข้อมูลห้องจริงใน map_rooms) */
export function genRooms(loc: MapLocation): MapRoom[] {
  if (loc.kind !== "building") return [];
  const longX = isLongX(loc);
  const longLen = Math.max(loc.size[0], loc.size[1]);
  const perSide = Math.max(2, Math.min(6, Math.round(longLen / 2)));
  const span = 0.86 / perSide;
  const out: MapRoom[] = [];
  const conv = (u: number, v: number): XZ => (longX ? [u, v] : [v, u]);
  for (let level = 1; level <= Math.max(loc.floors, 1); level++) {
    let n = 1;
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < perSide; i++) {
        const u0 = 0.1 + i * span;
        const v0 = side === 0 ? 0.04 : 0.58;
        const vLen = 0.38;
        const [x, z] = conv(u0, v0);
        const [w, d] = longX ? [span - 0.01, vLen] : [vLen, span - 0.01];
        const door = conv(u0 + (span - 0.01) / 2, side === 0 ? 0.42 : 0.58);
        const num = `${level}${String(n).padStart(2, "0")}`;
        out.push({
          id: `gen-${loc.code}-${level}-${n}`,
          location_id: loc.id, level,
          code: `${loc.code}-${num}`,
          name: `ห้อง ${loc.code}-${num}`,
          x, z, w, d, door, placeholder: true,
          type: roomType(loc, level),
          desks: roomType(loc, level) === "classroom" ? 30 : 0,
        });
        n++;
      }
    }
  }
  return out;
}