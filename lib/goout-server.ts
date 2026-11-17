// lib/goout-server.ts  (ฝั่งเซิร์ฟเวอร์เท่านั้น — เทียบเท่า notifyLeaveTeams ใน leave-server)
import { admin } from "@/lib/leave-server";

export type GooutEvent = "submitted" | "edited" | "approved" | "rejected" | "substituted" | "cancelled";

export const GOOUT_APPROVER_2_EMAIL = "titima@khienkhet.ac.th";
export const GOOUT_APPROVER_3_EMAIL = "thananut@khienkhet.ac.th";

const nameOf = (u: any) => `${u?.title ?? ""}${u?.first_name ?? ""} ${u?.last_name ?? ""}`.replace(/\s+/g, " ").trim();
const thDate = (d: string) =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });

/** หัวหน้าสายชั้นของผู้ขอ (ไม่นับผู้ขอเอง) */
export async function gradeHeadsOfRequester(requester: { id: string; grade_level?: string | null }) {
  if (!requester.grade_level) return [] as { id: string; email: string }[];
  const { data } = await admin.from("users").select("id,email,extra_roles")
    .eq("grade_level", requester.grade_level).neq("id", requester.id);
  return ((data ?? []) as any[]).filter(h => (h.extra_roles ?? []).includes("grade_head")) as { id: string; email: string }[];
}

async function postToFlow(payload: unknown) {
  const url = process.env.POWER_AUTOMATE_GOOUT_URL;
  if (!url) throw new Error("POWER_AUTOMATE_GOOUT_URL is not set");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`flow HTTP ${res.status}: ${await res.text().catch(() => "")}`);
}

/** ยิง ping ให้ flow นับว่ามีการทำงาน (กันถูกปิดเพราะไม่ถูกเรียก 90 วัน) */
export async function pingGooutFlow() {
  await postToFlow({ event: "ping", recipients: [], title: "", message: "" });
}

export async function notifyGooutTeams(outId: string, event: GooutEvent, slot?: 1 | 2 | 3, reason?: string) {
  const { data: r } = await admin.from("out_requests").select("*").eq("id", outId).maybeSingle();
  if (!r) throw new Error("out_request not found");
  const { data: requester } = await admin.from("users")
    .select("id,title,first_name,last_name,email,grade_level").eq("id", (r as any).user_id).maybeSingle();
  if (!requester) throw new Error("requester not found");

  const heads = (await gradeHeadsOfRequester(requester as any)).map(h => h.email);
  const q: any = r;
  const detail =
    `${nameOf(requester)}<br>📅 ${thDate(q.request_date)} เวลา ${String(q.planned_start).slice(0, 5)}–${String(q.planned_end).slice(0, 5)} น. (${q.planned_hours} ชม.)` +
    `<br>📍 ${q.destination}<br>📝 ${q.purpose}`;

  let recipients: (string | null | undefined)[] = []; let title = ""; let message = detail;
  switch (event) {
    case "submitted": case "edited": // ยื่น/แก้ไข → หัวหน้าสายชั้น + รองฝ่ายบุคคล
      recipients = [...heads, GOOUT_APPROVER_2_EMAIL];
      title = event === "submitted" ? "🚪 มีคำขอออกนอกบริเวณโรงเรียน" : "✏️ มีการแก้ไขคำขอออกนอกโรงเรียน";
      message += "<br>กรุณาเข้าระบบเพื่อพิจารณา: https://system.khienkhet.ac.th/goout"; break;
    case "approved": // รองฝ่ายบุคคลอนุมัติครบ → ผู้ขอ + หัวหน้าสายชั้นของผู้ขอ
      recipients = [requester.email, ...heads]; title = "✅ อนุญาตให้ออกนอกบริเวณโรงเรียนแล้ว";
      message += "<br>อย่าลืมกดบันทึกเวลา ออก/กลับ ในระบบ"; break;
    case "rejected":
      recipients = [requester.email, ...heads]; title = "❌ ไม่อนุญาตให้ออกนอกบริเวณโรงเรียน";
      message += `<br>เหตุผล: ${reason ?? q.reject_reason ?? "-"}`; break;
    case "cancelled":
      recipients = [requester.email, ...heads, GOOUT_APPROVER_2_EMAIL]; title = "🚫 ยกเลิกคำขอออกนอกโรงเรียน"; break;
    case "substituted": {
      const { data: subs } = await admin.from("substitution_records").select("substitute_teacher_id")
        .eq("out_request_id", outId).neq("status", "cancelled");
      const ids = Array.from(new Set(((subs ?? []) as any[]).map(s => s.substitute_teacher_id).filter(Boolean)));
      const { data: tu } = ids.length ? await admin.from("users").select("email").in("id", ids) : { data: [] as any[] };
      recipients = [...((tu ?? []) as any[]).map(t => t.email), requester.email, ...heads];
      title = "🔄 มีการจัดครูสอนแทน (ออกนอกโรงเรียน)"; break;
    }
  }
  const list = Array.from(new Set(recipients.filter(Boolean))) as string[];
  if (list.length) await postToFlow({ event, recipients: list, title, message });
}