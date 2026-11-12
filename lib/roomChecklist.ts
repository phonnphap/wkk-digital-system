import ExcelJS from "exceljs";

export const SCHOOL = "โรงเรียนวัดเขียนเขต";
export type RoomKind = "classroom" | "other";

// [ชื่อรายการ, รหัสหมวด] รหัส "02-01" = มีเลขชนิดแล้ว, "02:ชื่อ" = ยังไม่มีเลขชนิด (ระบบออกเลขให้ตอนนำเข้า)
export const CLASSROOM_ITEMS: [string, string][] = [
  ["ชุดโต๊ะ-เก้าอี้นักเรียน", "02-01"], ["โต๊ะครู", "02-02"], ["เก้าอี้ครู", "02:เก้าอี้ครู"],
  ["ตู้เก็บเอกสาร", "01-01"], ["ตู้เหล็ก / ตู้เก็บของ", "01:ตู้เหล็ก"], ["ตู้ล็อกเกอร์", "01:ตู้ล็อกเกอร์"],
  ["กระดานไวท์บอร์ด", "02:กระดานไวท์บอร์ด (ห้องเรียน)"], ["โทรทัศน์", "07-02"],
  ["เครื่องมัลติมีเดียโปรเจคเตอร์", "07:เครื่องมัลติมีเดียโปรเจคเตอร์"], ["เครื่องปรับอากาศ (แอร์)", "01-08"], ["พัดลม", "01-11"],
  ["คอมพิวเตอร์ตั้งโต๊ะ", "13-03"], ["คอมพิวเตอร์โน้ตบุ๊ก", "13-02"], ["เครื่องพิมพ์", "13-01"],
  ["ลำโพง", "06-01"], ["ไมโครโฟน", "06-02"],
];
export const OTHER_ITEMS: [string, string][] = [
  ["ตู้เก็บเอกสาร", "01-01"], ["โต๊ะทำงาน", "01:โต๊ะทำงาน"], ["เก้าอี้ทำงาน", "01:เก้าอี้ทำงาน"], ["โต๊ะ (อื่นๆ)", "01-05"], ["เก้าอี้ (อื่นๆ)", "01-07"],
  ["เครื่องปรับอากาศ (แอร์)", "01-08"], ["พัดลม", "01-11"], ["โทรทัศน์", "07-02"],
  ["คอมพิวเตอร์ตั้งโต๊ะ", "13-03"], ["คอมพิวเตอร์โน้ตบุ๊ก", "13-02"], ["เครื่องพิมพ์", "13-01"],
  ["ลำโพง", "06-01"], ["ไมโครโฟน", "06-02"], ["ตู้เย็น", "09-04"],
];

const STATUS_LIST = '"ใช้งานอยู่,ชำรุดรอซ่อม,ส่งซ่อม,รอจำหน่าย,สูญหาย"';
const COND_LIST = '"ดี,พอใช้,ควรปรับปรุง"';
const TYPE_LIST = '"01 สำนักงาน,02 การศึกษา,03 ยานพาหนะ,04 การเกษตร,05 ก่อสร้าง,06 ไฟฟ้า-วิทยุ,07 โฆษณา,08 วิทยาศาสตร์-การแพทย์,09 งานบ้านงานครัว,10 กีฬา,11 สำรวจ,12 ดนตรี-นาฏศิลป์,13 คอมพิวเตอร์,14 สนาม"';
export const fiscalYearBE = (d = new Date()) => d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0);

const line = { style: "thin" as const, color: { argb: "FF94A3B8" } };
const box = { top: line, left: line, bottom: line, right: line };
const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

// ไฟล์เช็กลิสต์ประจำห้อง: ชีต "เช็กลิสต์" — ห้องอยู่ที่ B4, หัวตารางแถว 6, ตัวอย่างแถว 7, รายการเริ่มแถว 8 (ตัวนำเข้าอ่านตามตำแหน่งนี้ อย่าย้าย)
export async function buildRoomWorkbook(room: string, kind: RoomKind = "classroom"): Promise<ExcelJS.Workbook> {
  const items = kind === "classroom" ? CLASSROOM_ITEMS : OTHER_ITEMS;
  const FIRST = 8, EXTRA = 8, last = FIRST + items.length + EXTRA - 1;
  const wb = new ExcelJS.Workbook(); wb.creator = SCHOOL;
  const ws = wb.addWorksheet("เช็กลิสต์", { views: [{ state: "frozen", ySplit: 6 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = [7, 34, 11, 10, 38, 15, 14, 28, 22, 30].map((width) => ({ width }));

  ws.mergeCells("A1:H1"); Object.assign(ws.getCell("A1"), { value: `เช็กลิสต์ครุภัณฑ์ประจำห้อง ${room}`, font: { bold: true, size: 16 }, alignment: { horizontal: "center" } });
  ws.mergeCells("A2:H2"); Object.assign(ws.getCell("A2"), { value: `${SCHOOL} · ปีงบประมาณ ${fiscalYearBE()}`, alignment: { horizontal: "center" } });
  ws.mergeCells("A3:H3"); ws.getRow(3).height = 78;
  Object.assign(ws.getCell("A3"), { alignment: { wrapText: true, vertical: "top" }, fill: fill("FFEFF6FF"), value:
    "วิธีกรอก  ① ทุกรายการเลือก “มี” หรือ “ไม่มี” ในช่องสีเหลือง   ② ถ้ามี ใส่จำนวน\n" +
    "③ ถ้ามีเลขครุภัณฑ์ติดอยู่แล้ว ใส่ในช่อง “เลขครุภัณฑ์เดิม” (หลายเลขคั่นด้วย , หรือเขียนเป็นช่วง เช่น ขข 010564–010586/69)  ถ้าไม่มีเลข ให้เว้นว่าง ระบบจะออกเลขให้\n" +
    "④ เลือกสถานะและสภาพ (ถ้าเว้นว่าง = ใช้งานอยู่ / ดี)   ⑤ ของที่ไม่มีในรายการ ให้เพิ่มที่แถวว่างท้ายตาราง: พิมพ์ชื่อ แล้วเลือก “ประเภท”   ดูแถว “ตย.” เป็นตัวอย่าง" });
  ws.getCell("A4").value = "ห้อง:"; ws.getCell("A4").font = { bold: true };
  Object.assign(ws.getCell("B4"), { value: room, font: { bold: true, size: 13 } });

  const head = ["ที่", "รายการครุภัณฑ์", "มี / ไม่มี", "จำนวน", "เลขครุภัณฑ์เดิม (ถ้ามี)", "สถานะ", "สภาพ", "หมายเหตุ", "ประเภท (เฉพาะรายการที่เพิ่มเอง)", "รหัสหมวด (ระบบ)"];
  head.forEach((h, i) => Object.assign(ws.getRow(6).getCell(i + 1), { value: h, font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: fill("FF1E40AF"), border: box, alignment: { horizontal: "center", vertical: "middle", wrapText: true } }));
  ws.getRow(6).height = 36;
  ["ตย.", "ชุดโต๊ะ-เก้าอี้นักเรียน", "มี", 38, "ขข 010564–010586/69", "ใช้งานอยู่", "ดี", "ตัวอย่าง: มีเลข 23 ชุด ไม่มีเลข 15 ชุด (ระบบออกเลขให้ 15 ชุด)"].forEach((v, i) =>
    Object.assign(ws.getRow(7).getCell(i + 1), { value: v, font: { italic: true, color: { argb: "FF64748B" } }, fill: fill("FFF1F5F9"), border: box, alignment: { wrapText: true, vertical: "middle" } }));

  for (let r = FIRST; r <= last; r++) {
    const idx = r - FIRST, isExtra = idx >= items.length, row = ws.getRow(r);
    row.getCell(1).value = idx + 1;
    if (!isExtra) { row.getCell(2).value = items[idx][0]; row.getCell(10).value = items[idx][1]; }
    for (let c = 1; c <= 10; c++) { const cell = row.getCell(c); cell.border = box; cell.alignment = { vertical: "middle", wrapText: true }; }
    for (let c = 3; c <= 8; c++) { const cell = row.getCell(c); cell.fill = fill("FFFFFBEB"); cell.protection = { locked: false }; }
    if (isExtra) { row.getCell(2).fill = fill("FFFFFBEB"); row.getCell(2).protection = { locked: false }; row.getCell(9).fill = fill("FFFFFBEB"); row.getCell(9).protection = { locked: false }; row.getCell(9).dataValidation = { type: "list", allowBlank: true, formulae: [TYPE_LIST] } as ExcelJS.DataValidation; }
    row.getCell(3).dataValidation = { type: "list", allowBlank: true, formulae: ['"มี,ไม่มี"'] } as ExcelJS.DataValidation;
    row.getCell(4).dataValidation = { type: "whole", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: "จำนวน", error: "กรอกเป็นตัวเลขจำนวนเต็ม" } as ExcelJS.DataValidation;
    row.getCell(6).dataValidation = { type: "list", allowBlank: true, formulae: [STATUS_LIST] } as ExcelJS.DataValidation;
    row.getCell(7).dataValidation = { type: "list", allowBlank: true, formulae: [COND_LIST] } as ExcelJS.DataValidation;
  }
  ws.getColumn(10).hidden = true;
  ws.addConditionalFormatting({ ref: `A${FIRST}:H${last}`, rules: [
    { type: "expression", priority: 1, formulae: [`$C${FIRST}="ไม่มี"`], style: { font: { color: { argb: "FF9CA3AF" } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE5E7EB" } } } },
    { type: "expression", priority: 2, formulae: [`$C${FIRST}="มี"`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD1FAE5" } } } },
  ] } as unknown as ExcelJS.ConditionalFormattingOptions);
  await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true });
  return wb;
}
