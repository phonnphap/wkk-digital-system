import { admin, SITE, nm, thDate, tb, facts, wrapCard, openUrl, post, THAI_TO_CODE } from "@/lib/leave-server";

export type SwapEvent = "requested" | "edited" | "accepted" | "rejected" | "cancelled";
const REF = /\s*\[ref:[^\]]+\]\s*$/i;
const SRC = "ระบบแลกคาบ · โรงเรียนวัดเขียนเขต";

async function loadSwap(id: string) {
  const { data: sw } = await admin.from("class_swap_requests").select("*").eq("id", id).maybeSingle();
  if (!sw) return null;
  const { data: us } = await admin.from("users")
    .select("id,title,first_name,last_name,email,position,grade_level")
    .in("id", [sw.requester_id, sw.target_teacher_id]);
  const requester = us?.find(u => u.id === sw.requester_id);
  const target = us?.find(u => u.id === sw.target_teacher_id);

  const { data: ent } = await admin.from("timetable_entries")
    .select("classroom_id,subject_id,time_slot_id").eq("id", sw.requester_entry_id).maybeSingle();
  let room: any = null, subject = "-", time = "";
  if (ent) {
    const [r, s] = await Promise.all([
      admin.from("classrooms").select("room_name,grade_group").eq("id", ent.classroom_id).maybeSingle(),
      admin.from("subjects").select("name_th").eq("id", ent.subject_id).maybeSingle(),
    ]);
    room = r.data; subject = s.data?.name_th ?? "-";
    if (String(ent.time_slot_id).startsWith("tmpl-")) {
      const hhmm = String(ent.time_slot_id).split("-").pop() ?? "";
      time = hhmm.length === 4 ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : "";
    } else {
      const { data: sl } = await admin.from("time_slots").select("start_time,end_time").eq("id", ent.time_slot_id).maybeSingle();
      time = sl ? `${sl.start_time.slice(0, 5)}–${sl.end_time.slice(0, 5)}` : "";
    }
  }
  return { sw, requester, target, room, subject, time };
}

export async function notifySwapTeams(swapId: string, event: SwapEvent, byAdminName?: string) {
  const url = process.env.TEAMS_LEAVE_WEBHOOK_URL;
  if (!url) return;
  const c = await loadSwap(swapId);
  if (!c || !c.requester || !c.target) return;
  const { sw, requester, target, room, subject, time } = c;

  const roomText = room ? `${room.grade_group ?? ""} ${room.room_name ?? ""}`.trim() : "-";
  const reason = (sw.reason ?? "").replace(REF, "").trim();

  const detail = facts([
    ["ผู้ขอแลก", nm(requester)],
    ["ครูที่ไปสอนแทน", nm(target)],
    ["วันที่", thDate(sw.swap_date)],
    ["เวลา", time || "-"],
    ["วิชา / ห้อง", `${subject} · ${roomText}`],
    ...(reason ? [["เหตุผล", reason] as [string, string]] : []),
  ]);
  const open = openUrl("เปิดในระบบ", `${SITE}/substitution`);
  const note = byAdminName ? [tb(`ดำเนินการแทนโดย ${byAdminName}`, { size: "Small", isSubtle: true })] : [];

  const titles: Record<SwapEvent, string> = {
    requested: "🔄 มีคำขอแลกคาบถึงคุณ",
    edited: "✏️ คำขอแลกคาบมีการแก้ไข — กรุณาตอบรับใหม่",
    accepted: "✅ คำขอแลกคาบได้รับการตอบรับ",
    rejected: "❌ คำขอแลกคาบถูกปฏิเสธ",
    cancelled: "🗑️ คำขอแลกคาบถูกยกเลิก — ไม่ต้องดำเนินการ",
  };
  const color = event === "accepted" ? "Good" : event === "rejected" || event === "cancelled" ? "Attention" : "Accent";
  const head = tb(titles[event], { weight: "Bolder", size: "Large", color });

  const sends = new Map<string, { to: string; card: any }>();
  const add = (to: string | null | undefined, card: any) => {
    if (to && !sends.has(to.toLowerCase())) sends.set(to.toLowerCase(), { to, card });
  };

  if (event === "requested" || event === "edited") {
    const b = `${SITE}/swap/action?id=${swapId}`;
    add(target.email, wrapCard([head, detail], [
      openUrl("✅ ตอบรับ", `${b}&action=accepted`, "positive"),
      openUrl("❌ ปฏิเสธ", `${b}&action=rejected`, "destructive"),
      open,
    ], SRC));
  } else if (event === "cancelled") {
    add(target.email, wrapCard([head, detail], [], SRC));
  } else {
    add(requester.email, wrapCard([head, detail, ...note], [open], SRC));
    if (byAdminName) add(target.email, wrapCard([head, detail, ...note], [open], SRC));

    if (event === "accepted") {
      const codes = new Set<string>();
      const gc = THAI_TO_CODE[(room?.grade_group ?? "").split("/")[0].trim()];
      if (gc) codes.add(gc);
      if (requester.grade_level) codes.add(requester.grade_level);
      if (target.grade_level) codes.add(target.grade_level);
      const { data: heads } = await admin.from("users")
        .select("email,grade_level").contains("extra_roles", ["grade_head"]);
      (heads ?? [])
        .filter(h => h.grade_level && codes.has(h.grade_level))
        .forEach(h => add(h.email, wrapCard([
          tb("🔄 แจ้งให้ทราบ: มีการแลกคาบในสายชั้น", { weight: "Bolder", size: "Large", color: "Good" }),
          detail,
        ], [open], SRC)));
    }
  }

  await Promise.allSettled([...sends.values()].map(s => post(url, s.to, s.card)));
}