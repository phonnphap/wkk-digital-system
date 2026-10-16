// ข้อมูลตั้งต้น (fallback) จากแผนผังโรงเรียน — ใช้เมื่อยังไม่ได้รัน SQL หรือ Supabase ว่าง
// พิกัดมาจาก pixel ของรูปแผนผัง: world = (pixel - center) / 30
export const FH = 1.2; // ความสูงต่อชั้น (หน่วย world)

export type LocKind = "building" | "facility" | "field" | "parking" | "gate";
export type XZ = [number, number];

export interface MapLocation {
  id: string;
  code: string;
  name: string;
  kind: LocKind;
  pos: XZ;       // จุดกึ่งกลาง
  size: XZ;      // [กว้าง x, ลึก z]
  color: string;
  floors: number;
  entrance: XZ;  // จุดทางเข้า
  building_id?: string | null;
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

const BLUE = "#4263eb", RED = "#e5484d", GREY = "#adb5bd", GREEN = "#2f9e44";

function L(
  code: string, name: string, kind: LocKind,
  cx: number, cy: number, w: number, h: number,
  color: string, floors: number, ex: number, ey: number
): MapLocation {
  return {
    id: `loc-${code}`, code, name, kind,
    pos: px(cx, cy), size: [w / 30, h / 30], color, floors,
    entrance: px(ex, ey),
  };
}

export const FALLBACK_LOCATIONS: MapLocation[] = [
  L("1", "อาคาร 1 เจริญเบิกฟ้า", "building", 303, 365, 38, 290, BLUE, 3, 270, 360),
  L("2", "อาคาร 2 วิริยะประชานุสรณ์", "building", 228, 596, 125, 32, BLUE, 3, 170, 575),
  L("3", "อาคาร 3 เฉลิมพระเกียรติ", "building", 422, 247, 195, 45, BLUE, 3, 421, 290),
  L("4", "อาคาร 4 พระองค์เจ้าสายสนิทวงศ์ ณ อยุธยา", "building", 350, 395, 70, 200, RED, 4, 350, 505),
  L("5", "อาคาร 5 องค์การบริหารส่วนจังหวัดปทุมธานี", "building", 498, 370, 60, 170, GREY, 3, 535, 370),
  L("6", "อาคาร 6 อาคารหม่อมหลวงฟ้อน สนิทวงศ์ ณ อยุธยา", "building", 572, 555, 110, 50, RED, 3, 560, 590),
  L("7", "อาคาร 7 อาคารหอสมุด", "building", 386, 572, 65, 47, BLUE, 2, 386, 545),
  L("8", "อาคาร 8 อาคารสำนักงาน", "building", 421, 301, 40, 42, RED, 2, 421, 330),
  L("9", "อาคาร 9 อาคาร มรว.สุวพรรณ สนิทวงศ์ ณ อยุธยา", "building", 136, 445, 58, 190, RED, 3, 150, 545),
  L("10", "หอประชุมปาริชาติ", "building", 165, 274, 134, 88, BLUE, 2, 200, 325),
  L("11", "โดมอเนกประสงค์ อาคาร 2 (ประถม)", "facility", 238, 557, 133, 55, GREEN, 1, 240, 522),
  L("12", "โดมอเนกประสงค์ อาคาร 6 (อนุบาล)", "facility", 557, 517, 65, 29, GREEN, 1, 540, 540),
  L("13", "โดมอเนกประสงค์ อบจ.", "facility", 439, 411, 62, 147, BLUE, 1, 415, 500),
  L("14", "สนามฟุตซอล", "field", 240, 462, 65, 100, GREEN, 0, 240, 515),
  L("15", "สนามบาสเกตบอล", "field", 232, 363, 59, 83, "#0b7285", 0, 232, 412),
  L("16", "ร้านสวัสดิการโรงเรียน", "facility", 313, 581, 45, 28, BLUE, 1, 313, 590),
  L("17", "ป้อมยาม", "gate", 457, 585, 16, 16, "#f59f00", 1, 457, 585),
  L("18", "ลานจอดรถ", "parking", 655, 305, 190, 110, "#868e96", 0, 650, 372),
];

const N = (id: string, x: number, y: number): MapNode => {
  const [wx, wz] = px(x, y);
  return { id, x: wx, z: wz };
};
export const FALLBACK_NODES: MapNode[] = [
  N("gate", 457, 585), N("plaza", 440, 525), N("w1", 400, 525), N("c1", 275, 520), N("w3", 195, 520),
  N("w4", 190, 420), N("w5", 190, 335), N("c2", 275, 420), N("c3", 275, 330), N("c4", 275, 275),
  N("m1", 400, 450), N("m2", 395, 380), N("m3", 395, 290), N("t1", 330, 275), N("t2", 470, 275), N("t3", 550, 275),
  N("e1", 500, 560), N("e2", 505, 500), N("e3", 565, 430), N("e4", 620, 400), N("r1", 545, 380), N("s1", 560, 590),
];
export const FALLBACK_EDGES: MapEdge[] = ([
  ["gate", "plaza"], ["plaza", "w1"], ["w1", "c1"], ["c1", "w3"], ["w3", "w4"], ["w4", "w5"],
  ["c1", "c2"], ["c2", "c3"], ["c3", "c4"], ["c4", "t1"], ["t1", "m3"], ["m3", "t2"], ["t2", "t3"],
  ["w1", "m1"], ["m1", "m2"], ["m2", "m3"], ["plaza", "e1"], ["e1", "e2"], ["e2", "e3"], ["e3", "e4"],
  ["e3", "r1"], ["r1", "t3"], ["gate", "s1"], ["w4", "c2"], ["w5", "c3"],
] as [string, string][]).map(([a, b]) => ({ a, b }));

// ── การวางผังภายในอาคาร (พิกัดสัดส่วน 0..1) ──────────────────────────
// ทางเดินกลางอยู่ที่ 0.5 ของแกนสั้น, บันไดอยู่ปลายแกนยาวด้านหนึ่ง
export const isLongX = (loc: MapLocation) => loc.size[0] >= loc.size[1];

/** จุดกึ่งกลางห้องในพิกัด world */
export function roomCenter(loc: MapLocation, room: MapRoom): [number, number, number] {
  return [
    loc.pos[0] + (room.x + room.w / 2 - 0.5) * loc.size[0],
    (room.level - 1) * FH,
    loc.pos[1] + (room.z + room.d / 2 - 0.5) * loc.size[1],
  ];
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