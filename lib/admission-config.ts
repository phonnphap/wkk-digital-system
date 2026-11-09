export type Level = "p1" | "m1" | "m4";
export type Program = "regular" | "mep" | "iep";
export type Zone = "in" | "out";

export const LEVELS: Record<Level, { label: string; code: string; prev: string }> = {
  p1: { label: "ป.1", code: "P1", prev: "อนุบาล/ศูนย์เด็กเล็กเดิม" },
  m1: { label: "ม.1", code: "M1", prev: "ป.6" },
  m4: { label: "ม.4", code: "M4", prev: "ม.3" },
};
export const PROGRAMS: Record<Program, string> = { regular: "ห้องเรียนปกติ", mep: "MEP", iep: "IEP" };
export const ZONES: Record<Zone, string> = { in: "ในเขต", out: "นอกเขต" };

/** OneDrive: general@khienkhet.ac.th → สมัครเรียน/{ระดับ}/{ห้อง}/{เขต}/{เลขที่ใบสมัคร_ชื่อ_สกุล}/{เอกสาร} */
export const ODRIVE_ROOT = "สมัครเรียน";
export const folderFor = (l: Level, p: Program, z: Zone) =>
  [ODRIVE_ROOT, LEVELS[l].label, PROGRAMS[p], ZONES[z]].join("/");

type Doc = { key: string; label: string; req: (l: Level, z: Zone) => boolean };
export const DOCS: Doc[] = [
  { key: "photo", label: "รูปถ่ายนักเรียน 1.5 นิ้ว (ไม่เกิน 6 เดือน)", req: () => true },
  { key: "house_student", label: "สำเนาทะเบียนบ้านนักเรียน", req: () => true },
  { key: "birth_cert", label: "สำเนาสูติบัตรนักเรียน", req: () => true },
  { key: "idcard_student", label: "สำเนาบัตรประชาชนนักเรียน", req: (l) => l !== "p1" },
  { key: "transcript_front", label: "ระเบียนผลการเรียน (ปพ.1) ด้านหน้า", req: (l) => l !== "p1" },
  { key: "transcript_back", label: "ระเบียนผลการเรียน (ปพ.1) ด้านหลัง", req: (l) => l !== "p1" },
  { key: "house_inzone", label: "ทะเบียนบ้านที่อยู่ในเขตบริการ (ผู้ปกครอง/ญาติ)", req: (_, z) => z === "in" },
  { key: "house_father", label: "สำเนาทะเบียนบ้านบิดา", req: () => false },
  { key: "idcard_father", label: "สำเนาบัตรประชาชนบิดา", req: () => false },
  { key: "house_mother", label: "สำเนาทะเบียนบ้านมารดา", req: () => false },
  { key: "idcard_mother", label: "สำเนาบัตรประชาชนมารดา", req: () => false },
  { key: "house_guardian", label: "สำเนาทะเบียนบ้านผู้ปกครอง", req: () => false },
  { key: "idcard_guardian", label: "สำเนาบัตรประชาชนผู้ปกครอง", req: () => false },
  { key: "extra", label: "เอกสารอื่น ๆ (เช่น ใบเปลี่ยนชื่อ, เกียรติบัตร)", req: () => false },
];
export const docsFor = (l: Level, z: Zone) => DOCS.map((d) => ({ ...d, required: d.req(l, z) }));

/** วิชาที่สอบ — ปรับได้ตามจริง */
export const SUBJECTS: Record<Level, string[]> = {
  p1: ["คะแนนรวม"],
  m1: ["คณิตศาสตร์", "วิทยาศาสตร์", "ภาษาอังกฤษ", "ภาษาไทย"],
  m4: ["คณิตศาสตร์", "วิทยาศาสตร์", "ภาษาอังกฤษ", "ภาษาไทย"],
};

export const STATUS: Record<string, { label: string; cls: string }> = {
  submitted: { label: "ส่งใบสมัครแล้ว รอตรวจ", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  reviewing: { label: "กำลังตรวจสอบเอกสาร", cls: "bg-blue-100 text-blue-700 border-blue-300" },
  need_fix: { label: "ต้องแก้ไขเอกสาร", cls: "bg-orange-100 text-orange-700 border-orange-300" },
  approved: { label: "เอกสารผ่าน", cls: "bg-green-100 text-green-700 border-green-300" },
  rejected: { label: "ไม่ผ่านการตรวจสอบ", cls: "bg-red-100 text-red-700 border-red-300" },
};
export const RESULT: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอประกาศ", cls: "bg-slate-100 text-slate-600 border-slate-300" },
  pass: { label: "ผ่านการคัดเลือก", cls: "bg-green-100 text-green-700 border-green-300" },
  reserve: { label: "ตัวสำรอง", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  fail: { label: "ไม่ผ่านการคัดเลือก", cls: "bg-red-100 text-red-700 border-red-300" },
};