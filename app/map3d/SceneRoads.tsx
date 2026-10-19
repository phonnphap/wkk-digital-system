"use client";

// ถนนทุกชนิด: ถนนในโรงเรียน (เทา ขอบขาว), ซอย (ดำ ขอบเหลือง), ถนนหลัก (น้ำเงิน 4 เลน),
// ถนนลานจอดรถ (เหลือง), ฟุตบาทมีหลังคา — คลิกเพื่อเปิดตั้งค่าได้
import { useMemo } from "react";
import { MapEdge, MapNode, XZ } from "./schoolData";
import { GateDef, GrayRoad, PickFn, RoadItem, RoadKind, outsideRoadSegs, pickState, sampleRoad } from "./DecorData";
import { InstX, Item, Tag } from "./SceneExtra";

/** ถนนในโรงเรียนตาม nodes/edges เดิม: สี/ความกว้างตั้งค่าได้ */
export function Roads({ nodes, edges, style, onPick }: { nodes: MapNode[]; edges: MapEdge[]; style?: GrayRoad; onPick?: PickFn }) {
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const w = style?.w ?? 1.02, gc = style?.color ?? "#9ca3af", ec = style?.edge ?? "#ffffff";
  return (
    <group onClick={(e) => { if (e.delta > 4 || pickState.placing) return; e.stopPropagation(); onPick?.(e.point.x, e.point.z, "ถนนในโรงเรียน (เทา)", { kind: "gray", id: "gray" }); }}>
      {edges.map((e, i) => {
        const a = pos.get(e.a), b = pos.get(e.b);
        if (!a || !b || e.a.startsWith("rd:") || e.b.startsWith("rd:")) return null;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const ang = -Math.atan2(b.z - a.z, b.x - a.x);
        const mid: [number, number, number] = [(a.x + b.x) / 2, 0.01, (a.z + b.z) / 2];
        return (
          <group key={i} position={mid} rotation={[0, ang, 0]}>
            <mesh position={[0, -0.002, 0]} receiveShadow><boxGeometry args={[len + w * 0.6, 0.016, w + 0.18]} /><meshStandardMaterial color={ec} /></mesh>
            <mesh position={[0, 0.004, 0]} receiveShadow><boxGeometry args={[len + w * 0.5, 0.02, w]} /><meshStandardMaterial color={gc} /></mesh>
          </group>
        );
      })}
    </group>
  );
}

export function RoadsLayer({ roads, gates, gray, onPick }: { roads: RoadItem[]; gates: GateDef[]; gray?: GrayRoad; onPick?: PickFn }) {
  const d = useMemo(() => {
    const base: Item[] = [], line: Item[] = [], slab: Item[] = [], roof: Item[] = [], posts: Item[] = [];
    const baseIds: string[] = [], lineIds: string[] = [], slabIds: string[] = [];
    const labels: { x: number; z: number; text: string }[] = [];
    let cur = "";
    const B = (it: Item) => { base.push(it); baseIds.push(cur); };
    const Ln = (it: Item) => { line.push(it); lineIds.push(cur); };
    const Sl = (it: Item) => { slab.push(it); slabIds.push(cur); };
    const gc = gray?.color ?? "#9ca3af", ec = gray?.edge ?? "#ffffff";

    const emit = (kind: RoadKind, pl: XZ[], w: number, roofOn: boolean) => {
      let dashNext = 0, postNext = 0;
      for (let i = 0; i < pl.length - 1; i++) {
        const a = pl[i], b = pl[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        if (len < 0.005) continue;
        const ang = -Math.atan2(dz, dx), nx = -dz / len, nz = dx / len;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const ext = Math.min(w * 0.3, 0.5);
        if (kind === "soi") {
          B({ p: [mx, 0.004, mz], s: [len + ext, 0.012, w], r: ang, c: "#14171b" });
          [-1, 1].forEach((sg) => {
            const o = sg * (w / 2 - 0.07);
            Ln({ p: [mx + nx * o, 0.012, mz + nz * o], s: [len + 0.06, 0.008, 0.05], r: ang, c: "#fbbf24" });
          });
          let pos = dashNext;
          while (pos < len) { const t = pos / len; Ln({ p: [a[0] + dx * t, 0.012, a[1] + dz * t], s: [0.3, 0.008, 0.04], r: ang, c: "#fbbf24" }); pos += 0.6; }
          dashNext = pos - len;
        } else if (kind === "main") {
          B({ p: [mx, 0.008, mz], s: [len + ext, 0.014, w], r: ang, c: "#1e40af" });
          [-1, 1].forEach((sg) => {
            const o = sg * (w / 2 - 0.06);
            Ln({ p: [mx + nx * o, 0.016, mz + nz * o], s: [len + 0.06, 0.006, 0.05], r: ang, c: "#ffffff" });
          });
          [-0.04, 0.04].forEach((o) => Ln({ p: [mx + nx * o, 0.016, mz + nz * o], s: [len + 0.06, 0.006, 0.04], r: ang, c: "#fbbf24" }));
          let pos = dashNext;
          while (pos < len) {
            const t = pos / len;
            [-w / 4, w / 4].forEach((o) => Ln({ p: [a[0] + dx * t + nx * o, 0.016, a[1] + dz * t + nz * o], s: [0.35, 0.006, 0.05], r: ang, c: "#ffffff" }));
            pos += 0.7;
          }
          dashNext = pos - len;
        } else if (kind === "park") {
          B({ p: [mx, 0.022, mz], s: [len + ext, 0.012, w], r: ang, c: "#f59f00" });
          Ln({ p: [mx, 0.03, mz], s: [len + ext * 0.8, 0.012, w * 0.82], r: ang, c: "#fde047" });
        } else if (kind === "gray") {
          B({ p: [mx, 0.006, mz], s: [len + ext, 0.014, w + 0.16], r: ang, c: ec });
          Ln({ p: [mx, 0.014, mz], s: [len + ext, 0.014, w], r: ang, c: gc });
        } else if (kind === "walk") {
          Sl({ p: [mx, 0.035, mz], s: [len + ext, 0.07, w], r: ang, c: "#e5e7eb" });
          if (roofOn) {
            roof.push({ p: [mx, 0.78, mz], s: [len + ext, 0.05, w + 0.35], r: ang, c: "#2563eb" });
            let pos = postNext;
            while (pos < len) {
              const t = pos / len;
              [-1, 1].forEach((sg) => posts.push({ p: [a[0] + dx * t + nx * sg * (w / 2 - 0.04), 0.4, a[1] + dz * t + nz * sg * (w / 2 - 0.04)] }));
              pos += 1.8;
            }
            postNext = pos - len;
          }
        }
      }
    };

    roads.forEach((r) => {
      if (r.kind === "route") return;
      const pl = sampleRoad(r.pts, r.curve ?? 0);
      if (pl.length < 2) return;
      cur = r.id;
      const w = r.w ?? (r.kind === "main" ? 4 : r.kind === "park" || r.kind === "walk" ? 1 : r.kind === "gray" ? 1.02 : 1.6);
      emit(r.kind, pl, w, !!r.roof);
      if (r.label) {
        const fr = r.kind === "main" ? [0.2, 0.5, 0.8] : [0.5];
        fr.forEach((f) => { const p = pl[Math.min(pl.length - 1, Math.floor(pl.length * f))]; labels.push({ x: p[0], z: p[1], text: r.label! }); });
      }
    });

    // ทางต่อจากประตู (ไม่รวมประตูคนเดิน) ไปยังถนนซอย
    cur = "";
    const soiCount = roads.filter((r) => r.kind === "soi").reduce((a, r) => a + Math.max(0, sampleRoad(r.pts, r.curve ?? 0).length - 1), 0);
    outsideRoadSegs(roads, gates).slice(soiCount).forEach(({ a, b }) => emit("soi", [a, b], 1.6, false));
    return { base, line, slab, roof, posts, baseIds, lineIds, slabIds, labels };
  }, [roads, gates, gray]);

  const click = (ids: string[]) => (e: any) => {
    if (e.delta > 4 || pickState.placing) return;
    const id = ids[e.instanceId ?? -1];
    const r = roads.find((x) => x.id === id);
    if (!r) return;
    e.stopPropagation();
    onPick?.(e.point.x, e.point.z, r.name, { kind: "road", id });
  };
  return (
    <>
      <InstX items={d.base} onClick={click(d.baseIds)}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={d.line} onClick={click(d.lineIds)}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={d.slab} onClick={click(d.slabIds)}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={d.roof}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" /></InstX>
      <InstX items={d.posts}><cylinderGeometry args={[0.025, 0.025, 0.8, 6]} /><meshStandardMaterial color="#9ca3af" /></InstX>
      {d.labels.map((l, i) => <group key={i} position={[l.x, 0, l.z]}><Tag y={0.5}>{l.text}</Tag></group>)}
    </>
  );
}
