export type SectionCtx = {
  sectionId: string;
  previousSectionId?: string | null;
  isOwner: boolean;   // เป็น teacher_id / co_teacher_id ของ section นี้
  isViewer: boolean;  // อยู่ใน section_teacher_access
};

// แก้ชิ้นงาน/คะแนนได้ไหม
export function canEditAssignment(ctx: SectionCtx, userId: string, assignment: { created_by?: string | null }) {
  if (ctx.isOwner) return true;                       // ครูผู้สอนปัจจุบัน แก้ได้ทั้งหมดรวมที่สืบมาจากเทอม 1
  if (ctx.isViewer) return assignment.created_by === userId; // ครูเดิม แก้ได้เฉพาะชิ้นงานที่ตัวเองสร้าง
  return false;
}

// เช็คชื่อ: ครูเดิมแก้ได้เฉพาะของเทอม 1 (section เดิม)
export function canEditAttendance(ctx: SectionCtx, record: { section_id: string }) {
  if (ctx.isOwner) return true;
  if (ctx.isViewer) return !!ctx.previousSectionId && record.section_id === ctx.previousSectionId;
  return false;
}

// ชิ้นงานใหม่ / คะแนนใหม่ / เช็คชื่อเทอม 2: ครูเดิมทำไม่ได้
export const canCreateInSection = (ctx: SectionCtx) => ctx.isOwner;