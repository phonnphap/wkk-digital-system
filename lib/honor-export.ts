import * as XLSX from 'xlsx';
import type { AwardWithRecipients } from '@/types/honor';
import {
  CATEGORY_LABELS,
  AWARD_LEVEL_LABELS,
  AWARD_TYPE_LABELS,
  RECIPIENT_ROLE_LABELS,
} from '@/types/honor';

/**
 * ส่งออกรายการรางวัลที่กรองไว้เป็นไฟล์ Excel (.xlsx)
 * 1 แถว = 1 รางวัล 1 ผู้รับ (แถวเดียวกันจะซ้ำกันถ้ารางวัลนั้นมีผู้รับหลายคน — สะดวกสำหรับกรอง/pivot ใน Excel ต่อ)
 */
export function exportAwardsToXlsx(awards: AwardWithRecipients[], filename = 'honor-portfolio.xlsx') {
  const rows: Record<string, string | number>[] = [];

  for (const award of awards) {
    const recipients = award.recipients.length > 0 ? award.recipients : [{ recipient_name: '-' }];

    for (const r of recipients) {
      rows.push({
        'รหัสรางวัล': award.id,
        'กลุ่มเป้าหมาย': CATEGORY_LABELS[award.category] ?? award.category,
        'ชื่อรางวัล': award.title,
        'ชื่อผู้รับรางวัล': r.recipient_name,
        'รหัสนักเรียน': r.student_id ?? '',
        'ระดับชั้น': r.grade_level ?? '',
        'ห้องเรียน': r.classroom ?? '',
        'กลุ่มสาระ/ฝ่ายงาน': r.department ?? '',
        'บทบาท': r.role ? RECIPIENT_ROLE_LABELS[r.role] : '',
        'วันที่ได้รับรางวัล': award.date_received,
        'ปีการศึกษา': award.academic_year,
        'หน่วยงานที่จัด': award.organizer ?? '',
        'ระดับรางวัล': AWARD_LEVEL_LABELS[award.award_level] ?? award.award_level,
        'ประเภทรางวัล': AWARD_TYPE_LABELS[award.award_type] ?? award.award_type,
        'มาตรฐาน/ตัวชี้วัด (KPI/SAR)': award.kpi_standard ?? '',
        'แท็ก': (award.tags ?? []).join(', '),
        'ลิงก์ข่าวประชาสัมพันธ์': award.pr_link ?? '',
        'ไฟล์เกียรติบัตร': award.certificate_file ?? '',
        'ภาพปก': award.image_cover ?? '',
      });
    }
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // ปรับความกว้างคอลัมน์อัตโนมัติแบบหยาบ ๆ ให้อ่านง่ายขึ้น
  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.min(Math.max(key.length, 12), 40),
  }));
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'รายงานเกียรติยศ');

  XLSX.writeFile(workbook, filename);
}
