// สร้างไฟล์ Excel เช็กลิสต์ทุกห้อง: npx tsx scripts/gen-room-files.ts [โฟลเดอร์ปลายทาง]
import fs from "node:fs";
import { buildRoomWorkbook, type RoomKind } from "../lib/roomChecklist";

const rooms: [string, RoomKind, string][] = [];
for (const l of [2, 3]) for (let r = 1; r <= 4; r++) rooms.push([`อ.${l}/${r}`, "classroom", "1-อนุบาล"]);
for (let l = 1; l <= 6; l++) for (let r = 1; r <= 7; r++) rooms.push([`ป.${l}/${r}`, "classroom", "2-ประถมศึกษา"]);
for (let l = 1; l <= 6; l++) for (let r = 1; r <= (l <= 3 ? 7 : 3); r++) rooms.push([`ม.${l}/${r}`, "classroom", "3-มัธยมศึกษา"]);
["ห้องคอมพิวเตอร์", "ห้องภาษาอังกฤษ", "ห้องวิทยาศาสตร์", "ห้องนาฏศิลป์", "ห้องดนตรี", "ห้องพละ"].forEach((n) => rooms.push([n, "other", "4-ห้องพิเศษ"]));
["ฝ่ายบริหารวิชาการ", "ฝ่ายบริหารงบประมาณ", "ฝ่ายบริหารงานบุคคล", "ฝ่ายบริหารทั่วไป", "ห้อง ผอ.", "หอประชุม", "โดม", "ห้องน้ำ", "โรงอาหาร", "ห้องพยาบาล", "ห้องสมุด"].forEach((n) => rooms.push([n, "other", "5-สำนักงาน"]));

(async () => {
  const out = process.argv[2] ?? "room-checklists";
  for (const [name, kind, dir] of rooms) {
    fs.mkdirSync(`${out}/${dir}`, { recursive: true });
    await (await buildRoomWorkbook(name, kind)).xlsx.writeFile(`${out}/${dir}/${name.replace(/\//g, "-")}.xlsx`);
  }
  console.log(`สร้างแล้ว ${rooms.length} ไฟล์ → ${out}`);
})();
