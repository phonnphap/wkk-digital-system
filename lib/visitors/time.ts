// ประเทศไทย UTC+7 ไม่มี DST จึงใช้ offset ตายตัวได้
export const TZ = "Asia/Bangkok";

/** YYYY-MM-DD ตามเวลาไทย */
export function bkkDate(d: Date | string = new Date()) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00+07:00`);
  return { from: start.toISOString(), to: new Date(start.getTime() + 86400000).toISOString() };
}

/** ym = "YYYY-MM" */
export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return {
    from: new Date(`${ym}-01T00:00:00+07:00`).toISOString(),
    to: new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00+07:00`).toISOString(),
  };
}

export function cutoff1700(date = bkkDate()) {
  return new Date(`${date}T17:00:00+07:00`);
}