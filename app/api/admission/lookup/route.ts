// 📁 วางที่: app/api/admission/lookup/route.ts  [ทับของเดิม]
import { NextResponse } from "next/server";
import { db, limited, clientIp } from "@/lib/admission-server";

export const runtime = "nodejs";
const j = (body: any, status = 200) => NextResponse.json(body, { status });

/** ประกาศแล้วเมื่อ: เจ้าหน้าที่กดประกาศเอง หรือ ถึงเวลาที่ตั้งไว้แล้ว */
const isPub = (flag?: boolean | null, at?: string | null) => !!flag || (!!at && Date.now() >= +new Date(at));
const sched = (r: any) => ({
  program: r.program, exam_date: r.exam_date, scores_announce_at: r.scores_announce_at,
  results_announce_at: r.results_announce_at, report_start: r.report_start, report_end: r.report_end,
  scores_published: isPub(r.scores_published, r.scores_announce_at),
  results_published: isPub(r.results_published, r.results_announce_at),
});

export async function POST(req: Request) {
  if (limited("lk:" + clientIp(req), 20)) return j({ ok: false, error: "ค้นหาบ่อยเกินไป กรุณารอสักครู่" }, 429);
  const b = await req.json().catch(() => ({}));

  // ── ประกาศคะแนน/ผล แบบรายการ แยกตามห้อง (ไม่แสดงชื่อ แสดงเฉพาะเลขที่นั่งสอบ) ──
  if (b.action === "board") {
    const { data: latest } = await db.from("admission_rounds").select("academic_year")
      .eq("level", b.level).order("academic_year", { ascending: false }).limit(1).maybeSingle();
    if (!latest) return j({ ok: true, rounds: [], rows: [] });
    const { data: rounds } = await db.from("admission_rounds").select("*")
      .eq("level", b.level).eq("academic_year", latest.academic_year);
    const rs = (rounds ?? []).map((r) => ({ ...sched(r), note: r.note }));
    const shown = rs.filter((r) => r.scores_published).map((r) => r.program);
    let rows: any[] = [];
    if (shown.length) {
      const { data } = await db.from("admission_applications")
        .select("exam_no,program,zone,exam_total,exam_rank,result")
        .eq("academic_year", latest.academic_year).eq("level", b.level).in("program", shown)
        .not("exam_total", "is", null).order("exam_rank", { ascending: true, nullsFirst: false });
      const resPub = new Set(rs.filter((r) => r.results_published).map((r) => r.program));
      rows = (data ?? []).map((r) => resPub.has(r.program) ? r : { ...r, result: null, exam_rank: null });
    }
    return j({ ok: true, year: latest.academic_year, rounds: rs, rows });
  }

  // ── ตรวจสอบตัวตนด้วย เลขบัตร + วันเกิด ──
  const idcard = String(b.idcard || "");
  const birthdate = String(b.birthdate || "");
  if (!/^\d{13}$/.test(idcard) || !birthdate) return j({ ok: false, error: "กรอกเลขบัตรประชาชน 13 หลักและวันเกิดให้ครบ" }, 400);

  const { data: app } = await db.from("admission_applications").select("*")
    .eq("idcard", idcard).eq("birthdate", birthdate)
    .order("academic_year", { ascending: false }).limit(1).maybeSingle();
  if (!app) return j({ ok: false, error: "ไม่พบใบสมัคร ตรวจสอบเลขบัตรประชาชนและวันเกิดอีกครั้ง" }, 404);

  if (b.action === "resubmit") {
    if (app.status !== "need_fix") return j({ ok: false, error: "ใบสมัครนี้ไม่ได้อยู่ในสถานะต้องแก้ไข" }, 400);
    await db.from("admission_applications").update({ status: "submitted" }).eq("id", app.id);
    return j({ ok: true });
  }

  const [{ data: docs }, { data: round }] = await Promise.all([
    db.from("admission_documents").select("doc_type,status,note,uploaded_at,file_name").eq("application_id", app.id),
    db.from("admission_rounds").select("*")
      .eq("academic_year", app.academic_year).eq("level", app.level).eq("program", app.program).maybeSingle(),
  ]);

  const s = round ? sched(round) : null;
  const res: any = {
    ok: true,
    app: {
      id: app.id, edit_token: app.edit_token, application_no: app.application_no,
      level: app.level, program: app.program, zone: app.zone, academic_year: app.academic_year,
      prefix: app.prefix, first_name: app.first_name, last_name: app.last_name,
      status: app.status, fix_note: app.fix_note, exam_no: app.exam_no,
      father_status: app.father?.status ?? "alive", mother_status: app.mother?.status ?? "alive",
    },
    docs: docs ?? [],
    note: round?.note ?? null,
    schedule: s,
  };
  if (s?.scores_published && app.exam_total != null) res.scores = { by_subject: app.scores, total: app.exam_total };
  if (s?.results_published) res.result = { result: app.result, rank: app.exam_rank };
  return j(res);
}
