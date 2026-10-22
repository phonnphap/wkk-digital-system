import type { SupabaseClient } from "@supabase/supabase-js";

type TeacherRow = {
  prefix?: string | null;
  first_name: string;
  last_name: string;
  grade_level?: string | number | null;
  extra_roles?: string[] | string | null;
};

function hasGradeHeadRole(roles: TeacherRow["extra_roles"]): boolean {
  if (!roles) return false;
  if (Array.isArray(roles)) return roles.includes("grade_head");
  // เผื่อเก็บเป็น string เช่น '["grade_head"]' หรือ 'grade_head,xxx'
  return String(roles).includes("grade_head");
}

/**
 * หา หน.สายชั้น: ครูที่ extra_roles มี "grade_head"
 * และ grade_level ตรงกับของครูประจำชั้น
 */
export async function fetchGradeHeadName(
  supabase: SupabaseClient,
  gradeLevel: string | number | null | undefined
): Promise<string> {
  if (gradeLevel === null || gradeLevel === undefined || gradeLevel === "") return "";

  const { data, error } = await supabase
    .from("teachers")
    .select("prefix, first_name, last_name, grade_level, extra_roles")
    .eq("grade_level", gradeLevel);

  if (error || !data) return "";

  // กรองฝั่ง client เพื่อรองรับทั้ง array / jsonb / string
  const head = (data as TeacherRow[]).find(t => hasGradeHeadRole(t.extra_roles));
  if (!head) return "";

  return `${head.prefix ?? ""}${head.first_name} ${head.last_name}`.trim();
}