// app/api/goout-notify/route.ts
// รับ event จากหน้า /goout → คำนวณผู้รับ + ข้อความ → ส่งต่อให้ Power Automate flow "goout" โพสต์ลง Teams
//
// ต้องตั้ง Environment variables (Vercel / .env.local):
//   NEXT_PUBLIC_SUPABASE_URL        (มีอยู่แล้ว)
//   SUPABASE_SERVICE_ROLE_KEY       (คีย์ฝั่งเซิร์ฟเวอร์ ห้ามขึ้นต้น NEXT_PUBLIC_)
//   POWER_AUTOMATE_GOOUT_URL        (HTTP POST URL ของ flow "goout")
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const APPROVER_2_EMAIL = "titima@khienkhet.ac.th";
type Event = "submitted" | "edited" | "approved" | "rejected" | "substituted" | "cancelled" | "ping";

const name = (u: any) => `${u?.title ?? ""}${u?.first_name ?? ""} ${u?.last_name ?? ""}`.replace(/\s+/g, " ").trim();
const thDate = (d: string) =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });

async function postToFlow(payload: any) {
  const url = process.env.POWER_AUTOMATE_GOOUT_URL;
  if (!url) throw new Error("POWER_AUTOMATE_GOOUT_URL is not set");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`flow HTTP ${res.status}: ${await res.text().catch(() => "")}`);
}

export async function POST(req: NextRequest) {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // ── ping: ใช้กัน flow ถูกปิดเพราะไม่มีการทำงานนาน 90 วัน (เรียกจาก cron — ดูคู่มือ) ──
    const body = await req.json().catch(() => ({}));
    if (body.event === "ping") {
      if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ ok: false }, { status: 401 });
      await postToFlow({ event: "ping", recipients: [], title: "", message: "" });
      return NextResponse.json({ ok: true });
    }

    // ── ตรวจผู้เรียก ──
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: au } = await sb.auth.getUser(token);
    if (!au?.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const event = body.event as Event;
    const { data: r } = await sb.from("out_requests").select("*").eq("id", body.outId).maybeSingle();
    if (!r) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

    const { data: requester } = await sb.from("users").select("id,title,first_name,last_name,email,grade_level").eq("id", r.user_id).maybeSingle();
    const { data: caller } = await sb.from("users").select("id,email,extra_roles,grade_level").eq("auth_id", au.user.id).maybeSingle();
    const callerOk = caller && (caller.id === r.user_id || caller.email?.toLowerCase().includes("@khienkhet.ac.th"));
    if (!callerOk) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    // หัวหน้าสายชั้นของผู้ขอ (ไม่นับผู้ขอเอง)
    const { data: heads } = requester?.grade_level
      ? await sb.from("users").select("id,email,extra_roles").eq("grade_level", requester.grade_level).neq("id", r.user_id)
      : { data: [] as any[] };
    const headEmails = (heads ?? []).filter((h: any) => (h.extra_roles ?? []).includes("grade_head")).map((h: any) => h.email);

    const who = name(requester);
    const when = `${thDate(r.request_date)} เวลา ${String(r.planned_start).slice(0, 5)}–${String(r.planned_end).slice(0, 5)} น. (${r.planned_hours} ชม.)`;
    const detail = `${who}<br>📅 ${when}<br>📍 ${r.destination}<br>📝 ${r.purpose}`;

    let recipients: string[] = []; let title = ""; let message = detail;
    switch (event) {
      case "submitted": case "edited":
        recipients = [...headEmails, APPROVER_2_EMAIL];
        title = event === "submitted" ? "🚪 มีคำขอออกนอกบริเวณโรงเรียน" : "✏️ มีการแก้ไขคำขอออกนอกโรงเรียน";
        message += "<br>กรุณาเข้าระบบเพื่อพิจารณา: https://system.khienkhet.ac.th/goout"; break;
      case "approved":
        recipients = [requester?.email, ...headEmails]; title = "✅ อนุญาตให้ออกนอกบริเวณโรงเรียนแล้ว"; break;
      case "rejected":
        recipients = [requester?.email, ...headEmails]; title = "❌ ไม่อนุญาตให้ออกนอกบริเวณโรงเรียน";
        message += `<br>เหตุผล: ${body.reason ?? r.reject_reason ?? "-"}`; break;
      case "cancelled":
        recipients = [requester?.email, ...headEmails, APPROVER_2_EMAIL]; title = "🚫 ยกเลิกคำขอออกนอกโรงเรียน"; break;
      case "substituted": {
        const { data: subs } = await sb.from("substitution_records").select("substitute_teacher_id").eq("out_request_id", r.id).neq("status", "cancelled");
        const ids = Array.from(new Set((subs ?? []).map((s: any) => s.substitute_teacher_id).filter(Boolean)));
        const { data: tu } = ids.length ? await sb.from("users").select("email").in("id", ids) : { data: [] as any[] };
        recipients = [...(tu ?? []).map((t: any) => t.email), requester?.email];
        title = "🔄 มีการจัดครูสอนแทน (ออกนอกโรงเรียน)"; break;
      }
      default: return NextResponse.json({ ok: false, error: "bad event" }, { status: 400 });
    }
    recipients = Array.from(new Set(recipients.filter(Boolean))) as string[];
    if (recipients.length) await postToFlow({ event, recipients, title, message });
    return NextResponse.json({ ok: true, sent: recipients.length });
  } catch (e: any) {
    console.error("[goout-notify]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}