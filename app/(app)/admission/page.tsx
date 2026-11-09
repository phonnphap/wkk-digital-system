"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LEVELS, PROGRAMS, ZONES, STATUS, RESULT, docsFor,
  type Level, type Program, type Zone,
} from "@/lib/admission-config";

const sb = createClient();
const inp = "w-full mt-1 bg-white border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:border-blue-500 focus:outline-none";
const post = (url: string, body: any) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

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

// ══════════ อัปโหลดเอกสาร ══════════
function DocUploader({ app, docs, onDone }: { app: any; docs: any[]; onDone: () => void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const map = Object.fromEntries(docs.map((d) => [d.doc_type, d]));
  const locked = ["approved", "rejected"].includes(app.status);

  async function up(key: string, f?: File) {
    if (!f) return;
    setBusy(key); setErr("");
    try {
      const s = await shrink(f);
      if (s.size > 4 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 4MB");
      const fd = new FormData();
      fd.append("file", s); fd.append("applicationId", app.id); fd.append("token", app.edit_token); fd.append("docType", key);
      const r = await (await fetch("/api/admission/upload", { method: "POST", body: fd })).json();
      if (!r.ok) throw new Error(r.error);
      onDone();
    } catch (e: any) { setErr(`${e.message}`); }
    setBusy("");
  }

  return (
    <div className="space-y-2">
      {err && <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
      {docsFor(app.level, app.zone).map((d) => {
        const x = map[d.key];
        return (
          <div key={d.key} className={`rounded-xl border-2 p-3 ${x?.status === "bad" ? "border-orange-300 bg-orange-50" : x?.status === "ok" ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-bold text-slate-700">{d.label}{d.required && <b className="text-red-500"> *</b>}</div>
              <div className="flex items-center gap-2">
                {x && <span className="text-xs font-black text-slate-500">{x.status === "ok" ? "✅ ผ่าน" : x.status === "bad" ? "⚠️ ต้องแก้ไข" : "⏳ รอตรวจ"}</span>}
                {!locked && (
                  <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-blue-50 border-2 border-blue-200 text-blue-700 text-xs font-black hover:bg-blue-100">
                    {busy === d.key ? "กำลังอัปโหลด..." : x ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={!!busy}
                      onChange={(e) => { up(d.key, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            </div>
            {x?.status === "bad" && x.note && <p className="text-xs font-bold text-orange-700 mt-1.5">สิ่งที่ต้องแก้ไข: {x.note}</p>}
          </div>
        );
      })}
      <p className="text-xs text-slate-400">รองรับ PDF, JPG, PNG · ไฟล์ละไม่เกิน 4MB (รูปถ่ายจากมือถือระบบย่อให้อัตโนมัติ)</p>
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
  const missing = a ? docsFor(a.level, a.zone).filter((x) => x.required && !d.docs.some((y: any) => y.doc_type === x.key)) : [];

  return (
    <div className="space-y-4">
      {banner && <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-4 text-green-800 font-bold text-sm">{banner}</div>}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 grid sm:grid-cols-3 gap-3 items-end">
        <label className="text-sm font-bold text-slate-600">เลขประจำตัวประชาชน
          <input className={inp} maxLength={13} inputMode="numeric" value={idcard} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="text-sm font-bold text-slate-600">วันเกิดนักเรียน
          <input className={inp} type="date" value={bd} onChange={(e) => setBd(e.target.value)} /></label>
        <button onClick={go} disabled={busy} className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
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

// ══════════ ประกาศคะแนนสอบ (รายการ) ══════════
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
      {!d ? <p className="text-slate-400 text-sm">กำลังโหลด...</p>
        : !d.published ? <p className="text-center py-10 text-slate-400 bg-white border border-slate-200 rounded-2xl">ยังไม่ประกาศคะแนน {LEVELS[level].label}</p>
        : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-slate-600"><th className="px-4 py-3 text-left">เลขที่นั่งสอบ</th><th className="px-3 py-3 text-left">ห้อง</th><th className="px-3 py-3 text-left">เขต</th><th className="px-3 py-3 text-right">คะแนน</th>{d.resultsPublished && <><th className="px-3 py-3 text-right">อันดับ</th><th className="px-3 py-3 text-left">ผล</th></>}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.rows.map((r: any) => (
                  <tr key={r.exam_no} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-black text-slate-800">{r.exam_no}</td>
                    <td className="px-3 py-2.5">{PROGRAMS[r.program as Program]}</td>
                    <td className="px-3 py-2.5">{ZONES[r.zone as Zone]}</td>
                    <td className="px-3 py-2.5 text-right font-black">{r.exam_total}</td>
                    {d.resultsPublished && <><td className="px-3 py-2.5 text-right">{r.exam_rank}</td><td className="px-3 py-2.5">{r.result && <Badge cfg={RESULT[r.result]} />}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ══════════ ฟอร์มสมัคร ══════════
function Apply({ onDone }: { onDone: (idcard: string, birthdate: string, appNo: string) => void }) {
  const [rounds, setRounds] = useState<any[]>([]);
  const [level, setLevel] = useState<Level>("m1");
  const [program, setProgram] = useState<Program>("regular");
  const [zone, setZone] = useState<Zone>("in");
  const [f, setF] = useState<Record<string, string>>({ race: "ไทย", nationality: "ไทย", religion: "พุทธ" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    sb.from("admission_rounds").select("*").then(({ data }) => setRounds(data ?? []));
  }, []);
  const roundOf = (l: Level) => rounds.filter((r) => r.level === l).sort((a, b) => b.academic_year - a.academic_year)[0];
  const open = (l: Level) => {
    const r = roundOf(l); const n = Date.now();
    return !!r?.is_open && (!r.open_at || n >= +new Date(r.open_at)) && (!r.close_at || n <= +new Date(r.close_at));
  };

  const T = (k: string, label: string, o: { req?: boolean; type?: string; span?: string; attrs?: any } = {}) => (
    <label className={`block text-sm font-bold text-slate-600 ${o.span ?? ""}`}>{label}{o.req && <b className="text-red-500"> *</b>}
      <input className={inp} type={o.type ?? "text"} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} {...o.attrs} /></label>
  );
  const Pick = ({ items, val, on, dis }: { items: [string, string][]; val: string; on: (v: any) => void; dis?: (v: string) => boolean }) => (
    <div className="flex gap-2 flex-wrap">
      {items.map(([k, l]) => (
        <button key={k} type="button" disabled={dis?.(k)} onClick={() => on(k)}
          className={`px-4 py-2.5 rounded-xl border-2 text-sm font-black disabled:opacity-40 ${val === k ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>{l}</button>
      ))}
    </div>
  );

  const required: [string, string][] = [["idcard", "เลขประจำตัวประชาชน"], ["prefix", "คำนำหน้า"], ["first_name", "ชื่อ"], ["last_name", "นามสกุล"],
    ["birthdate", "วันเกิด"], ["sex", "เพศ"], ["student_phone", "เบอร์โทรนักเรียน"], ["gpa", "เกรดเฉลี่ย"], ["house_no", "บ้านเลขที่"],
    ["district", "ตำบล"], ["amphoe", "อำเภอ"], ["province", "จังหวัด"], ["zipcode", "รหัสไปรษณีย์"],
    ["guardian_name", "ชื่อผู้ปกครอง"], ["guardian_phone", "เบอร์ผู้ปกครอง"], ["guardian_rel", "ความเกี่ยวข้อง"]];

  async function submit() {
    const miss = required.find(([k]) => !f[k]?.trim());
    if (miss) return setErr(`กรุณากรอก “${miss[1]}”`);
    if (!/^\d{13}$/.test(f.idcard)) return setErr("เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก");
    if (!/^0\d{9}$/.test(f.student_phone) || !/^0\d{9}$/.test(f.guardian_phone)) return setErr("เบอร์โทรต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0");
    setBusy(true); setErr("");
    const r = await post("/api/admission/apply", {
      level, program, zone, ...f,
      address: Object.fromEntries(["house_no", "village_no", "village", "road", "alley", "district", "amphoe", "province", "zipcode"].map((k) => [k, f[k] ?? ""])),
      father: { name: f.father_name, occupation: f.father_occ, phone: f.father_phone },
      mother: { name: f.mother_name, occupation: f.mother_occ, phone: f.mother_phone },
      guardian: { name: f.guardian_name, occupation: f.guardian_occ, phone: f.guardian_phone, relationship: f.guardian_rel },
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onDone(f.idcard, f.birthdate, r.application_no);
  }

  const lv = LEVELS[level];
  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div><p className="text-sm font-black text-slate-700 mb-2">สมัครระดับชั้น</p>
          <Pick items={(Object.keys(LEVELS) as Level[]).map((l) => [l, `${LEVELS[l].label}${open(l) ? "" : " (ปิดรับ)"}`])} val={level} on={setLevel} /></div>
        <div><p className="text-sm font-black text-slate-700 mb-2">ประเภทห้องเรียน</p>
          <Pick items={Object.entries(PROGRAMS)} val={program} on={setProgram} /></div>
        <div><p className="text-sm font-black text-slate-700 mb-2">ที่อยู่ตามทะเบียนบ้าน</p>
          <Pick items={Object.entries(ZONES)} val={zone} on={setZone} />
          <p className="text-xs text-slate-400 mt-1.5">ในเขต = ทะเบียนบ้านอยู่ในเขตบริการของโรงเรียน · นอกเขต = ทะเบียนบ้านอยู่นอกเขตบริการ</p></div>
        {roundOf(level)?.note && <p className="text-sm bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-blue-800 font-bold">📢 {roundOf(level).note}</p>}
        {!open(level) && <p className="text-sm font-black text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">ขณะนี้ไม่ได้เปิดรับสมัคร {lv.label}</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <h3 className="font-black text-slate-800">👤 ข้อมูลนักเรียน</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {T("idcard", "เลขประจำตัวประชาชน", { req: true, span: "sm:col-span-3", attrs: { maxLength: 13, inputMode: "numeric", placeholder: "13 หลัก" } })}
          <label className="block text-sm font-bold text-slate-600">คำนำหน้า<b className="text-red-500"> *</b>
            <select className={inp} value={f.prefix ?? ""} onChange={(e) => set("prefix", e.target.value)}><option value="">เลือก...</option>{["เด็กชาย", "เด็กหญิง", "นาย", "นางสาว"].map((x) => <option key={x}>{x}</option>)}</select></label>
          {T("first_name", "ชื่อ", { req: true })}{T("last_name", "นามสกุล", { req: true })}
          {T("birthdate", "วันเกิด", { req: true, type: "date" })}
          <label className="block text-sm font-bold text-slate-600">เพศ<b className="text-red-500"> *</b>
            <select className={inp} value={f.sex ?? ""} onChange={(e) => set("sex", e.target.value)}><option value="">เลือก...</option><option>ชาย</option><option>หญิง</option></select></label>
          {T("student_phone", "โทรศัพท์นักเรียน", { req: true, attrs: { maxLength: 10, inputMode: "tel", placeholder: "0xxxxxxxxx" } })}
          {T("race", "เชื้อชาติ")}{T("nationality", "สัญชาติ")}{T("religion", "ศาสนา")}
        </div>

        <h3 className="font-black text-slate-800 pt-2">📍 ที่อยู่ปัจจุบัน</h3>
        <div className="grid sm:grid-cols-4 gap-3">
          {T("house_no", "บ้านเลขที่", { req: true })}{T("village_no", "หมู่ที่ (ไม่มีใส่ -)")}{T("village", "หมู่บ้าน (ไม่มีใส่ -)", { span: "sm:col-span-2" })}
          {T("road", "ถนน")}{T("alley", "ซอย")}{T("district", "ตำบล/แขวง", { req: true })}{T("amphoe", "อำเภอ/เขต", { req: true })}
          {T("province", "จังหวัด", { req: true })}{T("zipcode", "รหัสไปรษณีย์", { req: true, attrs: { maxLength: 5, inputMode: "numeric" } })}
        </div>

        <h3 className="font-black text-slate-800 pt-2">🎓 การศึกษา</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {T("prev_school", `โรงเรียนเดิม (${lv.prev})`)}
          {T("gpa", level === "p1" ? "เกรดเฉลี่ย (ถ้ามี ใส่ 0)" : "เกรดเฉลี่ยสะสม (GPA)", { req: true, type: "number", attrs: { step: "0.01", min: 0, max: 4 } })}
          {T("disability", "ความพิการ (ไม่มีใส่ -)")}{T("congenital_disease", "โรคประจำตัว (ไม่มีใส่ -)")}{T("food_allergy", "อาหารที่แพ้ (ไม่มีใส่ -)")}
        </div>

        <h3 className="font-black text-slate-800 pt-2">👨‍👩‍👧 ผู้ปกครอง</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {T("father_name", "ชื่อ-สกุลบิดา (ระบุคำนำหน้า)")}{T("father_occ", "อาชีพบิดา")}{T("father_phone", "โทรบิดา", { attrs: { maxLength: 10, inputMode: "tel" } })}
          {T("mother_name", "ชื่อ-สกุลมารดา (ระบุคำนำหน้า)")}{T("mother_occ", "อาชีพมารดา")}{T("mother_phone", "โทรมารดา", { attrs: { maxLength: 10, inputMode: "tel" } })}
          {T("guardian_name", "ชื่อ-สกุลผู้ปกครอง", { req: true })}{T("guardian_occ", "อาชีพผู้ปกครอง")}{T("guardian_phone", "โทรผู้ปกครอง", { req: true, attrs: { maxLength: 10, inputMode: "tel" } })}
          {T("guardian_rel", "ความเกี่ยวข้องกับนักเรียน", { req: true })}
        </div>
      </div>

      {err && <p className="text-sm font-black text-red-600 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">{err}</p>}
      <button onClick={submit} disabled={busy || !open(level)} className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base shadow-lg disabled:opacity-50">
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