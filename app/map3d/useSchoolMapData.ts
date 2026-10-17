"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FALLBACK_EDGES, FALLBACK_GATE_EDGES, FALLBACK_GATE_NODES, FALLBACK_LOCATIONS, FALLBACK_NODES, genRooms, hasInterior,
  MapEdge, MapLocation, MapNode, MapRoom,
} from "./schoolData";
import { DEFAULT_DECOR, DecorConfig, sanitizeDecor } from "./DecorData";

export type SaveResult = { ok: boolean; message: string };
const ok = (message = "บันทึกแล้ว"): SaveResult => ({ ok: true, message });
const fail = (e: any): SaveResult => ({ ok: false, message: e?.message ?? String(e) });
const LOCAL = "แก้ไขในหน้านี้แล้ว (โหมดข้อมูลตั้งต้น — ยังไม่บันทึกลงฐานข้อมูล)";

export function useSchoolMapData() {
  const [locs, setLocs] = useState<MapLocation[]>(FALLBACK_LOCATIONS);
  const [nodes, setNodes] = useState<MapNode[]>(FALLBACK_NODES);
  const [edges, setEdges] = useState<MapEdge[]>(FALLBACK_EDGES);
  const [dbRooms, setDbRooms] = useState<MapRoom[]>([]);
  const [custom, setCustom] = useState<Record<string, MapRoom[]>>({});
  const [source, setSource] = useState<"fallback" | "supabase">("fallback");
  const [decor, setDecor] = useState<DecorConfig>(DEFAULT_DECOR);

  const loadDecor = useCallback(async () => {
    try {
      const { data, error } = await createClient().from("map_config").select("value").eq("key", "decor").maybeSingle();
      if (!error && data?.value) setDecor(sanitizeDecor(data.value));
    } catch { /* ใช้ค่าตั้งต้น */ }
  }, []);

  const load = useCallback(async () => {
    loadDecor();
    try {
      const supabase = createClient();
      const [l, f, r, n, e] = await Promise.all([
        supabase.from("map_locations").select("*"),
        supabase.from("map_floors").select("id, location_id, level"),
        supabase.from("map_rooms").select("*"),
        supabase.from("map_nodes").select("*"),
        supabase.from("map_edges").select("*"),
      ]);
      if (l.error || n.error || !l.data?.length || !n.data?.length) return;

      const maxLevel: Record<string, number> = {};
      (f.data || []).forEach((x: any) => {
        maxLevel[x.location_id] = Math.max(maxLevel[x.location_id] ?? 0, x.level);
      });
      const mappedLocs: MapLocation[] = l.data
        .map((x: any) => ({
          id: x.id, code: x.code, name: x.name, kind: x.kind,
          pos: [x.pos_x, x.pos_z], size: [x.size_w, x.size_d],
          color: x.color, floors: maxLevel[x.id] ?? x.floors_count,
          entrance: [x.entrance_x, x.entrance_z], building_id: x.building_id,
          rot: Number(x.rot ?? 0),
          corridor: x.corridor_side === "b" ? "b" : "a",
          toilet: x.toilet_mode ?? "none",
          stairs: x.stairs_mode ?? "start",
          perFloor: x.rooms_per_floor ?? undefined,
          stage: x.stage_mode ?? "none",
        } as MapLocation))
        .sort((a: MapLocation, b: MapLocation) => Number(a.code) - Number(b.code));

      const floorById = new Map<string, { level: number; location_id: string }>();
      (f.data || []).forEach((x: any) => floorById.set(x.id, x));
      const mappedRooms: MapRoom[] = (r.data || [])
        .filter((x: any) => floorById.has(x.floor_id))
        .map((x: any) => ({
          id: x.id, code: x.code, name: x.name,
          location_id: floorById.get(x.floor_id)!.location_id,
          level: floorById.get(x.floor_id)!.level,
          x: x.x, z: x.z, w: x.w, d: x.d, door: [x.door_x, x.door_z],
          type: x.room_type ?? "classroom", desks: x.desk_count ?? 30, ac: x.ac_type ?? "none",
        } as MapRoom));

      const dbNodes: MapNode[] = n.data.map((x: any) => ({ id: x.code, x: x.pos_x, z: x.pos_z }));
      const have = new Set(dbNodes.map((x) => x.id));
      const extraNodes = FALLBACK_GATE_NODES.filter((g) => !have.has(g.id));
      const extraIds = new Set(extraNodes.map((x) => x.id));
      const dbEdges: MapEdge[] = (e.data || []).map((x: any) => ({ a: x.a, b: x.b }));
      const extraEdges = FALLBACK_GATE_EDGES.filter((x) => extraIds.has(x.a) || extraIds.has(x.b));

      locsRef.current = mappedLocs;
      setLocs(mappedLocs);
      setNodes([...dbNodes, ...extraNodes]);
      setEdges([...dbEdges, ...extraEdges]);
      setDbRooms(mappedRooms);
      setCustom({});
      setSource("supabase");
    } catch (err) {
      console.warn("[useSchoolMapData] ใช้ข้อมูลตั้งต้นแทน:", err);
    }
  }, [loadDecor]);

  useEffect(() => { load(); }, [load]);

  const rooms = useMemo(() => {
    const have = new Set(dbRooms.map((x) => x.location_id));
    const virtual = locs.filter((l) => !have.has(l.id)).flatMap((l) => custom[l.id] ?? genRooms(l));
    return [...dbRooms, ...virtual];
  }, [dbRooms, locs, custom]);

  const locsRef = useRef(locs); locsRef.current = locs;
  const roomsRef = useRef(rooms); roomsRef.current = rooms;
  const dbRoomsRef = useRef(dbRooms); dbRoomsRef.current = dbRooms;
  const customRef = useRef(custom); customRef.current = custom;
  const sourceRef = useRef(source); sourceRef.current = source;
  const decorRef = useRef(decor); decorRef.current = decor;

  /* ───────────── ฟังก์ชันสำหรับแอดมิน ───────────── */

  const updateLocation = useCallback(async (id: string, patch: Partial<MapLocation>): Promise<SaveResult> => {
    // อัปเดต ref ทันที เพื่อให้ regenerateRooms ที่เรียกต่อกันเห็นค่าใหม่
    locsRef.current = locsRef.current.map((l) => (l.id === id ? { ...l, ...patch } : l));
    setLocs(locsRef.current);
    if (sourceRef.current !== "supabase") return ok(LOCAL);
    const row: Record<string, any> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.rot !== undefined) row.rot = patch.rot;
    if (patch.corridor !== undefined) row.corridor_side = patch.corridor;
    if (patch.stairs !== undefined) row.stairs_mode = patch.stairs;
    if (patch.toilet !== undefined) row.toilet_mode = patch.toilet;
    if (patch.stage !== undefined) row.stage_mode = patch.stage;   // ต้องรัน SQL เพิ่มคอลัมน์ stage_mode ก่อน
    if ("perFloor" in patch) row.rooms_per_floor = patch.perFloor ?? null;
    if (patch.pos) { row.pos_x = patch.pos[0]; row.pos_z = patch.pos[1]; }
    if (patch.size) { row.size_w = patch.size[0]; row.size_d = patch.size[1]; }
    if (patch.entrance) { row.entrance_x = patch.entrance[0]; row.entrance_z = patch.entrance[1]; }
    if (!Object.keys(row).length) return ok();
    const { data, error } = await createClient()
      .from("map_locations").update(row).eq("id", id).select("id");
    if (error) return fail(error);
    if (!data?.length) return fail("บันทึกไม่เข้าฐานข้อมูล: ไม่มีสิทธิ์เขียน (RLS) หรือไม่พบแถว");
    return ok();
  }, []);

  const setFloors = useCallback(async (id: string, count: number): Promise<SaveResult> => {
    const n = Math.max(1, Math.min(8, Math.round(count)));
    const loc = locsRef.current.find((l) => l.id === id);
    if (!loc) return fail("ไม่พบอาคาร");
    locsRef.current = locsRef.current.map((l) => (l.id === id ? { ...l, floors: n } : l));
    setLocs(locsRef.current);
    setCustom((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const maxL = Math.max(0, ...cur.map((r) => r.level));
      const extra = genRooms({ ...loc, floors: n }).filter((r) => r.level > maxL);
      return { ...prev, [id]: [...cur.filter((r) => r.level <= n), ...extra] };
    });
    if (sourceRef.current !== "supabase") return ok(LOCAL);
    try {
      const sb = createClient();
      const { data: fl, error: e1 } = await sb.from("map_floors").select("id, level").eq("location_id", id);
      if (e1) return fail(e1);
      const have = new Map<number, string>((fl ?? []).map((f: any) => [f.level, f.id]));
      const add: any[] = [];
      for (let lv = 1; lv <= n; lv++) if (!have.has(lv)) add.push({ location_id: id, level: lv });
      if (add.length) {
        const { error } = await sb.from("map_floors").insert(add);
        if (error) return fail(error);
      }
      const drop = (fl ?? []).filter((f: any) => f.level > n).map((f: any) => f.id);
      if (drop.length) {
        await sb.from("map_rooms").delete().in("floor_id", drop);
        const { error } = await sb.from("map_floors").delete().in("id", drop);
        if (error) return fail(error);
      }
      await sb.from("map_locations").update({ floors_count: n }).eq("id", id);
      setDbRooms((prev) => prev.filter((r) => !(r.location_id === id && r.level > n)));
      return ok(`ตั้งค่า ${n} ชั้นแล้ว`);
    } catch (e) { return fail(e); }
  }, []);

  const updateRoom = useCallback(async (id: string, patch: Partial<MapRoom>): Promise<SaveResult> => {
    if (dbRoomsRef.current.some((r) => r.id === id)) {
      setDbRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      if (sourceRef.current !== "supabase") return ok(LOCAL);
      const row: Record<string, any> = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.code !== undefined) row.code = patch.code;
      if (patch.type !== undefined) row.room_type = patch.type;
      if (patch.desks !== undefined) row.desk_count = patch.desks;
      if (patch.ac !== undefined) row.ac_type = patch.ac;
      const { error } = await createClient().from("map_rooms").update(row).eq("id", id);
      return error ? fail(error) : ok();
    }
    const room = roomsRef.current.find((r) => r.id === id);
    if (!room) return fail("ไม่พบห้อง");
    setCustom((prev) => {
      const loc = locsRef.current.find((l) => l.id === room.location_id);
      const base = prev[room.location_id] ?? (loc ? genRooms(loc) : []);
      return { ...prev, [room.location_id]: base.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
    });
    return ok("แก้ในหน้านี้แล้ว — กด “บันทึกทั้งอาคารลงฐานข้อมูล” เพื่อเก็บถาวร");
  }, []);

  const addRoom = useCallback(async (locId: string, level: number): Promise<SaveResult> => {
    const loc = locsRef.current.find((l) => l.id === locId);
    if (!loc) return fail("ไม่พบอาคาร");
    const existing = roomsRef.current.filter((r) => r.location_id === locId && r.level === level);
    const free = genRooms(loc).filter((r) => r.level === level).find((s) =>
      !existing.some((e) =>
        Math.abs(e.x + e.w / 2 - (s.x + s.w / 2)) < (e.w + s.w) / 2 - 0.005 &&
        Math.abs(e.z + e.d / 2 - (s.z + s.d / 2)) < (e.d + s.d) / 2 - 0.005));
    if (!free) return fail("ชั้นนี้ไม่มีที่ว่างสำหรับห้องใหม่");
    const codes = new Set(existing.map((r) => r.code));
    let num = existing.length + 1, code = "";
    do { code = `${loc.code}-${level}${String(num++).padStart(2, "0")}`; } while (codes.has(code));
    const base: MapRoom = { ...free, id: `new-${Date.now()}`, code, name: `ห้อง ${code}`, type: "classroom", desks: 30, placeholder: true };

    const isDb = dbRoomsRef.current.some((r) => r.location_id === locId);
    if (isDb && sourceRef.current === "supabase") {
      try {
        const sb = createClient();
        let { data: fl } = await sb.from("map_floors").select("id").eq("location_id", locId).eq("level", level).maybeSingle();
        if (!fl) {
          const ins = await sb.from("map_floors").insert({ location_id: locId, level }).select("id").single();
          if (ins.error) return fail(ins.error);
          fl = ins.data;
        }
        const { data, error } = await sb.from("map_rooms").insert({
          floor_id: fl!.id, code, name: base.name, x: base.x, z: base.z, w: base.w, d: base.d,
          door_x: base.door[0], door_z: base.door[1], room_type: "classroom", desk_count: 30,
        }).select("id").single();
        if (error) return fail(error);
        setDbRooms((prev) => [...prev, { ...base, id: data!.id, placeholder: undefined }]);
        return ok(`เพิ่มห้อง ${code} แล้ว`);
      } catch (e) { return fail(e); }
    }
    if (isDb) { setDbRooms((prev) => [...prev, base]); return ok(LOCAL); }
    setCustom((prev) => ({ ...prev, [locId]: [...(prev[locId] ?? genRooms(loc)), base] }));
    return ok(`เพิ่มห้อง ${code} แล้ว (ยังไม่บันทึกลงฐานข้อมูล)`);
  }, []);

  const deleteRoom = useCallback(async (id: string): Promise<SaveResult> => {
    if (dbRoomsRef.current.some((r) => r.id === id)) {
      setDbRooms((prev) => prev.filter((r) => r.id !== id));
      if (sourceRef.current !== "supabase") return ok(LOCAL);
      const { error } = await createClient().from("map_rooms").delete().eq("id", id);
      return error ? fail(error) : ok("ลบห้องแล้ว");
    }
    const room = roomsRef.current.find((r) => r.id === id);
    if (!room) return fail("ไม่พบห้อง");
    setCustom((prev) => {
      const loc = locsRef.current.find((l) => l.id === room.location_id);
      const base = prev[room.location_id] ?? (loc ? genRooms(loc) : []);
      return { ...prev, [room.location_id]: base.filter((r) => r.id !== id) };
    });
    return ok("ลบห้องแล้ว (ในหน้านี้)");
  }, []);

  const saveGenerated = useCallback(async (locId: string): Promise<SaveResult> => {
    if (sourceRef.current !== "supabase") return fail("ยังไม่ได้เชื่อมต่อ Supabase");
    const loc = locsRef.current.find((l) => l.id === locId);
    if (!loc) return fail("ไม่พบอาคาร");
    const list = customRef.current[locId] ?? genRooms(loc);
    try {
      const sb = createClient();
      const { data: fl, error: e1 } = await sb.from("map_floors").select("id, level").eq("location_id", locId);
      if (e1) return fail(e1);
      const floorIds = new Map<number, string>((fl ?? []).map((f: any) => [f.level, f.id]));
      for (let lv = 1; lv <= loc.floors; lv++) {
        if (floorIds.has(lv)) continue;
        const ins = await sb.from("map_floors").insert({ location_id: locId, level: lv }).select("id").single();
        if (ins.error) return fail(ins.error);
        floorIds.set(lv, ins.data!.id);
      }
      const rows = list.filter((r) => floorIds.has(r.level)).map((r) => ({
        floor_id: floorIds.get(r.level), code: r.code, name: r.name, x: r.x, z: r.z, w: r.w, d: r.d,
        door_x: r.door[0], door_z: r.door[1], room_type: r.type ?? "classroom", desk_count: r.desks ?? 30,
        ac_type: r.ac ?? "none",
      }));
      if (rows.length) {
        const { error } = await sb.from("map_rooms").insert(rows);
        if (error) return fail(error);
      }
      await load();
      return ok(`บันทึก ${rows.length} ห้องลงฐานข้อมูลแล้ว`);
    } catch (e) { return fail(e); }
  }, [load]);

  const regenerateRooms = useCallback(async (locId: string): Promise<SaveResult> => {
    const loc = locsRef.current.find((l) => l.id === locId);
    if (!loc) return fail("ไม่พบอาคาร");
    const next = { ...customRef.current }; delete next[locId];
    customRef.current = next; setCustom(next);
    const hasDb = dbRoomsRef.current.some((r) => r.location_id === locId);
    if (sourceRef.current !== "supabase" || !hasDb) return ok("สร้างห้องตามผังใหม่แล้ว");
    try {
      const sb = createClient();
      const { data: fl, error: e1 } = await sb.from("map_floors").select("id").eq("location_id", locId);
      if (e1) return fail(e1);
      const ids = (fl ?? []).map((f: any) => f.id);
      if (ids.length) {
        const { error } = await sb.from("map_rooms").delete().in("floor_id", ids);
        if (error) return fail(error);
      }
      setDbRooms((prev) => prev.filter((r) => r.location_id !== locId));
      dbRoomsRef.current = dbRoomsRef.current.filter((r) => r.location_id !== locId);
      return await saveGenerated(locId);
    } catch (e) { return fail(e); }
  }, [saveGenerated]);

  /** สร้างห้องของทุกอาคารที่มีห้องภายในใหม่ตามผังปัจจุบัน (ใช้หลังเปลี่ยนขนาดบันได/ห้องน้ำ/ผังพิเศษ) */
  const regenerateAll = useCallback(async (): Promise<SaveResult> => {
    let n = 0;
    for (const l of [...locsRef.current]) {
      if (!hasInterior(l)) continue;
      const r = await regenerateRooms(l.id);
      if (!r.ok) return r;
      n++;
    }
    return ok(`สร้างห้องใหม่ ${n} อาคารแล้ว`);
  }, [regenerateRooms]);

  const syncDefaultLayout = useCallback(async (): Promise<SaveResult> => {
    let count = 0;
    for (const d of FALLBACK_LOCATIONS) {
      const cur = locsRef.current.find((l) => l.code === d.code);
      if (!cur) continue;
      await updateLocation(cur.id, { pos: d.pos, size: d.size, rot: d.rot ?? 0, entrance: d.entrance, kind: d.kind });
      count++;
    }
    if (sourceRef.current === "supabase") {
      try {
        const sb = createClient();
        const { data: nd } = await sb.from("map_nodes").select("code");
        const haveN = new Set((nd ?? []).map((x: any) => x.code));
        const addN = FALLBACK_GATE_NODES.filter((g) => !haveN.has(g.id)).map((g) => ({ code: g.id, pos_x: g.x, pos_z: g.z }));
        if (addN.length) await sb.from("map_nodes").insert(addN);
        const { data: ed } = await sb.from("map_edges").select("a, b");
        const key = (a: string, b: string) => [a, b].sort().join("|");
        const haveE = new Set((ed ?? []).map((x: any) => key(x.a, x.b)));
        const addE = FALLBACK_GATE_EDGES.filter((x) => !haveE.has(key(x.a, x.b))).map((x) => ({ a: x.a, b: x.b }));
        if (addE.length) await sb.from("map_edges").insert(addE);
      } catch (e) { return fail(e); }
    }
    return ok(`ปรับผัง ${count} สถานที่ + เส้นทางประตูแล้ว`);
  }, [updateLocation]);

  /* ───────────── ฉาก (ต้นไม้ ประตู ซุ้ม ห้องน้ำ ฯลฯ) ───────────── */
  const saveDecor = useCallback(async (): Promise<SaveResult> => {
    if (sourceRef.current !== "supabase") return ok(LOCAL);
    const { error } = await createClient().from("map_config")
      .upsert({ key: "decor", value: decorRef.current, updated_at: new Date().toISOString() });
    return error ? fail(error) : ok("บันทึกฉากแล้ว");
  }, []);
  const resetDecor = useCallback(() => setDecor(DEFAULT_DECOR), []);

  const api = {
    updateLocation, setFloors, updateRoom, addRoom, deleteRoom, saveGenerated, regenerateRooms, regenerateAll,
    syncDefaultLayout, setDecor, saveDecor, resetDecor, reload: load,
  };
  return { locs, rooms, nodes, edges, source, decor, api };
}

export type MapApi = ReturnType<typeof useSchoolMapData>["api"];