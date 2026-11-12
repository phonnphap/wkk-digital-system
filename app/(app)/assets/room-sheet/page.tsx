"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, ASSET_SELECT, SCHOOL, STATUSES, codeRanges, useMyRooms, roomKey, inputCls, type Asset } from "@/lib/assets";

type Loc = { id: number; name: string };

// ใบสรุปครุภัณฑ์ประจำห้อง ตามฟอร์มตัวอย่าง: ลำดับ / รายการ / จำนวน / หมายเลขครุภัณฑ์ / หมายเหตุ
export default function RoomSheetPage() {
  const [locs, setLocs] = useState<Loc[]>([]); const [locId, setLocId] = useState(""); const [rows, setRows] = useState<Asset[]>([]);
  const mine = useMyRooms();
  useEffect(() => { supabase.from("asset_locations").select("id,name").order("sort").then(({ data }: { data: Loc[] | null }) => setLocs(data ?? [])); }, []);
  useEffect(() => {
    if (locId || !locs.length || !mine.length) return;
    const m = locs.find((l) => mine.map(roomKey).includes(roomKey(l.name))); if (m) setLocId(String(m.id));
  }, [locs, mine, locId]);
  useEffect(() => {
    if (!locId) return setRows([]);
    supabase.from("assets").select(ASSET_SELECT).eq("location_id", Number(locId)).neq("status", "disposed").order("asset_code")
      .then(({ data }: { data: Asset[] | null }) => setRows(data ?? []));
  }, [locId]);

  const groups = useMemo(() => {
    const m = new Map<string, Asset[]>();
    rows.forEach((a) => { const k = `${a.name.trim()}|${a.category_code}`; m.set(k, [...(m.get(k) ?? []), a]); });
    return [...m.values()];
  }, [rows]);
  const room = locs.find((l) => String(l.id) === locId)?.name;
  const remark = (g: Asset[]) => {
    const r: string[] = []; const ns = g.filter((a) => !a.sticker_attached).length;
    if (ns) r.push(`ยังไม่ติดเลข ${ns}`);
    Object.keys(STATUSES).filter((s) => s !== "active").forEach((s) => { const c = g.filter((a) => a.status === s).length; if (c) r.push(`${STATUSES[s].text} ${c}`); });
    return r.join(" / ");
  };
  const cell = "border border-slate-500 px-2 py-1.5 align-top text-sm";

  return (
    <div className="p-4">
      <style>{`@media print{.no-print{display:none!important}@page{size:A4 portrait;margin:12mm}}`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href="/assets" className="text-sm text-slate-500">←</Link>
        <select className={`${inputCls} !w-auto`} value={locId} onChange={(e) => setLocId(e.target.value)}><option value="">เลือกห้อง</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <button onClick={() => window.print()} disabled={!room} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">🖨️ พิมพ์ใบสรุป</button>
      </div>
      {room && (<>
        <p className="text-center text-xs">{SCHOOL}</p>
        <h1 className="mb-3 text-center text-xl font-bold">ครุภัณฑ์ประจำห้อง {room}</h1>
        <table className="w-full border-collapse">
          <thead><tr className="bg-slate-100">{["ลำดับที่", "รายการ", "จำนวน", "หมายเลขครุภัณฑ์", "หมายเหตุ"].map((h) => <th key={h} className={cell}>{h}</th>)}</tr></thead>
          <tbody>{groups.map((g, i) => (
            <tr key={i}><td className={`${cell} text-center`}>{i + 1}</td><td className={cell}>{g[0].name}</td><td className={`${cell} text-center`}>{g.length}</td>
              <td className={`${cell} whitespace-pre-line font-mono text-xs`}>{codeRanges(g.map((a) => a.asset_code))}</td><td className={`${cell} text-red-600`}>{remark(g)}</td></tr>))}
            {groups.length === 0 && <tr><td colSpan={5} className={`${cell} text-center text-slate-400`}>ยังไม่มีครุภัณฑ์ในห้องนี้</td></tr>}</tbody>
        </table>
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-sm">
          <div>ลงชื่อ .............................................<br />(ครูประจำชั้น)<br />วันที่ ......../......../........</div>
          <div>ลงชื่อ .............................................<br />(ผู้ตรวจสอบ)<br />วันที่ ......../......../........</div>
        </div>
      </>)}
    </div>
  );
}
