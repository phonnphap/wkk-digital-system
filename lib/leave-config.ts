// ─────────────────────────────────────────────────────────────────────────────
// lib/leave-config.ts
// วางไฟล์นี้ที่ src/lib/leave-config.ts
// ─────────────────────────────────────────────────────────────────────────────

// ── SQL to run once in Supabase SQL Editor ────────────────────────────────────
export const SETUP_SQL = `
DO $$ BEGIN
  CREATE TYPE leave_type AS ENUM (
    'sick', 'personal', 'maternity', 'ordination', 'official', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM (
    'pending', 'approved', 'rejected', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

// ── TypeScript types ──────────────────────────────────────────────────────────
export type LeaveType =
  | 'sick'
  | 'personal'
  | 'maternity'
  | 'ordination'
  | 'official'
  | 'other';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApproverStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  document_url?: string | null;
  status: LeaveStatus;
  created_at: string;
  approver_1_id?: string | null;
  approver_2_id?: string | null;
  approver_3_id?: string | null;
  approver_1_status?: string | null;
  approver_2_status?: string | null;
  approver_3_status?: string | null;
  user?: any;
  missed_periods?: string | null;
  substitute_id?: string | null;
  duty_officer_id?: string | null;
}

// ── Leave type config ─────────────────────────────────────────────────────────
export const LEAVE_TYPE_CONFIG: Record<LeaveType, {
  label: string;
  icon: string;
  quota: number | null;
}> = {
  sick:       { label: 'ลาป่วย',                             icon: '🤒', quota: 120   },
  personal:   { label: 'ลากิจส่วนตัว',                       icon: '📋', quota: 45   },
  maternity:  { label: 'ลาคลอดบุตร / ช่วยเหลือภริยาคลอด',   icon: '👶', quota: 90   },
  ordination: { label: 'ลาอุปสมบท / ประกอบพิธีฮัจย์',         icon: '🙏', quota: 120  },
  official:   { label: 'ไปราชการ',                            icon: '🏛️', quota: null },
  other:      { label: 'ลาประเภทอื่นๆ',                       icon: '📌', quota: null },
};

// ── Leave status config ───────────────────────────────────────────────────────
export const LEAVE_STATUS_CONFIG: Record<LeaveStatus, {
  label: string;
  icon: string;
}> = {
  pending:   { label: 'รอพิจารณา',  icon: '⏳' },
  approved:  { label: 'อนุมัติแล้ว', icon: '✅' },
  rejected:  { label: 'ไม่อนุมัติ',  icon: '❌' },
  cancelled: { label: 'ยกเลิก',      icon: '🚫' },
};

// ── Fiscal year helpers (Thai: Oct 1 – Sep 30) ───────────────────────────────
export function getCurrentFiscalYear(): number {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

export function isInFiscalYear(dateStr: string, fiscalYear: number): boolean {
  const d = new Date(dateStr);
  return (
    d >= new Date(`${fiscalYear - 1}-10-01`) &&
    d <= new Date(`${fiscalYear}-09-30`)
  );
}