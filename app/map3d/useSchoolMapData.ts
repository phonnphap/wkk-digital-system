"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FALLBACK_EDGES, FALLBACK_LOCATIONS, FALLBACK_NODES, genRooms,
  MapEdge, MapLocation, MapNode, MapRoom,
} from "./schoolData";

/** โหลดข้อมูลแผนที่จาก Supabase — ถ้าตารางยังไม่มี/ว่าง จะใช้ข้อมูลตั้งต้นจากแผนผังแทน */
export function useSchoolMapData() {
  const [locs, setLocs] = useState<MapLocation[]>(FALLBACK_LOCATIONS);
  const [nodes, setNodes] = useState<MapNode[]>(FALLBACK_NODES);
  const [edges, setEdges] = useState<MapEdge[]>(FALLBACK_EDGES);
  const [dbRooms, setDbRooms] = useState<MapRoom[]>([]);
  const [source, setSource] = useState<"fallback" | "supabase">("fallback");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const [l, f, r, n, e] = await Promise.all([
          supabase.from("map_locations").select("*"),
          supabase.from("map_floors").select("id, location_id, level"),
          supabase.from("map_rooms").select("*"),
          supabase.from("map_nodes").select("*"),
          supabase.from("map_edges").select("*"),
        ]);
        if (cancelled || l.error || n.error || !l.data?.length || !n.data?.length) return;

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
            type: x.room_type ?? "classroom", desks: x.desk_count ?? 30,
          } as MapRoom));

        setLocs(mappedLocs);
        setNodes(n.data.map((x: any) => ({ id: x.code, x: x.pos_x, z: x.pos_z })));
        setEdges((e.data || []).map((x: any) => ({ a: x.a, b: x.b })));
        setDbRooms(mappedRooms);
        setSource("supabase");
      } catch (err) {
        console.warn("[useSchoolMapData] ใช้ข้อมูลตั้งต้นแทน:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // อาคารที่ยังไม่มีห้องในฐานข้อมูล → สร้างห้องตัวอย่างให้
  const rooms = useMemo(() => {
    const have = new Set(dbRooms.map((x) => x.location_id));
    const gen = locs.filter((l) => !have.has(l.id)).flatMap(genRooms);
    return [...dbRooms, ...gen];
  }, [dbRooms, locs]);

  return { locs, rooms, nodes, edges, source };
}