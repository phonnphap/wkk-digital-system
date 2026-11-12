// 📁 วางที่: app/admission/page.tsx  [ทับของเดิม (หน้าผู้สมัคร /admission)]
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LEVELS, PROGRAMS, ZONES, STATUS, RESULT, docsFor, ctxOf,
  type Level, type Program, type Zone,
} from "@/lib/admission-config";
import {
  thaiIdState, ageProblem, gpaProblem, calcAge, ageRefOf, thaiDate, parentNameProblem,
  studentPrefixProblem, inZone, PARENT_STATUS, type ZoneArea,
} from "@/lib/admission-rules";
import { useAddresses, searchAddr, addrExists, type AddrRow, type AddrField } from "@/lib/thai-address";

const sb = createClient();
const inp = "w-full mt-1 bg-white border-2 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none";
const bc = (s?: "ok" | "bad" | "warn") => s === "ok" ? "border-green-400 focus:border-green-500" : s === "bad" ? "border-red-400 focus:border-red-500" : s === "warn" ? "border-amber-400" : "border-blue-200 focus:border-blue-500";
const post = (url: string, body: any) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const thaiDT = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

/** ย่อรูปจากมือถือให้ไม่เกิน 4MB ก่อนอัปโหลด */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1.5 * 1024 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = bmp.width * s; c.height = bmp.height * s;
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.8));
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

const Badge = ({ cfg }: { cfg: { label: string; cls: string } }) =>
  <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black border ${cfg.cls}`}>{cfg.label}</span>;
const Hint = ({ t, kind }: { t: React.ReactNode; kind: "ok" | "bad" | "warn" | "info" }) => (
  <p className={`text-xs font-bold mt-1 ${kind === "ok" ? "text-green-600" : kind === "bad" ? "text-red-600" : kind === "warn" ? "text-amber-600" : "text-slate-500"}`}>{t}</p>
);

/** กำหนดการของห้องนั้น ๆ */
function Schedule({ r }: { r: any }) {
  const L: [string, string | null][] = [
    ["วันสอบ", r.exam_date ? thaiDate(r.exam_date) : null],
    ["ประกาศคะแนน", r.scores_announce_at ? thaiDT(r.scores_announce_at) : null],
    ["ประกาศผล", r.results_announce_at ? thaiDT(r.results_announce_at) : null],
    ["รายงานตัว", r.report_start ? `${thaiDate(r.report_start)}${r.report_end ? " – " + thaiDate(r.report_end) : ""}` : null],
  ];
  const rows = L.filter(([, v]) => v);
  if (!rows.length) return null;
  return <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs text-slate-600">{rows.map(([k, v]) => <span key={k}><b className="text-slate-700">{k}:</b> {v}</span>)}</div>;
}

// ══════════ อัปโหลดเอกสาร (มีภาพตัวอย่างก่อนยืนยัน) ══════════
type Thumb = { url: string; img: boolean; name: string };
function DocUploader({ app, docs, onDone }: { app: any; docs: any[]; onDone: () => void }) {
  const [pending, setPending] = useState<Record<string, { file: File; url: string }>>({});
  const [thumbs, setThumbs] = useState<Record<string, Thumb>>({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [box, setBox] = useState<Thumb | null>(null);
  const map = Object.fromEntries(docs.map((d) => [d.doc_type, d]));
  const locked = ["approved", "rejected"].includes(app.status);

  async function pick(key: string, f?: File) {
    if (!f) return;
    setErr("");
    const s = await shrink(f);
    if (s.size > 4 * 1024 * 1024) return setErr("ไฟล์ใหญ่เกิน 4MB");
    setPending((p) => ({ ...p, [key]: { file: s, url: URL.createObjectURL(s) } }));
  }
  const cancel = (key: string) => setPending((p) => { const n = { ...p }; if (n[key]) URL.revokeObjectURL(n[key].url); delete n[key]; return n; });

  async function confirm(key: string) {
    const p = pending[key]; if (!p) return;
    setBusy(key); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", p.file); fd.append("applicationId", app.id); fd.append("token", app.edit_token); fd.append("docType", key);
      const r = await (await fetch("/api/admission/upload", { method: "POST", body: fd })).json();
      if (!r.ok) throw new Error(r.error);
      setThumbs((t) => ({ ...t, [key]: { url: p.url, img: p.file.type.startsWith("image/"), name: p.file.name } }));
      setPending((s) => { const n = { ...s }; delete n[key]; return n; });
      onDone();
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  async function view(key: string) {
    if (thumbs[key]) return setBox(thumbs[key]);
    const r = await post("/api/admission/myfile", { applicationId: app.id, token: app.edit_token, docType: key });
    if (!r.ok) return setErr(r.error);
    setBox({ url: r.url, img: /\.(jpe?g|png)$/i.test(r.name ?? ""), name: r.name ?? "" });
  }

  const Preview = ({ t, h = "h-48" }: { t: Thumb; h?: string }) =>
    t.img ? <img src={t.url} alt={t.name} className={`${h} w-auto max-w-full object-contain rounded-lg border bg-slate-50`} />
      : <iframe src={t.url} title={t.name} className={`${h} w-full rounded-lg border bg-slate-50`} />;

  return (
    <div className="space-y-2">
      {err && <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
      {docsFor(ctxOf(app)).map((d) => {
        const x = map[d.key]; const p = pending[d.key]; const t = thumbs[d.key];
        return (
          <div key={d.key} className={`rounded-xl border-2 p-3 ${p ? "border-blue-300 bg-blue-50" : x?.status === "bad" ? "border-orange-300 bg-orange-50" : x?.status === "ok" ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-bold text-slate-700">{d.label}{d.required && <b className="text-red-500"> *</b>}</div>
              <div className="flex items-center gap-2">
                {x && !p && <span className="text-xs font-black text-slate-500">{x.status === "ok" ? "✅ ผ่าน" : x.status === "bad" ? "⚠️ ต้องแก้ไข" : "⏳ รอตรวจ"}</span>}
                {x && !p && <button type="button" onClick={() => view(d.key)} className="text-xs font-black px-2.5 py-1.5 rounded-lg border-2 border-slate-200 bg-white text-slate-600">👁️ ดูไฟล์</button>}
                {!locked && !p && (
                  <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-blue-50 border-2 border-blue-200 text-blue-700 text-xs font-black hover:bg-blue-100">
                    {x ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={!!busy}
                      onChange={(e) => { pick(d.key, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            </div>
            {x?.status === "bad" && x.note && !p && <p className="text-xs font-bold text-orange-700 mt-1.5">สิ่งที่ต้องแก้ไข: {x.note}</p>}
            {t && !p && t.img && <button type="button" onClick={() => setBox(t)} className="mt-2 block"><img src={t.url} alt="" className="h-16 rounded-lg border object-cover" /></button>}
            {p && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-black text-blue-700">ตัวอย่างไฟล์ที่เลือก — ตรวจดูว่าชัดเจนและเป็นเอกสารที่ถูกต้อง ({p.file.name}, {(p.file.size / 1024).toFixed(0)} KB)</p>
                <Preview t={{ url: p.url, img: p.file.type.startsWith("image/"), name: p.file.name }} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => cancel(d.key)} disabled={busy === d.key} className="flex-1 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">เลือกใหม่</button>
                  <button type="button" onClick={() => confirm(d.key)} disabled={busy === d.key} className="flex-[2] py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">{busy === d.key ? "กำลังอัปโหลด..." : "✅ ยืนยันอัปโหลดไฟล์นี้"}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-slate-400">รองรับ PDF, JPG, PNG · ไฟล์ละไม่เกิน 4MB (รูปถ่ายจากมือถือระบบย่อให้อัตโนมัติ)</p>
      {box && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setBox(null)}>
          <div className="bg-white rounded-2xl p-3 max-w-3xl w-full max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2"><p className="text-sm font-black text-slate-700 truncate">{box.name}</p><button onClick={() => setBox(null)} className="w-8 h-8 rounded-xl bg-slate-100 font-bold">✕</button></div>
            <Preview t={box} h="h-[75vh]" />
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════ ตรวจสอบสถานะ / ผลสอบรายบุคคล ══════════
function Status({ init, banner }: { init?: { idcard: string; birthdate: string }; banner?: string }) {
  const [idcard, setId] = useState(init?.idcard ?? "");
  const [bd, setBd] = useState(init?.birthdate ?? "");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true); setErr("");
    const r = await post("/api/admission/lookup", { action: "status", idcard, birthdate: bd });
    if (r.ok) setD(r); else { setD(null); setErr(r.error); }
    setBusy(false);
  }
  useEffect(() => { if (init) go(); }, []); // eslint-disable-line

  async function resubmit() {
    const r = await post("/api/admission/lookup", { action: "resubmit", idcard, birthdate: bd });
    if (!r.ok) return alert(r.error);
    alert("ส่งเอกสารที่แก้ไขให้เจ้าหน้าที่ตรวจอีกครั้งแล้ว"); go();
  }

  const a = d?.app;
  const missing = a ? docsFor(ctxOf(a)).filter((x) => x.required && !d.docs.some((y: any) => y.doc_type === x.key)) : [];
  const idS = thaiIdState(idcard);

  return (
    <div className="space-y-4">
      {banner && <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-4 text-green-800 font-bold text-sm">{banner}</div>}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 grid sm:grid-cols-3 gap-3 items-start">
        <label className="text-sm font-bold text-slate-600">เลขประจำตัวประชาชน
          <input className={`${inp} ${bc(idS === "ok" ? "ok" : idS === "bad" ? "bad" : undefined)}`} maxLength={13} inputMode="numeric" value={idcard} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} />
          {idS === "bad" && <Hint kind="bad" t="เลขบัตรไม่ถูกต้อง" />}</label>
        <label className="text-sm font-bold text-slate-600">วันเกิดนักเรียน
          <input className={`${inp} ${bc()}`} type="date" value={bd} onChange={(e) => setBd(e.target.value)} /></label>
        <button onClick={go} disabled={busy || idS !== "ok" || !bd} className="mt-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
          {busy ? "กำลังค้นหา..." : "ตรวจสอบ"}</button>
      </div>
      {err && <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{err}</p>}

      {a && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-slate-50 border-b px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-black text-slate-800 text-lg">{a.prefix}{a.first_name} {a.last_name}</p>
              <p className="text-slate-500 text-sm">เลขที่ใบสมัคร {a.application_no} · {LEVELS[a.level as Level].label} · {PROGRAMS[a.program as Program]} · {ZONES[a.zone as Zone]}</p>
            </div>
            <Badge cfg={STATUS[a.status]} />
          </div>
          <div className="p-5 space-y-4">
            {d.note && <p className="text-sm bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-blue-800 font-bold">📢 {d.note}</p>}
            {d.schedule && <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"><p className="text-xs font-black text-slate-500 mb-1">กำหนดการของห้อง {PROGRAMS[a.program as Program]}</p><Schedule r={d.schedule} /></div>}
            {a.status === "need_fix" && (
              <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
                <p className="font-black text-orange-700 mb-1">ต้องแก้ไข</p>
                <p className="text-sm text-orange-800 font-bold whitespace-pre-line">{a.fix_note || "กรุณาตรวจสอบเอกสารที่มีเครื่องหมาย ⚠️ ด้านล่าง"}</p>
              </div>
            )}
            {a.status === "rejected" && a.fix_note && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">{a.fix_note}</p>}
            {missing.length > 0 && !["approved", "rejected"].includes(a.status) && (
              <p className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">ยังขาดเอกสารบังคับ {missing.length} รายการ: {missing.map((m) => m.label).join(", ")}</p>
            )}
            {a.exam_no && <p className="text-sm font-bold text-slate-600">เลขที่นั่งสอบ: <span className="text-xl font-black text-indigo-700">{a.exam_no}</span></p>}
            {d.scores && (
              <div className="border-2 border-indigo-100 rounded-xl p-4">
                <p className="font-black text-indigo-700 mb-2">คะแนนสอบ</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  {Object.entries(d.scores.by_subject ?? {}).map(([k, v]) => (
                    <div key={k} className="bg-slate-50 rounded-lg p-2 text-center"><div className="text-xs text-slate-400 font-bold">{k}</div><div className="font-black text-slate-800">{String(v)}</div></div>
                  ))}
                  <div className="bg-indigo-50 rounded-lg p-2 text-center"><div className="text-xs text-indigo-400 font-bold">รวม</div><div className="font-black text-indigo-700">{d.scores.total}</div></div>
                </div>
              </div>
            )}
            {d.result && d.result.result !== "pending" && (
              <div className="flex items-center gap-3"><Badge cfg={RESULT[d.result.result]} />{d.result.rank && <span className="text-sm font-bold text-slate-500">อันดับที่ {d.result.rank}</span>}</div>
            )}
            <div>
              <p className="font-black text-slate-700 mb-2">📎 เอกสารประกอบการสมัคร</p>
              <DocUploader app={a} docs={d.docs} onDone={go} />
            </div>
            {a.status === "need_fix" && (
              <button onClick={resubmit} className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm">แก้ไขครบแล้ว — ส่งให้เจ้าหน้าที่ตรวจอีกครั้ง</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════ ประกาศคะแนนสอบ (รายการ แยกตามห้อง) ══════════
function Board() {
  const [level, setLevel] = useState<Level>("m1");
  const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); post("/api/admission/lookup", { action: "board", level }).then(setD); }, [level]);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(Object.keys(LEVELS) as Level[]).map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={`px-4 py-2 rounded-xl border-2 text-sm font-black ${level === l ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>{LEVELS[l].label}</button>
        ))}
      </div>
      {!d ? <p className="text-slate-400 text-sm">กำลังโหลด...</p> : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            {(d.rounds ?? []).map((r: any) => (
              <div key={r.program} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between"><p className="font-black text-slate-800">{PROGRAMS[r.program as Program]}</p>
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg border ${r.results_published ? "bg-green-100 text-green-700 border-green-300" : r.scores_published ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "bg-slate-100 text-slate-500 border-slate-300"}`}>
                    {r.results_published ? "ประกาศผลแล้ว" : r.scores_published ? "ประกาศคะแนนแล้ว" : "ยังไม่ประกาศ"}</span></div>
                <Schedule r={r} />
                {r.note && <p className="text-xs text-blue-700 font-bold">📢 {r.note}</p>}
              </div>
            ))}
          </div>
          {d.rows.length === 0 ? <p className="text-center py-8 text-slate-400 bg-white border border-slate-200 rounded-2xl">ยังไม่มีรายการที่ประกาศของ {LEVELS[level].label}</p> : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 border-b text-slate-600"><th className="px-4 py-3 text-left">เลขที่นั่งสอบ</th><th className="px-3 py-3 text-left">ห้อง</th><th className="px-3 py-3 text-left">เขต</th><th className="px-3 py-3 text-right">คะแนน</th><th className="px-3 py-3 text-right">อันดับ</th><th className="px-3 py-3 text-left">ผล</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {d.rows.map((r: any) => (
                    <tr key={r.exam_no} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-black text-slate-800">{r.exam_no}</td>
                      <td className="px-3 py-2.5">{PROGRAMS[r.program as Program]}</td>
                      <td className="px-3 py-2.5">{ZONES[r.zone as Zone]}</td>
                      <td className="px-3 py-2.5 text-right font-black">{r.exam_total}</td>
                      <td className="px-3 py-2.5 text-right">{r.exam_rank ?? "-"}</td>
                      <td className="px-3 py-2.5">{r.result ? <Badge cfg={RESULT[r.result]} /> : <span className="text-xs text-slate-400">รอประกาศ</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════ ช่องที่อยู่แบบเลือกจากรายการ ══════════
function AddrInput({ label, field, f, setMany, rows, span }: { label: string; field: AddrField; f: Record<string, string>; setMany: (o: Record<string, string>) => void; rows: AddrRow[]; span?: string }) {
  const [open, setOpen] = useState(false);
  const val = f[field] ?? "";
  const list = useMemo(() => (open ? searchAddr(rows, field, val) : []), [open, val, rows, field]);
  const pickRow = (r: AddrRow) => { setMany({ district: r[0], amphoe: r[1], province: r[2], zipcode: String(r[3]) }); setOpen(false); };
  return (
    <label className={`block text-sm font-bold text-slate-600 relative ${span ?? ""}`}>{label}<b className="text-red-500"> *</b>
      <input className={`${inp} ${bc()}`} value={val} autoComplete="off" inputMode={field === "zipcode" ? "numeric" : undefined} maxLength={field === "zipcode" ? 5 : undefined}
        onChange={(e) => { setMany({ [field]: field === "zipcode" ? e.target.value.replace(/\D/g, "") : e.target.value }); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {list.length > 0 && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
          {list.map((r, i) => (
            <button key={i} type="button" onMouseDown={(e) => { e.preventDefault(); pickRow(r); }} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-slate-50">
              <b className="text-slate-800">{r[0]}</b> · อ.{r[1]} · จ.{r[2]} · <span className="text-blue-600 font-black">{r[3]}</span></button>
          ))}
        </div>
      )}
    </label>
  );
}

// ══════════ ฟอร์มสมัคร ══════════
function Apply({ onDone }: { onDone: (idcard: string, birthdate: string, appNo: string) => void }) {
  const rows = useAddresses();
  const [rounds, setRounds] = useState<any[]>([]);
  const [areas, setAreas] = useState<ZoneArea[]>([]);
  const [level, setLevel] = useState<Level>("m1");
  const [program, setProgram] = useState<Program>("regular");
  const [zone, setZone] = useState<Zone>("in");
  const [f, setF] = useState<Record<string, string>>({ race: "ไทย", nationality: "ไทย", religion: "พุทธ", father_status: "alive", mother_status: "alive" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const setMany = (o: Record<string, string>) => setF((p) => ({ ...p, ...o }));
  const set = (k: string, v: string) => setMany({ [k]: v });

  useEffect(() => {
    sb.from("admission_rounds").select("*").then(({ data }) => setRounds(data ?? []));
    sb.from("admission_zone_areas").select("province,amphoe,district,village_nos").then(({ data }) => setAreas(data ?? []));
  }, []);

  const roundOf = (l: Level, p: Program) => rounds.filter((r) => r.level === l && r.program === p).sort((a, b) => b.academic_year - a.academic_year)[0];
  const open = (l: Level, p: Program) => {
    const r = roundOf(l, p); const n = Date.now();
    return !!r?.is_open && (!r.open_at || n >= +new Date(r.open_at)) && (!r.close_at || n <= +new Date(r.close_at));
  };
  const rnd = roundOf(level, program);
  const enforce = rnd?.enforce_rules !== false;

  // ── ตรวจแบบทันที ──
  const idS = thaiIdState(f.idcard ?? "");
  const ageMsg = f.birthdate && rnd ? ageProblem(f.birthdate, rnd) : null;
  const ageInfo = f.birthdate && rnd && (rnd.min_age != null || rnd.max_age != null) && !ageMsg
    ? (() => { const a = calcAge(f.birthdate, ageRefOf(rnd)); return `อายุ ณ ${thaiDate(ageRefOf(rnd))} = ${a.years} ปี ${a.months} เดือน — ผ่านเกณฑ์`; })() : null;
  const gpaMsg = f.gpa && rnd ? gpaProblem(f.gpa, rnd) : null;
  const pre = studentPrefixProblem(f.prefix ?? "", f.sex ?? "", level);
  const fe = f.father_status !== "unknown" ? parentNameProblem(f.father_name ?? "", "father") : null;
  const me = f.mother_status !== "unknown" ? parentNameProblem(f.mother_name ?? "", "mother") : null;
  const ge = parentNameProblem(f.guardian_name ?? "", "guardian");
  const addrFilled = !!(f.district && f.amphoe && f.province);
  const addrOk = addrFilled && addrExists(rows, f.district, f.amphoe, f.province);
  const zoneRes = addrOk ? inZone({ province: f.province, amphoe: f.amphoe, district: f.district, village_no: f.village_no }, areas) : null;

  const problems: string[] = [];
  if (idS === "bad") problems.push("เลขประจำตัวประชาชนไม่ถูกต้อง");
  if (ageMsg && enforce) problems.push(ageMsg);
  if (gpaMsg && enforce) problems.push(gpaMsg);
  if (pre.error) problems.push(pre.error);
  if (fe) problems.push(`ชื่อบิดา: ${fe}`);
  if (me) problems.push(`ชื่อมารดา: ${me}`);
  if (ge) problems.push(`ชื่อผู้ปกครอง: ${ge}`);
  if (addrFilled && !addrOk) problems.push("ที่อยู่ ตำบล/อำเภอ/จังหวัด ต้องเลือกจากรายการที่ระบบแนะนำ");
  if (zone === "in" && zoneRes === false) problems.push("ที่อยู่ไม่อยู่ในเขตบริการ — ต้องสมัครแบบนอกเขต");
  if (!open(level, program)) problems.push("ห้องนี้ยังไม่เปิดรับสมัคร");

  const T = (k: string, label: string, o: { req?: boolean; type?: string; span?: string; attrs?: any; hint?: React.ReactNode; st?: "ok" | "bad" | "warn" } = {}) => (
    <label className={`block text-sm font-bold text-slate-600 ${o.span ?? ""}`}>{label}{o.req && <b className="text-red-500"> *</b>}
      <input className={`${inp} ${bc(o.st)}`} type={o.type ?? "text"} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} {...o.attrs} />{o.hint}</label>
  );
  const Pick = ({ items, val, on }: { items: [string, string][]; val: string; on: (v: any) => void }) => (
    <div className="flex gap-2 flex-wrap">
      {items.map(([k, l]) => (
        <button key={k} type="button" onClick={() => on(k)}
          className={`px-4 py-2.5 rounded-xl border-2 text-sm font-black ${val === k ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>{l}</button>
      ))}
    </div>
  );
  const ParentBlock = ({ role, label }: { role: "father" | "mother"; label: string }) => {
    const st = f[`${role}_status`] ?? "alive";
    const e = role === "father" ? fe : me;
    return (
      <div className="sm:col-span-3 grid sm:grid-cols-3 gap-3 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
        <label className="block text-sm font-bold text-slate-600">สถานะ{label}
          <select className={`${inp} ${bc()}`} value={st} onChange={(ev) => set(`${role}_status`, ev.target.value)}>
            {Object.entries(PARENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {st !== "unknown" && T(`${role}_name`, `ชื่อ-สกุล${label} (ระบุคำนำหน้า)`, { span: st === "alive" ? "" : "sm:col-span-2", st: e ? "bad" : f[`${role}_name`] ? "ok" : undefined, hint: e ? <Hint kind="bad" t={e} /> : undefined })}
        {st === "alive" && T(`${role}_occ`, `อาชีพ${label}`)}
        {st === "alive" && T(`${role}_phone`, `โทร${label}`, { attrs: { maxLength: 10, inputMode: "tel" } })}
        {st === "dead" && <p className="sm:col-span-3 text-xs font-bold text-orange-600">ต้องแนบสำเนามรณบัตรของ{label}ในขั้นตอนอัปโหลดเอกสาร</p>}
        {st === "lost" && <p className="sm:col-span-3 text-xs font-bold text-orange-600">ต้องแนบทะเบียนราษฎร์/ทะเบียนบ้านที่แสดงว่า{label}ติดต่อไม่ได้-ทอดทิ้ง ในขั้นตอนอัปโหลดเอกสาร</p>}
      </div>
    );
  };

  const required: [string, string][] = [["idcard", "เลขประจำตัวประชาชน"], ["prefix", "คำนำหน้า"], ["first_name", "ชื่อ"], ["last_name", "นามสกุล"],
    ["birthdate", "วันเกิด"], ["sex", "เพศ"], ["student_phone", "เบอร์โทรนักเรียน"], ["gpa", "เกรดเฉลี่ย"], ["house_no", "บ้านเลขที่"],
    ["village_no", "หมู่ที่ (ไม่มีใส่ -)"], ["district", "ตำบล"], ["amphoe", "อำเภอ"], ["province", "จังหวัด"], ["zipcode", "รหัสไปรษณีย์"],
    ["guardian_name", "ชื่อผู้ปกครอง"], ["guardian_phone", "เบอร์ผู้ปกครอง"], ["guardian_rel", "ความเกี่ยวข้อง"]];

  async function submit() {
    const miss = required.find(([k]) => !f[k]?.trim());
    if (miss) return setErr(`กรุณากรอก “${miss[1]}”`);
    if (!/^0\d{9}$/.test(f.student_phone) || !/^0\d{9}$/.test(f.guardian_phone)) return setErr("เบอร์โทรต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0");
    setBusy(true); setErr("");
    const r = await post("/api/admission/apply", {
      level, program, zone, ...f,
      address: Object.fromEntries(["house_no", "village_no", "village", "road", "alley", "district", "amphoe", "province", "zipcode"].map((k) => [k, f[k] ?? ""])),
      father: { name: f.father_name, occupation: f.father_occ, phone: f.father_phone, status: f.father_status },
      mother: { name: f.mother_name, occupation: f.mother_occ, phone: f.mother_phone, status: f.mother_status },
      guardian: { name: f.guardian_name, occupation: f.guardian_occ, phone: f.guardian_phone, relationship: f.guardian_rel },
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onDone(f.idcard, f.birthdate, r.application_no);
  }

  const lv = LEVELS[level];
  const anyOpen = (l: Level) => (Object.keys(PROGRAMS) as Program[]).some((p) => open(l, p));
  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div><p className="text-sm font-black text-slate-700 mb-2">สมัครระดับชั้น</p>
          <Pick items={(Object.keys(LEVELS) as Level[]).map((l) => [l, `${LEVELS[l].label}${anyOpen(l) ? "" : " (ปิดรับ)"}`])} val={level} on={setLevel} /></div>
        <div><p className="text-sm font-black text-slate-700 mb-2">ประเภทห้องเรียน</p>
          <Pick items={(Object.keys(PROGRAMS) as Program[]).map((p) => [p, `${PROGRAMS[p]}${open(level, p) ? "" : " (ปิดรับ)"}`])} val={program} on={setProgram} /></div>
        <div><p className="text-sm font-black text-slate-700 mb-2">ที่อยู่ตามทะเบียนบ้านนักเรียน</p>
          <Pick items={Object.entries(ZONES)} val={zone} on={setZone} />
          <p className="text-xs text-slate-400 mt-1.5">ในเขต = ที่อยู่ตามทะเบียนบ้านอยู่ในเขตบริการของโรงเรียน · นอกเขต = อยู่นอกเขตบริการ (ระบบจะตรวจจากที่อยู่ที่กรอกด้านล่าง)</p></div>

        {rnd && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-sm font-black text-blue-800">เกณฑ์และกำหนดการ {lv.label} {PROGRAMS[program]}</p>
            <ul className="text-xs font-bold text-blue-800 space-y-0.5 list-disc pl-4">
              {rnd.min_age != null && <li>อายุตั้งแต่ {rnd.min_age} ปีบริบูรณ์ (นับถึง {thaiDate(ageRefOf(rnd))}){rnd.max_age != null && ` และไม่เกิน ${rnd.max_age} ปี`}</li>}
              {rnd.min_gpa != null && <li>เกรดเฉลี่ยสะสมไม่ต่ำกว่า {Number(rnd.min_gpa).toFixed(2)}</li>}
              {rnd.open_at && <li>รับสมัคร {thaiDT(rnd.open_at)}{rnd.close_at ? ` – ${thaiDT(rnd.close_at)}` : ""}</li>}
            </ul>
            <Schedule r={rnd} />
            {rnd.note && <p className="text-xs font-bold text-blue-900">📢 {rnd.note}</p>}
          </div>
        )}
        {!open(level, program) && <p className="text-sm font-black text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">ขณะนี้ไม่ได้เปิดรับสมัคร {lv.label} {PROGRAMS[program]}</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <h3 className="font-black text-slate-800">👤 ข้อมูลนักเรียน</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block text-sm font-bold text-slate-600 sm:col-span-3">เลขประจำตัวประชาชน<b className="text-red-500"> *</b>
            <input className={`${inp} ${bc(idS === "ok" ? "ok" : idS === "bad" ? "bad" : undefined)}`} maxLength={13} inputMode="numeric" placeholder="13 หลัก" value={f.idcard ?? ""} onChange={(e) => set("idcard", e.target.value.replace(/\D/g, ""))} />
            {idS === "short" && <Hint kind="info" t={`พิมพ์แล้ว ${f.idcard.length}/13 หลัก`} />}
            {idS === "ok" && <Hint kind="ok" t="✅ เลขบัตรประชาชนถูกต้อง" />}
            {idS === "bad" && <Hint kind="bad" t="❌ เลขบัตรประชาชนไม่ถูกต้อง (เลขหลักสุดท้ายไม่ตรง) กรุณาตรวจสอบอีกครั้ง" />}</label>

          <label className="block text-sm font-bold text-slate-600">คำนำหน้า<b className="text-red-500"> *</b>
            <select className={`${inp} ${bc(pre.error ? "bad" : pre.warn ? "warn" : undefined)}`} value={f.prefix ?? ""} onChange={(e) => set("prefix", e.target.value)}><option value="">เลือก...</option>{["เด็กชาย", "เด็กหญิง", "นาย", "นางสาว"].map((x) => <option key={x}>{x}</option>)}</select>
            {pre.error && <Hint kind="bad" t={pre.error} />}{!pre.error && pre.warn && <Hint kind="warn" t={pre.warn} />}</label>
          {T("first_name", "ชื่อ", { req: true })}{T("last_name", "นามสกุล", { req: true })}

          <label className="block text-sm font-bold text-slate-600">วันเกิด<b className="text-red-500"> *</b>
            <input className={`${inp} ${bc(ageMsg ? "bad" : ageInfo ? "ok" : undefined)}`} type="date" value={f.birthdate ?? ""} onChange={(e) => set("birthdate", e.target.value)} />
            {ageMsg && <Hint kind="bad" t={`❌ ${ageMsg}${enforce ? " — ไม่ผ่านเกณฑ์ ไม่สามารถสมัครได้" : " (เจ้าหน้าที่จะพิจารณา)"}`} />}
            {ageInfo && <Hint kind="ok" t={`✅ ${ageInfo}`} />}</label>
          <label className="block text-sm font-bold text-slate-600">เพศ<b className="text-red-500"> *</b>
            <select className={`${inp} ${bc(pre.error ? "bad" : undefined)}`} value={f.sex ?? ""} onChange={(e) => set("sex", e.target.value)}><option value="">เลือก...</option><option>ชาย</option><option>หญิง</option></select></label>
          {T("student_phone", "โทรศัพท์นักเรียน", { req: true, attrs: { maxLength: 10, inputMode: "tel", placeholder: "0xxxxxxxxx" } })}
          {T("race", "เชื้อชาติ")}{T("nationality", "สัญชาติ")}{T("religion", "ศาสนา")}
        </div>

        <h3 className="font-black text-slate-800 pt-2">📍 ที่อยู่ตามทะเบียนบ้านนักเรียน</h3>
        <p className="text-xs text-slate-400 -mt-2">พิมพ์ชื่อตำบล อำเภอ จังหวัด หรือรหัสไปรษณีย์ ช่องใดช่องหนึ่ง แล้วเลือกจากรายการ ระบบจะเติมให้ครบ</p>
        <div className="grid sm:grid-cols-4 gap-3">
          {T("house_no", "บ้านเลขที่", { req: true })}{T("village_no", "หมู่ที่ (ไม่มีใส่ -)", { req: true })}{T("village", "หมู่บ้าน (ไม่มีใส่ -)", { span: "sm:col-span-2" })}
          {T("road", "ถนน")}{T("alley", "ซอย")}
          <AddrInput label="ตำบล/แขวง" field="district" f={f} setMany={setMany} rows={rows} />
          <AddrInput label="อำเภอ/เขต" field="amphoe" f={f} setMany={setMany} rows={rows} />
          <AddrInput label="จังหวัด" field="province" f={f} setMany={setMany} rows={rows} />
          <AddrInput label="รหัสไปรษณีย์" field="zipcode" f={f} setMany={setMany} rows={rows} />
        </div>
        {addrFilled && !addrOk && <Hint kind="bad" t="❌ ไม่พบ ตำบล/อำเภอ/จังหวัด ชุดนี้ในฐานข้อมูล กรุณาเลือกจากรายการที่ระบบแนะนำ" />}
        {addrOk && zone === "in" && zoneRes === false && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-black text-red-700">⚠️ ที่อยู่นี้ไม่อยู่ในเขตบริการของโรงเรียน กรุณาสมัครแบบ “นอกเขต”</p>
            <button type="button" onClick={() => setZone("out")} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-black">เปลี่ยนเป็นสมัครแบบนอกเขต</button>
          </div>
        )}
        {addrOk && zone === "out" && zoneRes === true && (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-black text-green-700">ℹ️ ที่อยู่นี้อยู่ในเขตบริการของโรงเรียน สมัครแบบ “ในเขต” ได้</p>
            <button type="button" onClick={() => setZone("in")} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-black">เปลี่ยนเป็นสมัครแบบในเขต</button>
          </div>
        )}
        {addrOk && zone === "in" && zoneRes === true && <Hint kind="ok" t="✅ ที่อยู่อยู่ในเขตบริการของโรงเรียน" />}

        <h3 className="font-black text-slate-800 pt-2">🎓 การศึกษา</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {T("prev_school", `โรงเรียนเดิม (${lv.prev})`)}
          {T("gpa", level === "p1" ? "เกรดเฉลี่ย (ถ้ามี ใส่ 0)" : "เกรดเฉลี่ยสะสม (GPA)", {
            req: true, type: "number", attrs: { step: "0.01", min: 0, max: 4 }, st: gpaMsg ? "bad" : undefined,
            hint: gpaMsg ? <Hint kind="bad" t={`❌ ${gpaMsg}${enforce ? " — ไม่ผ่านเกณฑ์ ไม่สามารถสมัครได้" : " (เจ้าหน้าที่จะพิจารณา)"}`} /> : undefined,
          })}
          {T("disability", "ความพิการ (ไม่มีใส่ -)")}{T("congenital_disease", "โรคประจำตัว (ไม่มีใส่ -)")}{T("food_allergy", "อาหารที่แพ้ (ไม่มีใส่ -)")}
        </div>

        <h3 className="font-black text-slate-800 pt-2">👨‍👩‍👧 บิดา มารดา ผู้ปกครอง</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {ParentBlock({ role: "father", label: "บิดา" })}
          {ParentBlock({ role: "mother", label: "มารดา" })}
          {(f.father_status !== "alive" && f.mother_status !== "alive") && <p className="sm:col-span-3 text-xs font-bold text-orange-600">บิดามารดาไม่อยู่ทั้งคู่ — ต้องแนบหนังสือรับรองการเป็นผู้ปกครอง/หนังสือมอบอำนาจ ในขั้นตอนอัปโหลดเอกสาร</p>}
          <div className="sm:col-span-3 grid sm:grid-cols-3 gap-3 border border-slate-100 rounded-xl p-3">
            {T("guardian_name", "ชื่อ-สกุลผู้ปกครอง (ระบุคำนำหน้า)", { req: true, st: ge ? "bad" : f.guardian_name ? "ok" : undefined, hint: ge ? <Hint kind="bad" t={ge} /> : <Hint kind="info" t="เช่น นายสมชาย ใจดี / นางสมหญิง ใจดี / ร.ต.อ.สมศักดิ์ ใจดี" /> })}
            {T("guardian_occ", "อาชีพผู้ปกครอง")}
            {T("guardian_phone", "โทรผู้ปกครอง", { req: true, attrs: { maxLength: 10, inputMode: "tel" } })}
            {T("guardian_rel", "ความเกี่ยวข้องกับนักเรียน", { req: true })}
          </div>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-black text-red-700 mb-1">ยังส่งใบสมัครไม่ได้ เพราะ:</p>
          <ul className="list-disc pl-5 text-xs font-bold text-red-600 space-y-0.5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {err && <p className="text-sm font-black text-red-600 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">{err}</p>}
      <button onClick={submit} disabled={busy || problems.length > 0} className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base shadow-lg disabled:opacity-50">
        {busy ? "กำลังบันทึก..." : "บันทึกใบสมัครและไปอัปโหลดเอกสาร"}</button>
    </div>
  );
}

// ══════════ หน้าหลัก ══════════
export default function AdmissionPage() {
  const [tab, setTab] = useState<"apply" | "status" | "board">("apply");
  const [jump, setJump] = useState<{ idcard: string; birthdate: string; appNo: string } | null>(null);
  const tabs: [typeof tab, string][] = [["apply", "📝 สมัครเรียน"], ["status", "🔍 ตรวจสอบสถานะ"], ["board", "📊 ประกาศคะแนน"]];

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Sarabun','IBM Plex Sans Thai',sans-serif" }}>
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white px-5 py-7">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-black">ระบบรับสมัครนักเรียน โรงเรียนวัดเขียนเขต</h1>
          <p className="text-blue-100 text-sm mt-1">ระดับชั้น ป.1 · ม.1 · ม.4 — สมัครออนไลน์ อัปโหลดเอกสาร และติดตามผลได้ในที่เดียว</p>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2.5 rounded-xl text-sm font-black ${tab === k ? "bg-white text-slate-800 shadow border border-slate-200" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
        {tab === "apply" && (jump
          ? <Status init={jump} banner={`บันทึกใบสมัครแล้ว เลขที่ ${jump.appNo} — ขั้นตอนต่อไป: อัปโหลดเอกสารด้านล่างให้ครบ (ถ้ายังไม่ครบ กลับมาอัปโหลดต่อได้ที่แท็บ “ตรวจสอบสถานะ” ด้วยเลขบัตรประชาชนและวันเกิด)`} />
          : <Apply onDone={(idcard, birthdate, appNo) => setJump({ idcard, birthdate, appNo })} />)}
        {tab === "status" && <Status />}
        {tab === "board" && <Board />}
      </div>
    </div>
  );
}
