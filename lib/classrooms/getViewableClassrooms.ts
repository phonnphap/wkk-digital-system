import type { SupabaseClient } from "@supabase/supabase-js";

// ใช้เงื่อนไขเดียวกับ app/admin/settings/page.tsx
export const ADMIN_ROLES = ["admin", "director", "deputy_director"];
export const ADMIN_EMAILS = ["sumalin@khienkhet.ac.th", "phonnapha@khienkhet.ac.th"];

export type ViewableClassroom = {
  classroom_id: string;
  room_name: string;
  room_number?: number;
};

export async function isAdminViewer(supabase: SupabaseClient<any, any, any>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const email = (user.email || user.user_metadata?.email || "").trim().toLowerCase();
  const { data: profile } = await supabase
    .from("users").select("role").eq("auth_id", user.id).maybeSingle();
  return !!(
    (profile?.role && ADMIN_ROLES.includes(profile.role)) ||
    (email && ADMIN_EMAILS.includes(email))
  );
}

/**
 * แอดมิน -> ทุกห้องของปีการศึกษาปัจจุบัน (รวมทั้งสองเทอมของห้องที่แยกเทอม)
 * ครู   -> เฉพาะห้องที่เป็นครูประจำชั้น (get_my_classrooms เหมือนเดิม)
 */
export async function getViewableClassrooms(
  supabase: SupabaseClient<any, any, any>
): Promise<{ classrooms: ViewableClassroom[]; isAdmin: boolean }> {
  const isAdmin = await isAdminViewer(supabase);

  if (!isAdmin) {
    const { data } = await supabase.rpc("get_my_classrooms");
    return { classrooms: (data ?? []) as ViewableClassroom[], isAdmin: false };
  }

  const { data: years } = await supabase
    .from("academic_years").select("id, year_name, is_current");
  const cur = (years ?? []).find((y: any) => y.is_current);
  const yearIds = (years ?? [])
    .filter((y: any) => (cur ? y.year_name === cur.year_name : true))
    .map((y: any) => y.id);

  const { data: rooms } = await supabase
    .from("classrooms")
    .select("id, room_name")
    .in("academic_year_id", yearIds.length ? yearIds : ["_none_"]);

  const classrooms: ViewableClassroom[] = (rooms ?? [])
    .map((r: any) => ({ classroom_id: r.id, room_name: r.room_name }))
    .sort((a, b) => a.room_name.localeCompare(b.room_name, "th", { numeric: true }));

  return { classrooms, isAdmin: true };
}