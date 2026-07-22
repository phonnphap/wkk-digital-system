export function sanitizeSegment(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * ชื่อไฟล์หลักฐาน = วันที่เริ่มอบรม (dd-mm-yyyy พ.ศ.)
 * ถ้ามีไฟล์วันเดียวกันในรายการนี้อยู่แล้ว (existingCount > 0) ต่อท้ายด้วย " (n)"
 */
export function buildTrainingFileName(startDate: string, originalName: string, existingCount: number) {
  const d = new Date(startDate);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyyBE = d.getFullYear() + 543;
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
  const base = `${dd}-${mm}-${yyyyBE}`;
  return existingCount === 0 ? `${base}${ext}` : `${base} (${existingCount})${ext}`;
}