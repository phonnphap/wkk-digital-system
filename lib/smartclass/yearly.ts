type RoomLike = { room_name?: string | null; grade_group?: string | null } | null | undefined;

export function isYearlyRoom(room: RoomLike): boolean {
  const m = (room?.room_name ?? "").match(/([ปมอ])\.?\s*\d+/);
  let p = m ? m[1] : "";
  if (!p) {
    const g = (room?.grade_group ?? "").trim();
    p = g.startsWith("อ") ? "อ" : g.startsWith("ป") ? "ป" : g.startsWith("ม") ? "ม" : "";
  }
  return p === "อ" || p === "ป";
}