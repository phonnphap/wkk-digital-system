import { NextResponse } from "next/server";
import { db, limited, clientIp } from "@/lib/admission-server";

export const runtime = "nodejs";
const j = (body: any, status = 200) => NextResponse.json(body, { status });

export async function POST(req: Request) {
  if (limited("lk:" + clientIp(req), 20)) return j({ ok: false, error: "ค้นหาบ่อยเกินไป กรุณารอสักครู่" }, 429);
  const b = await req.json().catch(() => ({}));

  // ── ประกาศคะแนน/ผล แบบรายการ (ไม่แสดงชื่อ แสดงเฉพาะเลขที่นั่งสอบ) ──
  if (b.action === "board") {
    const { data: round } = await db.from("admission_rounds").select("*")
      .eq("level", b.level).order("academic_year", { ascending: false }).limit(1).maybeSingle();
    if (!round?.scores_published) return j({ ok: true, published: false, rows: [], note: round?.note ?? null });
    const { data } = await db.from("admission_applications")
      .select("exam_no,program,zone,exam_total,exam_rank,result")
      .eq("academic_year", round.academic_year).eq("level", b.level)
      .not("exam_total", "is", null).order("exam_rank", { ascending: true, nullsFirst: false });
    const rows = (data ?? []).map((r) => ({ ...r, result: round.results_published ? r.result : null,
      exam_rank: round.results_published ? r.exam_rank : null }));
    return j({ ok: true, published: true, resultsPublished: round.results_published, year: round.academic_year, rows, note: round.note });
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
    db.from("admission_documents").select("doc_type,status,note,uploaded_at").eq("application_id", app.id),
    db.from("admission_rounds").select("scores_published,results_published,note")
      .eq("academic_year", app.academic_year).eq("level", app.level).maybeSingle(),
  ]);

  const res: any = {
    ok: true,
    app: {
      id: app.id, edit_token: app.edit_token, application_no: app.application_no,
      level: app.level, program: app.program, zone: app.zone, academic_year: app.academic_year,
      prefix: app.prefix, first_name: app.first_name, last_name: app.last_name,
      status: app.status, fix_note: app.fix_note, exam_no: app.exam_no,
    },
    docs: docs ?? [],
    note: round?.note ?? null,
  };
  if (round?.scores_published && app.exam_total != null) res.scores = { by_subject: app.scores, total: app.exam_total };
  if (round?.results_published) res.result = { result: app.result, rank: app.exam_rank };
  return j(res);
}