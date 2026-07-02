// app/substitution/page.tsx
export const dynamic = 'force-dynamic';

// เปลี่ยนชื่อตอน Import ให้เป็นตัวพิมพ์ใหญ่ตามหลักของ React
import SubstitutionSystem from "@/components/substitutionsystem";
import { createClient } from "@/lib/supabase/server"; 

const NON_TEACHING_ROLES = ["admin", "director", "deputy_director", "staff"];

export default async function SubstitutionPage() {
  const supabase = await createClient(); 

  const { data: teacherData } = await supabase
    .from("users")
    .select("id, title, first_name, last_name, full_name, position, role, grade_level, department_id")
    .order("first_name");

  const teachers = ((teacherData as any[]) ?? [])
    .filter((t: any) => !NON_TEACHING_ROLES.includes(t.role ?? ""))
    .map((t: any) => ({
      ...t,
      full_name: t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim()
    }));

  const teacherMap: Record<string, any> = {};
  teachers.forEach((t: any) => {
    teacherMap[t.id] = t;
  });

  // แก้ไขตรงนี้เป็น <SubstitutionSystem /> (ตัวพิมพ์ใหญ่) เพื่อให้ส่ง Props ได้ถูกต้อง
  return <SubstitutionSystem teachers={teachers} teacherMap={teacherMap} />;
}