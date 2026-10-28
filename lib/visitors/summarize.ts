import { bkkDate } from "./time";

export type Row = {
  id: string;
  full_name: string;
  car_plate?: string | null;
  target_label?: string | null;
  source?: string | null;
  status?: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  auto_checked_out?: boolean | null;
  acknowledged_at?: string | null;
};

export function summarize(rows: Row[]) {
  const byTarget: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const bySource = { id: 0, face: 0, qr: 0 };
  let stayTotal = 0, stayN = 0, auto = 0, acked = 0;

  for (const r of rows) {
    const t = r.target_label || "ไม่ระบุ";
    byTarget[t] = (byTarget[t] ?? 0) + 1;

    if (r.source === "guard_id") bySource.id++;
    else if (r.source === "guard_face") bySource.face++;
    else bySource.qr++;

    if (r.check_in_at) {
      const d = bkkDate(r.check_in_at);
      byDay[d] = (byDay[d] ?? 0) + 1;
    }
    if (r.auto_checked_out) auto++;
    else if (r.check_in_at && r.check_out_at) {
      // ไม่นับเคสเช็คเอาท์อัตโนมัติ เพราะเวลาออกไม่ใช่เวลาจริง
      stayTotal += (+new Date(r.check_out_at) - +new Date(r.check_in_at)) / 60000;
      stayN++;
    }
    if (r.acknowledged_at) acked++;
  }

  return {
    total: rows.length,
    targets: Object.entries(byTarget).sort((a, b) => b[1] - a[1]),
    days: Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])),
    bySource,
    avgStayMin: stayN ? Math.round(stayTotal / stayN) : null,
    auto,
    acked,
  };
}

export type Summary = ReturnType<typeof summarize>;