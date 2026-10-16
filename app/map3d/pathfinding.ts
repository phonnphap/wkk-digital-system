import * as THREE from "three";
import {
  FH, MapEdge, MapLocation, MapNode, MapRoom, XZ,
  corridorNorm, isLongX, localToWorld, stairsNorm, worldToLocal,
} from "./schoolData";

const dist = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Dijkstra บนกราฟทางเดิน — จุดเริ่ม/จุดปลายจะถูกต่อเข้ากับโหนดที่ใกล้ที่สุดอัตโนมัติ
 *  (ประตูทุกบานมีโหนดของตัวเอง จึงใช้เป็นจุดเข้า/ออกได้ทั้งหมด) */
export function findPath(nodes: MapNode[], edges: MapEdge[], start: XZ, end: XZ): XZ[] {
  const pos = new Map<string, XZ>();
  nodes.forEach((n) => pos.set(n.id, [n.x, n.z]));
  const adj = new Map<string, { to: string; w: number }[]>();
  const link = (a: string, b: string) => {
    const pa = pos.get(a), pb = pos.get(b);
    if (!pa || !pb) return;
    const w = dist(pa, pb);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, w });
    adj.get(b)!.push({ to: a, w });
  };
  edges.forEach((e) => link(e.a, e.b));

  const nearest = (p: XZ) => {
    let best = "", bd = Infinity;
    nodes.forEach((n) => {
      const d = dist(p, [n.x, n.z]);
      if (d < bd) { bd = d; best = n.id; }
    });
    return best;
  };
  pos.set("__S", start);
  pos.set("__E", end);
  link("__S", nearest(start));
  link("__E", nearest(end));

  const d = new Map<string, number>();
  const prev = new Map<string, string>();
  const todo = new Set<string>(pos.keys());
  pos.forEach((_, k) => d.set(k, Infinity));
  d.set("__S", 0);
  while (todo.size) {
    let u = "", best = Infinity;
    todo.forEach((k) => { if ((d.get(k) ?? Infinity) < best) { best = d.get(k)!; u = k; } });
    if (!u || best === Infinity) break;
    todo.delete(u);
    if (u === "__E") break;
    (adj.get(u) ?? []).forEach(({ to, w }) => {
      const nd = best + w;
      if (nd < (d.get(to) ?? Infinity)) { d.set(to, nd); prev.set(to, u); }
    });
  }
  if (!prev.has("__E")) return [start, end];
  const out: XZ[] = [];
  for (let c: string | undefined = "__E"; c; c = prev.get(c)) out.unshift(pos.get(c)!);
  return out;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** พิกัด world ของจุดสัดส่วน (0..1) ภายในอาคาร ที่ชั้น level (รวมการหมุนอาคาร) */
export function toWorld(loc: MapLocation, n: XZ, level: number): THREE.Vector3 {
  const [x, z] = localToWorld(loc, (n[0] - 0.5) * loc.size[0], (n[1] - 0.5) * loc.size[1]);
  return new THREE.Vector3(x, (level - 1) * FH + 0.12, z);
}

/** เส้นทางในอาคาร: ทางเข้า → ทางเดินกลาง → (บันได) → หน้าห้อง */
export function indoorRoute(loc: MapLocation, room: MapRoom): THREE.Vector3[] {
  const [lx, lz] = worldToLocal(loc, loc.entrance[0], loc.entrance[1]);
  const entN: XZ = [
    clamp(lx / loc.size[0] + 0.5, 0.02, 0.98),
    clamp(lz / loc.size[1] + 0.5, 0.02, 0.98),
  ];
  const pts: THREE.Vector3[] = [
    new THREE.Vector3(loc.entrance[0], 0.12, loc.entrance[1]),
    toWorld(loc, entN, 1),
    toWorld(loc, corridorNorm(loc, entN), 1),
  ];
  if (room.level > 1) {
    const st = stairsNorm(loc);
    pts.push(toWorld(loc, st, 1), toWorld(loc, st, room.level));
  }
  pts.push(toWorld(loc, corridorNorm(loc, room.door), room.level), toWorld(loc, room.door, room.level));
  return pts;
}

export { isLongX };