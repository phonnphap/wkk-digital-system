// types/database.ts — Generated types matching schema.sql
// Run: npx supabase gen types typescript --project-id <your-project-id> > types/database.ts
// (หรือใช้ types ด้านล่างนี้ที่เขียนเอง ตรงกับ schema.sql ทุก table)

export type UserRole =
  | 'admin' | 'director' | 'deputy_director' | 'dept_head'
  | 'grade_head' | 'homeroom_teacher' | 'subject_teacher' | 'staff'

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave' | 'excused'
export type LeaveStatus = 'pending' | 'approved_head' | 'approved_deputy' | 'approved_director' | 'rejected'
export type LeaveType = 'sick' | 'personal' | 'vacation' | 'official' | 'maternity' | 'ordination' | 'other'
export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type RepairStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type DocType = 'certificate_no' | 'order_no' | 'memo_no' | 'other'
export type BmiStatus = 'underweight' | 'normal' | 'overweight' | 'obese'
export type BehaviorAction = 'deduct' | 'add'
export type Gender = 'male' | 'female'

// ── Row types (ข้อมูลใน DB) ──────────────────────────────────────────────────

export interface DbUser {
  id: string
  auth_id: string | null
  email: string
  first_name: string
  last_name: string
  nick_name: string | null
  title: string | null
  role: UserRole
  department_id: string | null
  employee_id: string | null
  phone: string | null
  line_user_id: string | null
  avatar_url: string | null
  face_vector: number[] | null         // 128-dim face descriptor
  face_registered_at: string | null
  is_active: boolean
  position: string | null
  academic_level: string | null
  start_date: string | null
  created_at: string
  updated_at: string
}

export interface DbTeacherAttendance {
  id: string
  user_id: string
  attendance_date: string              // 'YYYY-MM-DD'
  check_in_time: string | null         // ISO timestamp
  check_in_lat: number | null
  check_in_lng: number | null
  check_in_face_score: number | null   // 0–1 confidence
  check_out_time: string | null
  check_out_lat: number | null
  check_out_lng: number | null
  check_out_face_score: number | null
  is_late: boolean
  late_minutes: number
  notes: string | null
  created_at: string
}

export interface DbStudent {
  id: string
  student_code: string
  first_name: string
  last_name: string
  nick_name: string | null
  gender: Gender
  birth_date: string | null
  national_id: string | null
  classroom_id: string | null
  academic_year_id: string | null
  parent1_name: string | null
  parent1_phone: string | null
  parent1_line_id: string | null
  parent2_name: string | null
  parent2_phone: string | null
  parent2_line_id: string | null
  behavior_score: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DbHomeroomAttendance {
  id: string
  student_id: string
  classroom_id: string
  attendance_date: string
  status: AttendanceStatus
  checked_by: string
  check_time: string | null
  notes: string | null
  line_notified: boolean
  line_notified_at: string | null
  created_at: string
}

export interface DbLeaveRequest {
  id: string
  user_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days_count: number
  reason: string
  document_url: string | null
  status: LeaveStatus
  approved_by_head: string | null
  approved_by_head_at: string | null
  approved_by_deputy: string | null
  approved_by_deputy_at: string | null
  approved_by_director: string | null
  approved_by_director_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export interface DbClassroom {
  id: string
  grade_level_id: string
  room_number: number
  room_name: string
  homeroom_teacher_id: string | null
  academic_year_id: string
  student_count: number
  created_at: string
}

export interface DbSubject {
  id: string
  subject_code: string
  name_th: string
  name_en: string | null
  credit_hours: number
  subject_group: string | null
}

export interface DbTimetableEntry {
  id: string
  academic_year_id: string
  classroom_id: string
  subject_id: string
  teacher_id: string
  day_of_week: number   // 1=Mon … 5=Fri
  time_slot_id: string
  created_at: string
}

// ── Supabase Database generic ────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      users: {
        Row: DbUser
        Insert: Omit<DbUser, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DbUser, 'id' | 'created_at'>>
      }
      teacher_attendance: {
        Row: DbTeacherAttendance
        Insert: Omit<DbTeacherAttendance, 'id' | 'created_at'>
        Update: Partial<Omit<DbTeacherAttendance, 'id' | 'created_at'>>
      }
      students: {
        Row: DbStudent
        Insert: Omit<DbStudent, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DbStudent, 'id' | 'created_at'>>
      }
      homeroom_attendance: {
        Row: DbHomeroomAttendance
        Insert: Omit<DbHomeroomAttendance, 'id' | 'created_at'>
        Update: Partial<Omit<DbHomeroomAttendance, 'id' | 'created_at'>>
      }
      leave_requests: {
        Row: DbLeaveRequest
        Insert: Omit<DbLeaveRequest, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DbLeaveRequest, 'id' | 'created_at'>>
      }
      classrooms: { Row: DbClassroom; Insert: Omit<DbClassroom, 'id' | 'created_at'>; Update: Partial<DbClassroom> }
      subjects: { Row: DbSubject; Insert: Omit<DbSubject, 'id'>; Update: Partial<DbSubject> }
      timetable_entries: { Row: DbTimetableEntry; Insert: Omit<DbTimetableEntry, 'id' | 'created_at'>; Update: Partial<DbTimetableEntry> }
    }
    Views: {
      attendance_stats_daily: { Row: Record<string, unknown> }
      at_risk_students: { Row: Record<string, unknown> }
      student_grades: { Row: Record<string, unknown> }
    }
    Functions: {
      get_next_document_number: {
        Args: { p_doc_type: DocType; p_academic_year_id: string }
        Returns: number
      }
    }
    Enums: {}
  }
}

// ── App-level types (non-DB) ─────────────────────────────────────────────────

export interface AuthUser {
  id: string           // auth.uid()
  email: string
  dbUser: DbUser       // joined from users table
}

export interface GpsPosition {
  lat: number
  lng: number
  accuracy: number
}

export interface FaceCheckResult {
  matched: boolean
  userId: string | null
  score: number          // cosine distance (lower = better match)
  descriptor: number[]   // 128-dim vector
}
