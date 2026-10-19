import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudentSession } from "@/lib/studentAuth";

export type Caller =
  | { kind: "staff" }
  | { kind: "student"; studentId: string; classroomId: string }
  | null;

export async function getCaller(): Promise<Caller> {
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await admin
      .from("users").select("id").eq("auth_id", user.id).maybeSingle();
    if (profile) return { kind: "staff" };
  }
  const session = await getStudentSession();
  if (!session) return null;
  const { data: student } = await admin
    .from("students")
    .select("id, classroom_id")
    .eq("id", session.student_id)
    .is("moved_out_at", null)
    .maybeSingle();
  if (!student) return null;
  return { kind: "student", studentId: student.id, classroomId: student.classroom_id };
}