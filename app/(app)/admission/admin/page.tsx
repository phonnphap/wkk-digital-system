"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LEVELS, PROGRAMS, ZONES, STATUS, RESULT, SUBJECTS, DOCS, docsFor, type Level } from "@/lib/admission-config";

const sb = createClient();
const box = "bg-white border border-slate-200 rounded-2xl";
const sel = "bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none";
const docLabel = (k: string) => DOCS.find((d) => d.key === k)?.label ?? k;
const toLocalInput = (iso?: string | null) => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

const Badge = ({ cfg }: { cfg: { label: string; cls: string } }) =>
  <span className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-black border ${cfg.cls}`}>{cfg.label}</span>;

export default function AdmissionAdmin() {
  const [year, setYear] = useState(new Date().getFullYear() + 544); // ปีการศึกษาถัดไป (พ.ศ.)
  const [level, setLevel] = useState<Level>("m1");
  const [tab, setTab] = useState<"apps" | "scores" | "round">("apps");
  const [apps, setApps] = useState<any[]>([]);
  const [round, setRound] = useState<any>(null);
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const [sel_, setSel] = useState<any>(null);
  const [note, setNote] = useState("");
  const [csv, setCsv] = useState("");
  const [quotas, setQuotas] = useState<Record<string, string>>({});
  const [reserve, setReserve] = useState("10");

  const load = useCallback(async () => {
    const [a, r] = await Promise.all([
      sb.from("admission_applications").select("*,admission_documents(*)").eq("academic_year", year).eq("level", level).order("application_no"),
      sb.from("admission_rounds").select("*").eq("academic_year", year).eq("level", level).maybeSingle(),
    ]);
    const rows = a.data ?? [];
    setApps(rows); setRound(r.data);
    setSel((s: any) => (s ? rows.find((x: any) => x.id === s.id) ?? null : null));
  }, [year, level]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setNote(sel_?.fix_note ?? ""); }, [sel_?.id]); // eslint-disable-line

  const missing = (a: any) => docsFor(a.level, a.zone).filter((d) => d.required && !a.admission_documents.some((x: any) => x.doc_type === d.key));
  const list = useMemo(() => apps.filter((a) =>
    (st === "all" || a.status === st) &&
    (!q || `${a.application_no} ${a.first_name} ${a.last_name} ${a.idcard} ${a.exam_no ?? ""}`.includes(q.trim()))), [apps, q, st]);
  const count = (s: string) => apps.filter((a) => a.status === s).length;

  // ── ตรวจเอกสาร ──
  async function openFile(path: string) {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch("/api/admission/file", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ path }) }).then((x) => x.json());
    if (r.ok) window.open(r.url, "_blank"); else alert(r.error);
  }
  async function markDoc(d: any, status: "ok" | "bad") {
    let n: string | null = null;
    if (status === "bad") { n = prompt("ระบุสิ่งที่ต้องแก้ไข เช่น รูปไม่ชัด / ไม่ใช่ฉบับที่ถูกต้อง"); if (!n) return; }
    await sb.from("admission_documents").update({ status, note: n }).eq("id", d.id);
    load();
  }
  async function setStatus(status: string) {
    const a = sel_;
    const bad = a.admission_documents.filter((d: any) => d.status === "bad");
    let fix: string | null = null;
    if (status === "need_fix") {
      fix = note.trim() || [...missing(a).map((m) => `ขาด: ${m.label}`), ...bad.map((d: any) => `${docLabel(d.doc_type)} — ${d.note}`)].join("\n");
      if (!fix) return alert("ระบุสิ่งที่ต้องแก้ไข หรือกด “ต้องแก้ไข” ที่เอกสารรายตัว");
    }
    if (status === "rejected") { fix = note.trim() || prompt("ระบุเหตุผลที่ไม่ผ่าน"); if (!fix) return; }
    if (status === "approved" && (missing(a).length || bad.length) && !confirm("ยังมีเอกสารบังคับขาด/ต้องแก้ไข ยืนยันให้ผ่านหรือไม่?")) return;
    await sb.from("admission_applications").update({ status, fix_note: fix }).eq("id", a.id);
    load();
  }

  // ── เลขที่นั่งสอบ / คะแนน / ผล ──
  async function assignExamNo() {
    let i = apps.filter((a) => a.exam_no).length;
    for (const a of apps.filter((x) => x.status === "approved" && !x.exam_no)) {
      i++; await sb.from("admission_applications").update({ exam_no: `${LEVELS[level].code}-${String(i).padStart(3, "0")}` }).eq("id", a.id);
    }
    load();
  }
  async function importScores() {
    const subj = SUBJECTS[level]; let n = 0;
    for (const line of csv.split("\n")) {
      const [key, ...v] = line.split(/[,\t]/).map((s) => s.trim());
      if (!key) continue;
      const a = apps.find((x) => x.exam_no === key || x.application_no === key);
      const nums = v.map(Number);
      if (!a || !nums.length || nums.some(isNaN)) continue;
      await sb.from("admission_applications").update({ scores: Object.fromEntries(subj.map((s, i) => [s, nums[i] ?? 0])), exam_total: nums.reduce((p, c) => p + c, 0) }).eq("id", a.id);
      n++;
    }
    alert(`นำเข้าคะแนน ${n} รายการ`); setCsv(""); load();
  }
  async function computeResults() {
    const groups: Record<string, any[]> = {};
    apps.filter((a) => a.exam_total != null && a.status === "approved").forEach((a) => (groups[`${a.program}|${a.zone}`] ??= []).push(a));
    const jobs: any[] = [];
    for (const [g, rows] of Object.entries(groups)) {
      rows.sort((a, b) => b.exam_total - a.exam_total);
      const quota = Number(quotas[g] ?? 0), rsv = Number(reserve);
      rows.forEach((a) => {
        const rank = rows.findIndex((x) => x.exam_total === a.exam_total) + 1; // คะแนนเท่ากัน = อันดับเท่ากัน
        jobs.push(sb.from("admission_applications").update({ exam_rank: rank, result: rank <= quota ? "pass" : rank <= quota + rsv ? "reserve" : "fail" }).eq("id", a.id));
      });
    }
    await Promise.all(jobs); load();
  }

  // ── รอบรับสมัคร ──
  async function saveRound(patch: any) {
    const r = { academic_year: year, level, is_open: false, scores_published: false, results_published: false, ...round, ...patch };
    const { error } = await sb.from("admission_rounds").upsert(r, { onConflict: "academic_year,level" });
    if (error) alert(error.message); else load();
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Sarabun','IBM Plex Sans Thai',sans-serif" }}>
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white px-5 py-6 flex items-center justify-between gap-3 flex-wrap">
        <div><p className="text-indigo-200 text-sm font-bold">งานรับนักเรียน</p><h1 className="text-2xl font-black">จัดการการรับสมัคร ปีการศึกษา {year}</h1></div>
        <div className="flex gap-2 items-center">
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 rounded-xl px-3 py-2 text-slate-800 font-bold text-sm" />
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button key={l} onClick={() => setLevel(l)} className={`px-4 py-2 rounded-xl text-sm font-black border-2 ${level === l ? "bg-white text-indigo-700 border-white" : "border-white/40 text-white"}`}>{LEVELS[l].label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[["ทั้งหมด", apps.length, "text-slate-800"], ["รอตรวจ", count("submitted"), "text-amber-600"], ["ต้องแก้ไข", count("need_fix"), "text-orange-600"], ["เอกสารผ่าน", count("approved"), "text-green-600"], ["ไม่ผ่าน", count("rejected"), "text-red-600"]].map(([l, n, c]) => (
            <div key={l as string} className={`${box} p-3 text-center`}><div className={`text-2xl font-black ${c}`}>{n as number}</div><div className="text-xs font-bold text-slate-500">{l}</div></div>
          ))}
        </div>

        <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          {([["apps", "📋 ใบสมัคร/ตรวจเอกสาร"], ["scores", "📊 คะแนนสอบ/ผล"], ["round", "⚙️ เปิด-ปิดรอบ/ประกาศ"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2.5 rounded-xl text-sm font-black ${tab === k ? "bg-white shadow border border-slate-200 text-slate-800" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>

        {tab === "apps" && (
          <>
            <div className="flex gap-2 flex-wrap">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหาชื่อ / เลขใบสมัคร / เลขบัตร" className="flex-1 min-w-[220px] bg-white border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none" />
              <select value={st} onChange={(e) => setSt(e.target.value)} className={sel}><option value="all">ทุกสถานะ</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            </div>
            <div className={`${box} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 border-b text-slate-600 text-left"><th className="px-4 py-3">เลขที่</th><th className="px-3 py-3">ชื่อ-สกุล</th><th className="px-3 py-3">ห้อง / เขต</th><th className="px-3 py-3">เอกสาร</th><th className="px-3 py-3">สถานะ</th><th className="px-3 py-3" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((a) => {
                    const m = missing(a).length;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-black">{a.application_no}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-800">{a.prefix}{a.first_name} {a.last_name}</td>
                        <td className="px-3 py-2.5 text-slate-500">{PROGRAMS[a.program as keyof typeof PROGRAMS]} · {ZONES[a.zone as keyof typeof ZONES]}</td>
                        <td className="px-3 py-2.5">{m ? <span className="text-xs font-black text-amber-600">ขาด {m}</span> : <span className="text-xs font-black text-green-600">ครบ</span>}</td>
                        <td className="px-3 py-2.5"><Badge cfg={STATUS[a.status]} /></td>
                        <td className="px-3 py-2.5 text-right"><button onClick={() => setSel(a)} className="text-xs font-black text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50">ตรวจ</button></td>
                      </tr>
                    );
                  })}
                  {list.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">ไม่พบใบสมัคร</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "scores" && (
          <div className="space-y-4">
            <div className={`${box} p-5 space-y-3`}>
              <p className="font-black text-slate-700">1) ออกเลขที่นั่งสอบ (เฉพาะผู้ที่เอกสารผ่าน)</p>
              <button onClick={assignExamNo} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black">ออกเลขที่นั่งสอบให้ผู้ที่ยังไม่มี ({apps.filter((a) => a.status === "approved" && !a.exam_no).length} คน)</button>
            </div>
            <div className={`${box} p-5 space-y-3`}>
              <p className="font-black text-slate-700">2) นำเข้าคะแนน — วางจาก Excel</p>
              <p className="text-xs text-slate-400">แต่ละบรรทัด: เลขที่นั่งสอบ (หรือเลขใบสมัคร) แล้วตามด้วยคะแนนตามลำดับ <b>{SUBJECTS[level].join(" · ")}</b> คั่นด้วย comma หรือแท็บ</p>
              <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} placeholder={`${LEVELS[level].code}-001\t38\t25\t40\t35`} className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-mono" />
              <button onClick={importScores} disabled={!csv.trim()} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50">นำเข้าคะแนน</button>
            </div>
            <div className={`${box} p-5 space-y-3`}>
              <p className="font-black text-slate-700">3) กำหนดจำนวนรับ แล้วคำนวณอันดับ/ผล</p>
              <div className="grid sm:grid-cols-3 gap-2">
                {Object.entries(PROGRAMS).flatMap(([p, pl]) => Object.entries(ZONES).map(([z, zl]) => (
                  <label key={`${p}|${z}`} className="text-xs font-bold text-slate-500">{pl} · {zl} รับกี่คน
                    <input type="number" min={0} value={quotas[`${p}|${z}`] ?? ""} onChange={(e) => setQuotas((s) => ({ ...s, [`${p}|${z}`]: e.target.value }))} className="w-full mt-1 border-2 border-slate-200 rounded-lg px-2 py-1.5 text-sm" /></label>
                )))}
              </div>
              <label className="text-xs font-bold text-slate-500 block">จำนวนตัวสำรองต่อกลุ่ม <input type="number" min={0} value={reserve} onChange={(e) => setReserve(e.target.value)} className="w-20 ml-2 border-2 border-slate-200 rounded-lg px-2 py-1 text-sm" /></label>
              <button onClick={computeResults} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black">คำนวณอันดับและผล</button>
              <p className="text-xs text-slate-400">คะแนนเท่ากันจะได้อันดับเดียวกัน · ผลจะยังไม่แสดงต่อผู้สมัครจนกว่าจะกดประกาศที่แท็บ “เปิด-ปิดรอบ/ประกาศ”</p>
            </div>
            <div className={`${box} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 border-b text-slate-600 text-left"><th className="px-4 py-3">นั่งสอบ</th><th className="px-3 py-3">ชื่อ</th><th className="px-3 py-3">ห้อง/เขต</th><th className="px-3 py-3 text-right">คะแนน</th><th className="px-3 py-3 text-right">อันดับ</th><th className="px-3 py-3">ผล</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {apps.filter((a) => a.exam_no).sort((a, b) => (b.exam_total ?? -1) - (a.exam_total ?? -1)).map((a) => (
                    <tr key={a.id}><td className="px-4 py-2 font-black">{a.exam_no}</td><td className="px-3 py-2">{a.first_name} {a.last_name}</td>
                      <td className="px-3 py-2 text-slate-500">{PROGRAMS[a.program as keyof typeof PROGRAMS]} · {ZONES[a.zone as keyof typeof ZONES]}</td>
                      <td className="px-3 py-2 text-right font-black">{a.exam_total ?? "-"}</td><td className="px-3 py-2 text-right">{a.exam_rank ?? "-"}</td><td className="px-3 py-2"><Badge cfg={RESULT[a.result]} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "round" && (
          <div className={`${box} p-5 space-y-4`}>
            <p className="font-black text-slate-700">รอบรับสมัคร {LEVELS[level].label} ปี {year} {!round && <span className="text-xs text-amber-600">(ยังไม่ได้สร้าง — กดบันทึกเพื่อสร้าง)</span>}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm font-bold text-slate-600">เปิดรับสมัครตั้งแต่<input type="datetime-local" defaultValue={toLocalInput(round?.open_at)} key={"o" + round?.open_at} onBlur={(e) => saveRound({ open_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full mt-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm" /></label>
              <label className="text-sm font-bold text-slate-600">ปิดรับสมัคร<input type="datetime-local" defaultValue={toLocalInput(round?.close_at)} key={"c" + round?.close_at} onBlur={(e) => saveRound({ close_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full mt-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm" /></label>
            </div>
            <label className="text-sm font-bold text-slate-600 block">ข้อความประกาศถึงผู้สมัคร
              <textarea defaultValue={round?.note ?? ""} key={"n" + round?.note} rows={2} onBlur={(e) => saveRound({ note: e.target.value || null })} className="w-full mt-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm" /></label>
            <div className="flex gap-2 flex-wrap">
              {([["is_open", "เปิดรับสมัคร"], ["scores_published", "ประกาศคะแนน"], ["results_published", "ประกาศผลผ่าน/ไม่ผ่าน"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => saveRound({ [k]: !round?.[k] })} className={`px-4 py-2.5 rounded-xl border-2 text-sm font-black ${round?.[k] ? "bg-green-500 border-green-500 text-white" : "bg-white border-slate-200 text-slate-600"}`}>{round?.[k] ? "✅ " : "⬜ "}{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {sel_ && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between">
              <div><p className="font-black text-slate-800">{sel_.prefix}{sel_.first_name} {sel_.last_name}</p><p className="text-xs text-slate-500">{sel_.application_no} · {PROGRAMS[sel_.program as keyof typeof PROGRAMS]} · {ZONES[sel_.zone as keyof typeof ZONES]}</p></div>
              <button onClick={() => setSel(null)} className="w-8 h-8 rounded-xl bg-slate-200 font-bold">✕</button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[["เลขบัตร", sel_.idcard], ["วันเกิด", sel_.birthdate], ["โทรนักเรียน", sel_.student_phone], ["GPA", sel_.gpa], ["โรงเรียนเดิม", sel_.prev_school || "-"],
                  ["ผู้ปกครอง", `${sel_.guardian?.name ?? "-"} (${sel_.guardian?.relationship ?? "-"}) ${sel_.guardian?.phone ?? ""}`],
                  ["ที่อยู่", `${sel_.address?.house_no ?? ""} ม.${sel_.address?.village_no ?? "-"} ต.${sel_.address?.district ?? ""} อ.${sel_.address?.amphoe ?? ""} จ.${sel_.address?.province ?? ""} ${sel_.address?.zipcode ?? ""}`],
                  ["โรคประจำตัว/แพ้อาหาร", `${sel_.congenital_disease || "-"} / ${sel_.food_allergy || "-"}`]].map(([k, v]) => (
                  <div key={k as string} className="bg-slate-50 rounded-lg p-2"><div className="text-slate-400 font-bold">{k}</div><div className="font-bold text-slate-700">{String(v)}</div></div>
                ))}
              </div>

              <div className="space-y-1.5">
                <p className="font-black text-slate-700">เอกสาร</p>
                {docsFor(sel_.level, sel_.zone).map((d) => {
                  const x = sel_.admission_documents.find((y: any) => y.doc_type === d.key);
                  if (!x && !d.required) return null;
                  return (
                    <div key={d.key} className={`flex items-center justify-between gap-2 flex-wrap rounded-xl border-2 px-3 py-2 ${!x ? "border-amber-200 bg-amber-50" : x.status === "ok" ? "border-green-200 bg-green-50" : x.status === "bad" ? "border-orange-300 bg-orange-50" : "border-slate-200"}`}>
                      <div><p className="font-bold text-slate-700 text-xs">{d.label}{d.required && <b className="text-red-500"> *</b>}</p>
                        {!x && <p className="text-[11px] font-black text-amber-600">ยังไม่ได้อัปโหลด</p>}
                        {x?.status === "bad" && <p className="text-[11px] font-bold text-orange-700">{x.note}</p>}</div>
                      {x && (
                        <div className="flex gap-1.5">
                          <button onClick={() => openFile(x.onedrive_path)} className="text-[11px] font-black px-2 py-1 rounded-lg border border-blue-200 text-blue-600 bg-white">ดูไฟล์</button>
                          <button onClick={() => markDoc(x, "ok")} className="text-[11px] font-black px-2 py-1 rounded-lg border border-green-300 text-green-700 bg-white">ผ่าน</button>
                          <button onClick={() => markDoc(x, "bad")} className="text-[11px] font-black px-2 py-1 rounded-lg border border-orange-300 text-orange-700 bg-white">ต้องแก้ไข</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <label className="block text-xs font-bold text-slate-600">ข้อความถึงผู้สมัคร (ใช้เมื่อกด “ต้องแก้ไข” / “ไม่ผ่าน” — เว้นว่าง = สร้างจากเอกสารที่ติ๊กไว้ให้อัตโนมัติ)
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full mt-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm" /></label>
            </div>
            <div className="px-5 py-4 border-t flex gap-2 flex-wrap">
              <button onClick={() => setStatus("reviewing")} className="px-3 py-2.5 rounded-xl border-2 border-blue-200 text-blue-700 font-black text-xs">กำลังตรวจ</button>
              <button onClick={() => setStatus("need_fix")} className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-black text-sm">⚠️ ต้องแก้ไข</button>
              <button onClick={() => setStatus("rejected")} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-black text-sm">❌ ไม่ผ่าน</button>
              <button onClick={() => setStatus("approved")} className="flex-1 py-2.5 rounded-xl bg-green-500 text-white font-black text-sm">✅ เอกสารผ่าน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}