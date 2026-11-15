// สร้างไฟล์ Excel เช็กลิสต์ทุกห้อง: npx tsx scripts/gen-room-files.ts [โฟลเดอร์ปลายทาง]
// ผลลัพธ์: <โฟลเดอร์>/all = ทุกห้อง, <โฟลเดอร์>/new = เฉพาะห้องใหม่/ห้องที่เปลี่ยนชื่อ (ใช้แจกเพิ่ม)
// ชื่อห้องต้องตรงกับตาราง asset_locations — ถ้าแก้ชื่อ/เพิ่มห้อง ให้ใช้หน้า /assets/room-files ในระบบ (อ่านชื่อจากฐานข้อมูลจริง)
import fs from "node:fs";
import { buildRoomWorkbook, type RoomKind } from "../lib/roomChecklist";

type R = { name: string; kind: RoomKind; dir: string; place: string; isNew?: boolean };
const rooms: R[] = [];
const classroomBuilding = (n: string) => {
  const m = n.match(/^(อ|ป|ม)\.(\d)\/(\d)$/); if (!m) return "";
  const g = +m[2], r = +m[3];
  if (m[1] === "อ") return "อาคาร 6";
  if (m[1] === "ม") return g === 1 || g >= 4 ? "อาคาร 4" : "อาคาร 5";
  if (r <= 3) return "อาคาร 9";
  return g <= 2 ? "อาคาร 2" : g <= 5 ? "อาคาร 1" : "อาคาร 3";
};
const cls = (n: string, dir: string) => rooms.push({ name: n, kind: "classroom", dir, place: classroomBuilding(n) });
for (const l of [2, 3]) for (let r = 1; r <= 4; r++) cls(`อ.${l}/${r}`, "1-อนุบาล");
for (let l = 1; l <= 6; l++) for (let r = 1; r <= 7; r++) cls(`ป.${l}/${r}`, "2-ประถมศึกษา");
for (let l = 1; l <= 6; l++) for (let r = 1; r <= (l <= 3 ? 7 : 3); r++) cls(`ม.${l}/${r}`, "3-มัธยมศึกษา");

const LAB = "4-ห้องพิเศษ", OFF = "5-สำนักงาน";
const add = (dir: string, name: string, place = "", isNew = false) => rooms.push({ name, kind: "other", dir, place, isNew });
// ห้องเดิม (ห้องที่ชื่อเปลี่ยนจากชุดแรก ถือเป็นไฟล์ใหม่)
add(LAB, "ห้องคอมพิวเตอร์ 9102", "อาคาร 9 · ชั้น 1", true); add(LAB, "ห้องคอมพิวเตอร์ 9103", "อาคาร 9 · ชั้น 1", true); add(LAB, "ห้องคอมพิวเตอร์ 9104", "อาคาร 9 · ชั้น 1", true);
add(LAB, "ห้องคอมพิวเตอร์ 4201", "อาคาร 4 · ชั้น 2", true); add(LAB, "ห้องคอมพิวเตอร์ 4301", "อาคาร 4 · ชั้น 3", true); add(LAB, "ห้องคอมพิวเตอร์ 4401", "อาคาร 4 · ชั้น 4", true);
add(LAB, "ห้องภาษาอังกฤษ"); add(LAB, "ห้องวิทยาศาสตร์ ม.ต้น", "อาคาร 3", true); add(LAB, "ห้องนาฏศิลป์"); add(LAB, "ห้องดนตรี", "หอประชุมปาริชาติ"); add(LAB, "ห้องพละ");
["ฝ่ายบริหารวิชาการ", "ฝ่ายบริหารงบประมาณ", "ฝ่ายบริหารงานบุคคล", "ฝ่ายบริหารทั่วไป", "ห้อง ผอ.", "โดม", "ห้องน้ำ", "โรงอาหาร"].forEach((n) => add(OFF, n));
add(OFF, "หอประชุมปาริชาติ", "หอประชุมปาริชาติ", true); add(OFF, "ห้องพยาบาล", "อาคาร 1"); add(OFF, "ห้องสมุด", "อาคารห้องสมุด");
// ห้องที่เพิ่มใหม่ (ตรงกับ supabase/asset_system_v9_rooms.sql)
[["ห้องพักครูประถม", "อาคาร 1", OFF], ["ห้องนาฏศิลป์ประถม", "อาคาร 1", LAB], ["ห้อง CFLP (อาคาร 1)", "อาคาร 1", LAB],
 ["ห้องปฏิบัติการดนตรีไทย", "อาคาร 3", LAB], ["ห้องลูกเสือ", "อาคาร 3", LAB], ["ห้องปฏิบัติการนาฏศิลป์มัธยม", "อาคาร 3", LAB], ["ห้องปฏิบัติการวิทยาศาสตร์ประถม", "อาคาร 3", LAB],
 ["ห้องพักครู ม.1 และ ม.ปลาย", "อาคาร 3", OFF], ["ห้องกิจการภาษาไทย/ศิลปะ", "อาคาร 3", LAB], ["ห้องแนะแนว", "อาคาร 3", OFF], ["ห้องปฏิบัติการงานอาชีพ", "อาคาร 3", LAB],
 ["ห้อง CFLP (อาคาร 3)", "อาคาร 3", LAB], ["ห้องจริยธรรม", "อาคาร 3", LAB], ["ห้องปฏิบัติการ Fablab", "อาคาร 4", LAB], ["ห้องปฏิบัติการฟิสิกส์", "อาคาร 4", LAB],
 ["ห้องปฏิบัติการคณิตศาสตร์", "อาคาร 4", LAB], ["ห้องพักครู ม.2-3", "อาคาร 5", OFF], ["ห้องปฏิบัติการชีววิทยา", "อาคาร 5", LAB], ["ห้องศิลปะมัธยม", "อาคาร 5", LAB],
 ["ห้องปฏิบัติการเคมี", "อาคาร 5", LAB], ["ห้องศูนย์เทคโนโลยีดิจิทัล", "อาคาร 9", LAB], ["ห้องสมุดชั้น 1", "อาคารห้องสมุด · ชั้น 1", OFF], ["ห้องสมุดชั้น 2", "อาคารห้องสมุด · ชั้น 2", OFF],
 ["ห้องสมุดชั้น 3", "อาคารห้องสมุด · ชั้น 3", OFF], ["ห้องคหกรรมอาหาร", "", LAB],
].forEach(([n, p, d]) => add(d, n, p, true));

(async () => {
  const out = process.argv[2] ?? "room-checklists";
  for (const r of rooms) {
    const wb = await buildRoomWorkbook(r.name, r.kind, r.place);
    const file = `${r.dir}/${r.name.replace(/\//g, "-")}.xlsx`;
    for (const set of r.isNew ? ["all", "new"] : ["all"]) { fs.mkdirSync(`${out}/${set}/${r.dir}`, { recursive: true }); await wb.xlsx.writeFile(`${out}/${set}/${file}`); }
  }
  console.log(`ทุกห้อง ${rooms.length} ไฟล์ · ห้องใหม่/เปลี่ยนชื่อ ${rooms.filter((r) => r.isNew).length} ไฟล์ → ${out}`);
})();
