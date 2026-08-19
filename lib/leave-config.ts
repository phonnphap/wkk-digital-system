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
    'draft','pending', 'approved', 'rejected', 'cancelled'
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

export type LeaveStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';
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
  other_leave_name?: string | null;
  half_day?: string | null;
  created_at: string;
  updated_at?: string;
  approver_1_id?: string | null;
  approver_2_id?: string | null;
  approver_3_id?: string | null;
  approver_1_status?: string | null;
  approver_2_status?: string | null;
  approver_3_status?: string | null;
  missed_periods?: string | null;
  substitute_id?: string | null;
  duty_officer_id?: string | null;
  signature_url?: string | null;
  contact_info?: string | null;
  user?: {
    title?: string;
    first_name: string;
    last_name: string;
    full_name?: string;
    position?: string;
    email?: string;
    grade_level?: string;
    phone?: string;
    signature_url?: string;
  };
}

// ── Leave type config ─────────────────────────────────────────────────────────
export const LEAVE_TYPE_CONFIG: Record<LeaveType, {
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  quota: number | null;
}> = {
  sick:       { label: 'ลาป่วย',                             icon: '🤒', color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200",quota: 120   },
  personal:   { label: 'ลากิจส่วนตัว',                       icon: '📋', color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", quota: 45   },
  maternity:  { label: 'ลาคลอดบุตร/ ช่วยเหลือภริยาคลอด',   icon: '👶', color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", quota: 90   },
  ordination: { label: 'ลาอุปสมบท/ ประกอบพิธีฮัจย์',         icon: '🙏', color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200", quota: 120  },
  official:   { label: 'ไปราชการ',                            icon: '🏛️', color: "text-green-600", bg: "bg-green-50", border: "border-green-200", quota: null },
  other:      { label: 'ลากิจฉุกเฉิน',                       icon: '📌', color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200", quota: null },
};

// ── Leave status config ───────────────────────────────────────────────────────
export const LEAVE_STATUS_CONFIG: Record<LeaveStatus, {
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
}> = {
  draft: { label: "ร่าง", icon: "📝", color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
  pending:   { label: 'รอพิจารณา',  icon: '⏳', color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  approved:  { label: 'อนุมัติแล้ว', icon: '✅', color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
  rejected:  { label: 'ไม่อนุมัติ',  icon: '❌', color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  cancelled: { label: 'ยกเลิก',      icon: '🚫', color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
};

// ── Fiscal year helpers (Thai: Oct 1 – Sep 30) ───────────────────────────────
export function getCurrentFiscalYear(): number {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year  = now.getFullYear();
  return month >= 9 ? year + 1 : year;
}

export function isInFiscalYear(dateStr: string, fiscalYear: number): boolean {
  if (!dateStr || fiscalYear === 0) return true;
  const d     = new Date(dateStr);
  const start = new Date(`${fiscalYear - 1}-10-01`);
  const end   = new Date(`${fiscalYear}-09-30`);
  return d >= start && d <= end;
}