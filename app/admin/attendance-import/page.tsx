"use client";

// ══════════════════════════════════════════════════════════
// หน้านำเข้าข้อมูลลงเวลาครูรายวัน — สำหรับแอดมิน
// วางข้อมูลที่ copy จาก Excel/เครื่องสแกน หรืออัปโหลดไฟล์ .csv/.xlsx
// พรีวิวตรวจสอบก่อน แล้วกดนำเข้า → เขียนลง Supabase โดยตรง (ไม่ต้องใช้ SQL Editor)
//
// วิธีติดตั้ง:
//   1) npm install xlsx
//   2) วางไฟล์นี้ไว้ที่ เช่น app/admin/attendance-import/page.tsx
//   3) ปรับ path "@/lib/supabase/client" ให้ตรงกับโปรเจกต์ของคุณ
// ══════════════════════════════════════════════════════════

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  Upload, ClipboardPaste, CheckCircle2, XCircle, AlertTriangle,
  Loader2, CalendarDays, UploadCloud,
} from "lucide-react";

type ParsedRow = {
  rowNum: number;
  rawId: string;
  userId: string | null;   // uuid หลัง clean แล้ว (null = หาไม่เจอ/รูปแบบผิด)
  name: string;
  workDate: string | null; // YYYY-MM-DD
  checkIn: string | null;  // HH:MM:SS
  checkOut: string | null;
  note: string | null;
};

type ImportResult = {
  totalRows: number;
  imported: number;
  notFoundInUsers: { name: string; userId: string }[];
  invalidRows: { rowNum: number; name: string; reason: string }[];
};

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

// พยายามหา uuid ในข้อความ ตัดขยะที่เครื่องสแกนแปะไว้ (เช่น "Not Found" ปนหน้า uuid)
function cleanId(raw: string): string | null {
  const m = raw.match(UUID_RE);
  return m ? m[0] : null;
}

// รองรับทั้ง d/m/y พ.ศ. (เช่น 5/6/2569) และ d/m/y ค.ศ. — เดาจากค่าปี
function thaiOrIsoDateToIso(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // รูปแบบ YYYY-MM-DD อยู่แล้ว
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parts = s.split(/[\/\-.]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  let [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (!d || !m || !y) return null;
  if (y > 2400) y -= 543; // ปี พ.ศ. -> ค.ศ.
  if (y < 100) y += 2000; // เผื่อปีย่อ เช่น 26 -> 2026 (ไม่ควรเกิดกับไฟล์จริง แต่กันไว้)
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function cleanTime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00`;
}

// หาตำแหน่งคอลัมน์จาก header แถวแรก รองรับทั้งไทย/อังกฤษ ถ้าไม่เจอ header ใช้ตำแหน่งมาตรฐาน
function detectColumns(headerCells: string[]) {
  const norm = headerCells.map((h) => h.trim().toLowerCase());
  const find = (candidates: string[]) => {
    for (const c of candidates) {
      const idx = norm.findIndex((h) => h === c.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };
  return {
    id: find(["id", "รหัส", "uuid"]),
    name: find(["ชื่อ-นามสกุล", "ชื่อ", "name"]),
    date: find(["วันที่", "date", "work_date"]),
    checkIn: find(["เข้า", "check_in", "เวลาเข้า"]),
    checkOut: find(["ออก", "check_out", "เวลาออก"]),
    note: find(["หมายเหตุ", "note"]),
  };
}

// แถวแรกดูเหมือน header หรือไม่ (เซลล์แรกไม่ใช่ uuid)
function looksLikeHeader(firstRowFirstCell: string) {
  return !UUID_RE.test(firstRowFirstCell);
}

function parseGrid(grid: string[][]): ParsedRow[] {
  if (grid.length === 0) return [];

  let dataStart = 0;
  let cols = { id: 0, name: 1, date: 2, checkIn: 3, checkOut: 4, note: 5 };

  if (looksLikeHeader(grid[0][0] ?? "")) {
    const detected = detectColumns(grid[0]);
    if (detected.id !== -1) cols = { ...cols, ...Object.fromEntries(Object.entries(detected).filter(([, v]) => v !== -1)) } as typeof cols;
    dataStart = 1;
  }

  const rows: ParsedRow[] = [];
  for (let i = dataStart; i < grid.length; i++) {
    const r = grid[i];
    const rawId = (r[cols.id] ?? "").toString().trim();
    if (!rawId && r.every((c) => !c || !c.toString().trim())) continue; // แถวว่างล้วน ข้าม

    rows.push({
      rowNum: i + 1,
      rawId,
      userId: cleanId(rawId),
      name: (r[cols.name] ?? "").toString().trim(),
      workDate: thaiOrIsoDateToIso((r[cols.date] ?? "").toString()),
      checkIn: cleanTime((r[cols.checkIn] ?? "").toString()),
      checkOut: cleanTime((r[cols.checkOut] ?? "").toString()),
      note: (r[cols.note] ?? "").toString().trim() || null,
    });
  }
  return rows;
}

function parsePastedText(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t"));
}

async function parseFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  return grid.map((r) => r.map((c) => (c ?? "").toString()));
}

export default function AttendanceImportPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [deviceCode, setDeviceCode] = useState("IMPORT");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => r.userId && r.workDate);
    const invalid = rows.filter((r) => !r.userId || !r.workDate);
    return { total: rows.length, valid: valid.length, invalid: invalid.length };
  }, [rows]);

  function handleParseText() {
    setParseError(null);
    setResult(null);
    try {
      const grid = parsePastedText(rawText);
      const parsed = parseGrid(grid);
      if (parsed.length === 0) setParseError("ไม่พบข้อมูล ตรวจสอบว่าวางข้อมูลถูกต้อง (ต้องคั่นด้วย Tab เหมือน copy จาก Excel)");
      setRows(parsed);
    } catch (e: any) {
      setParseError("แปลงข้อมูลไม่สำเร็จ: " + e.message);
    }
  }

  async function handleFileUpload(file: File) {
    setParseError(null);
    setResult(null);
    try {
      const grid = await parseFile(file);
      const parsed = parseGrid(grid);
      if (parsed.length === 0) setParseError("ไม่พบข้อมูลในไฟล์นี้");
      setRows(parsed);
      setRawText(""); // ล้างช่องวาง เพราะใช้ไฟล์แทน
    } catch (e: any) {
      setParseError("อ่านไฟล์ไม่สำเร็จ: " + e.message);
    }
  }

  async function handleImport() {
    const validRows = rows.filter((r) => r.userId && r.workDate);
    if (validRows.length === 0) return;

    setImporting(true);
    setResult(null);

    // 1) ตรวจสอบว่า uuid มีอยู่จริงใน users ก่อน กันข้อมูลเพี้ยนหลุดเข้าไป
    const uniqueIds = Array.from(new Set(validRows.map((r) => r.userId as string)));
    const { data: existingUsers, error: userErr } = await supabase
      .from("users")
      .select("id")
      .in("id", uniqueIds);

    if (userErr) {
      setParseError("ตรวจสอบรายชื่อครูไม่สำเร็จ: " + userErr.message);
      setImporting(false);
      return;
    }

    const existingIdSet = new Set((existingUsers ?? []).map((u: any) => u.id));
    const toImport = validRows.filter((r) => existingIdSet.has(r.userId as string));
    const notFoundInUsers = validRows
      .filter((r) => !existingIdSet.has(r.userId as string))
      .map((r) => ({ name: r.name, userId: r.userId as string }));

    // 2) upsert เข้า teacher_attendance_records
    const payload = toImport.map((r) => ({
      user_id: r.userId,
      work_date: r.workDate,
      check_in_time: r.checkIn,
      check_out_time: r.checkOut,
      device_code: deviceCode || "IMPORT",
      note: r.note,
    }));

    let imported = 0;
    if (payload.length > 0) {
      const { error: upsertErr, count } = await supabase
        .from("teacher_attendance_records")
        .upsert(payload, { onConflict: "user_id,work_date", count: "exact" });

      if (upsertErr) {
        setParseError("นำเข้าข้อมูลไม่สำเร็จ: " + upsertErr.message);
        setImporting(false);
        return;
      }
      imported = count ?? payload.length;
    }

    const invalidRows = rows
      .filter((r) => !r.userId || !r.workDate)
      .map((r) => ({
        rowNum: r.rowNum,
        name: r.name || "(ไม่มีชื่อ)",
        reason: !r.userId ? "หา uuid ไม่เจอในแถวนี้" : "วันที่ไม่ถูกต้อง/ว่างเปล่า",
      }));

    setResult({ totalRows: rows.length, imported, notFoundInUsers, invalidRows });
    setImporting(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      <main className="w-full p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <button onClick={()=>router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>
          <span className="text-slate-300">/</span>
          <span className="text-sm text-slate-800 font-extrabold">นำเข้าข้อมูลลงเวลาครูรายวัน</span>
        </div>

        <div>
          <h1 className="text-xl font-black text-slate-900">นำเข้าข้อมูลลงเวลาครูรายวัน</h1>
          <p className="text-sm text-slate-400 mt-1">วางข้อมูลที่ copy จาก Excel หรืออัปโหลดไฟล์ .csv / .xlsx</p>
        </div>

        {/* วิธีนำเข้า */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <ClipboardPaste className="w-4 h-4" /> วางข้อมูล (Ctrl+V จาก Excel)
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"id\tชื่อ-นามสกุล\tวันที่\tเข้า\tออก\tหมายเหตุ\n1bff7756-...\tนายธนณัฐ...\t5/6/2569\t7:52\t16:20\t"}
            rows={8}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={handleParseText}
              disabled={!rawText.trim()}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ตรวจสอบข้อมูล
            </button>

            <span className="text-slate-300 text-sm">หรือ</span>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50"
            >
              <Upload className="w-4 h-4" /> อัปโหลดไฟล์ .csv / .xlsx
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-400">รหัสแหล่งข้อมูล (device_code):</span>
            <input
              value={deviceCode}
              onChange={(e) => setDeviceCode(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 w-40"
            />
          </div>

          {parseError && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700 font-bold">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {parseError}
            </div>
          )}
        </div>

        {/* พรีวิว */}
        {rows.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <CalendarDays className="w-4 h-4" /> พรีวิวข้อมูล ({stats.total} แถว)
              </h3>
              <div className="flex gap-2 text-xs font-bold">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600">พร้อมนำเข้า {stats.valid}</span>
                {stats.invalid > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600">มีปัญหา {stats.invalid}</span>
                )}
              </div>
            </div>

            <div className="overflow-auto max-h-96 rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-3 py-2 font-bold text-slate-500">ชื่อ</th>
                    <th className="text-left px-3 py-2 font-bold text-slate-500">วันที่</th>
                    <th className="text-center px-3 py-2 font-bold text-slate-500">เข้า</th>
                    <th className="text-center px-3 py-2 font-bold text-slate-500">ออก</th>
                    <th className="text-left px-3 py-2 font-bold text-slate-500">หมายเหตุ</th>
                    <th className="text-center px-3 py-2 font-bold text-slate-500">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r) => {
                    const ok = r.userId && r.workDate;
                    return (
                      <tr key={r.rowNum} className={!ok ? "bg-rose-50/50" : ""}>
                        <td className="px-3 py-1.5 font-bold text-slate-700">{r.name || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.workDate ?? "❌ ไม่ถูกต้อง"}</td>
                        <td className="px-3 py-1.5 text-center text-slate-500">{r.checkIn ?? "-"}</td>
                        <td className="px-3 py-1.5 text-center text-slate-500">{r.checkOut ?? "-"}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.note ?? "-"}</td>
                        <td className="px-3 py-1.5 text-center">
                          {ok ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />
                          ) : (
                            <span title={!r.userId ? "หา uuid ไม่เจอ" : "วันที่ไม่ถูกต้อง"}>
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 inline" />
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleImport}
              disabled={importing || stats.valid === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {importing ? "กำลังนำเข้า..." : `นำเข้า ${stats.valid} แถวเข้า Supabase`}
            </button>
          </div>
        )}

        {/* ผลลัพธ์ */}
        {result && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> นำเข้าสำเร็จ
            </h3>
            <p className="text-sm text-slate-600">
              นำเข้าแล้ว <span className="font-black text-emerald-600">{result.imported}</span> / {result.totalRows} แถว
            </p>

            {result.notFoundInUsers.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                <p className="font-bold text-amber-700 mb-1">⚠ ไม่พบในระบบ users ({result.notFoundInUsers.length} คน) — uuid อาจผิดหรือยังไม่มีในระบบ:</p>
                <ul className="text-amber-700 text-xs space-y-0.5">
                  {result.notFoundInUsers.map((u, i) => (
                    <li key={i}>• {u.name} ({u.userId})</li>
                  ))}
                </ul>
              </div>
            )}

            {result.invalidRows.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm">
                <p className="font-bold text-rose-700 mb-1">✗ ข้อมูลไม่ครบ ข้ามไป ({result.invalidRows.length} แถว):</p>
                <ul className="text-rose-700 text-xs space-y-0.5">
                  {result.invalidRows.map((r, i) => (
                    <li key={i}>• แถว {r.rowNum} — {r.name}: {r.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}