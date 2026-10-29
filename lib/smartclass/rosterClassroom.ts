// หา "ห้องที่มีนักเรียนจริง" ให้แต่ละ classroom_id
// ถ้าห้องนั้นมีนักเรียนอยู่แล้วใช้ห้องนั้น ถ้าไม่มี ให้ใช้ห้องชื่อเดียวกัน (ม.2/1 ฯลฯ) ของเทอม/ปีอื่นที่มีนักเรียนมากที่สุด
export async function resolveRosterClassroomIds(
  supabase: any,
  classroomIds: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (classroomIds.length === 0) return result;

  const { data: rooms } = await supabase
    .from("classrooms").select("id, room_name, grade_group").in("id", classroomIds);
  const roomList = (rooms ?? []) as { id: string; room_name: string; grade_group: string }[];

  const names = [...new Set(roomList.map(r => r.room_name).filter(Boolean))];
  const { data: peers } = await supabase
    .from("classrooms").select("id, room_name, grade_group").in("room_name", names);
  const peerList = (peers ?? []) as { id: string; room_name: string; grade_group: string }[];

  const { data: studs, error } = await supabase
    .from("students").select("classroom_id").is("moved_out_at", null)
    .in("classroom_id", peerList.map(p => p.id))
    .limit(5000);
  if (error) console.error("resolveRosterClassroomIds:", error);

  const count: Record<string, number> = {};
  (studs ?? []).forEach((s: any) => { count[s.classroom_id] = (count[s.classroom_id] ?? 0) + 1; });

  for (const room of roomList) {
    if ((count[room.id] ?? 0) > 0) { result[room.id] = room.id; continue; }
    const cands = peerList
      .filter(p => p.id !== room.id && p.room_name === room.room_name && p.grade_group === room.grade_group)
      .sort((a, b) => (count[b.id] ?? 0) - (count[a.id] ?? 0));
    result[room.id] = cands.length > 0 && (count[cands[0].id] ?? 0) > 0 ? cands[0].id : room.id;
  }
  return result;
}