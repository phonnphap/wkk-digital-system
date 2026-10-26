// app/api/meals/report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { canEditRoom, fetchAll, getActor, listClassrooms, monthRange } from "@/lib/meals/server";
import {
  LEVEL_LABEL, LEVEL_ORDER, UNKNOWN_GRADE, currentMonth, milkEligible, parseGrade,
  type GradeInfo, type MealType, type ReportRow,
} from "@/lib/meals/shared";

type Scope = "school" | "level" | "grade" | "room";

// GET /api/meals/report?month=&type=&scope=school|level|grade|room&key=
//   school → แถวละ "ระดับ"      level → key = อนุบาล/ประถม/มัธยม, แถวละ "สายชั้น"
//   grade  → key = เช่น P4, แถวละ "ห้อง"      room → key = classroomId, 1 ห้อง
export async function GET(req: NextRequest) {
  try {
    const a = await getActor();
    if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!a.isAdmin && !a.isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const q = req.nextUrl.searchParams;
    const month = q.get("month") ?? currentMonth();
    const type: MealType = q.get("type") === "milk" ? "milk" : "lunch";
    const scope = (q.get("scope") ?? "school") as Scope;
    const key = q.get("key") ?? "";
    const { start, end } = monthRange(month);

    const all = (await listClassrooms(a, true))
      .map((r) => ({ ...r, g: (parseGrade(r.name) ?? UNKNOWN_GRADE) as GradeInfo }))
      .filter((r) => type === "lunch" || milkEligible(r.g));

    // ตัวเลือกให้เลือกใน dropdown
    const gradeMap = new Map<string, GradeInfo>();
    all.forEach((r) => gradeMap.set(r.g.key, r.g));
    const options = {
      levels: LEVEL_ORDER.filter((l) => all.some((r) => r.g.level === l)).map((l) => ({ key: l, label: LEVEL_LABEL[l] })),
      grades: [...gradeMap.values()].sort((x, y) => x.order - y.order).map((g) => ({ key: g.key, label: g.label })),
      rooms: all.map((r) => ({ key: r.id, label: r.name })),
    };

    const rooms = all.filter((r) =>
      scope === "level" ? r.g.level === key : scope === "grade" ? r.g.key === key : scope === "room" ? r.id === key : true,
    );

    const ids = rooms.map((r) => r.id);
    const { data: agg, error } = ids.length
      ? await a.service.rpc("meal_report_agg", { p_from: start, p_to: end, p_type: type, p_ids: ids })
      : { data: [], error: null };
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const reports = await fetchAll<any>((f, t) =>
      a.service.from("meal_month_reports").select("classroom_id, teacher_confirmed_at, owner_approved_at")
        .eq("month", month).eq("meal_type", type).order("classroom_id").range(f, t));

    const aggBy = new Map<string, any>((agg ?? []).map((r: any) => [r.classroom_id, r]));
    const repBy = new Map<string, any>(reports.map((r) => [r.classroom_id, r]));

    // รายห้อง
    const perRoom = rooms.map((r) => {
      const g = aggBy.get(r.id);
      const present = Number(g?.present ?? 0), leave = Number(g?.leave ?? 0), absent = Number(g?.absent ?? 0);
      const days = Number(g?.school_days ?? 0);
      return {
        room: r, present, leave, absent, extras: Number(g?.extras ?? 0), days,
        headcount: days ? Math.round((present + leave + absent) / days) : 0,
        confirmed: repBy.get(r.id)?.teacher_confirmed_at ? 1 : 0,
        approved: repBy.get(r.id)?.owner_approved_at ? 1 : 0,
      };
    });

    // จัดกลุ่มตาม scope
    const groupOf = (p: (typeof perRoom)[number]): { key: string; label: string; order: number; roomId?: string } =>
      scope === "school"
        ? { key: p.room.g.level, label: LEVEL_LABEL[p.room.g.level], order: LEVEL_ORDER.indexOf(p.room.g.level) }
        : scope === "level"
          ? { key: p.room.g.key, label: p.room.g.label, order: p.room.g.order }
          : { key: p.room.id, label: p.room.name, order: p.room.g.order, roomId: p.room.id };

    const groups = new Map<string, ReportRow & { order: number }>();
    for (const p of perRoom) {
      const g = groupOf(p);
      const row = groups.get(g.key) ?? {
        key: g.key, label: g.label, classroomId: g.roomId, order: g.order, rooms: 0, headcount: 0, schoolDays: 0,
        present: 0, leave: 0, absent: 0, extras: 0, rate: 0, confirmed: 0, approved: 0,
      };
      row.rooms += 1; row.headcount += p.headcount; row.schoolDays = Math.max(row.schoolDays, p.days);
      row.present += p.present; row.leave += p.leave; row.absent += p.absent; row.extras += p.extras;
      row.confirmed += p.confirmed; row.approved += p.approved;
      groups.set(g.key, row);
    }
    const rows: ReportRow[] = [...groups.values()]
      .sort((x, y) => x.order - y.order || x.label.localeCompare(y.label, "th"))
      .map(({ order, ...r }) => {
        const total = r.present + r.leave + r.absent;
        return { ...r, rate: total ? Math.round((r.present / total) * 1000) / 10 : 0 };
      });

    const sum = (f: (r: ReportRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    const total = sum((r) => r.present + r.leave + r.absent);
    const totals: ReportRow = {
      key: "total", label: "รวม", rooms: sum((r) => r.rooms), headcount: sum((r) => r.headcount),
      schoolDays: Math.max(0, ...rows.map((r) => r.schoolDays)),
      present: sum((r) => r.present), leave: sum((r) => r.leave), absent: sum((r) => r.absent),
      extras: sum((r) => r.extras), confirmed: sum((r) => r.confirmed), approved: sum((r) => r.approved),
      rate: total ? Math.round((sum((r) => r.present) / total) * 1000) / 10 : 0,
    };

    return NextResponse.json({ options, rows, totals, isOwner: a.isOwner });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST { action, classroomId, month, type }
//   confirm / unconfirm : ครูประจำชั้น (ล็อก/ปลดล็อกรายงานเดือนนั้น)
//   approve / unapprove : เจ้าของโครงการอาหาร (ต้องให้ครูยืนยันก่อน)
export async function POST(req: NextRequest) {
  try {
    const a = await getActor();
    if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const b = (await req.json()) as {
      action: "confirm" | "unconfirm" | "approve" | "unapprove";
      classroomId: string; month: string; type: MealType;
    };
    if (!b.classroomId || !/^\d{4}-\d{2}$/.test(b.month) || !["lunch", "milk"].includes(b.type)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const key = { classroom_id: b.classroomId, month: b.month, meal_type: b.type };
    const now = new Date().toISOString();
    const { data: cur } = await a.service.from("meal_month_reports").select("*").match(key).maybeSingle();

    let patch: Record<string, unknown>;
    if (b.action === "confirm" || b.action === "unconfirm") {
      if (!canEditRoom(a, b.classroomId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (cur?.owner_approved_at) {
        return NextResponse.json({ error: "เจ้าของโครงการรับรองแล้ว ต้องยกเลิกการรับรองก่อน" }, { status: 409 });
      }
      patch = b.action === "confirm"
        ? { teacher_confirmed_at: now, teacher_confirmed_by: a.profile.id }
        : { teacher_confirmed_at: null, teacher_confirmed_by: null };
    } else if (b.action === "approve" || b.action === "unapprove") {
      if (!a.isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (b.action === "approve" && !cur?.teacher_confirmed_at) {
        return NextResponse.json({ error: "ครูประจำชั้นยังไม่ยืนยันรายงานเดือนนี้" }, { status: 409 });
      }
      patch = b.action === "approve"
        ? { owner_approved_at: now, owner_approved_by: a.profile.id }
        : { owner_approved_at: null, owner_approved_by: null };
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { error } = await a.service.from("meal_month_reports").upsert({ ...key, ...patch }, { onConflict: "classroom_id,month,meal_type" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}