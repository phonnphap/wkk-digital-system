import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export type TrainingType = 'Internal' | 'External' | 'Online' | 'Workshop' | 'Seminar';
export type TrainingStatus = 'attended' | 'passed';

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  Internal: 'อบรมภายใน',
  External: 'อบรมภายนอก',
  Online: 'ออนไลน์',
  Workshop: 'เวิร์กชอป',
  Seminar: 'สัมมนา',
};

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  attended: 'เข้าร่วมการอบรม',
  passed: 'ผ่านการอบรม',
};

export interface EvidenceFile {
  url: string;
  path?: string; // OneDrive relative path — ใช้ resolve ลิงก์ใหม่ตอนพิมพ์ เพราะลิงก์ตรงอาจหมดอายุ
  name: string;
}

export interface TrainingRecord {
  id: string;
  user_id: string;
  course_name: string;
  training_type: TrainingType;
  organizer: string | null;
  start_date: string;
  end_date: string;
  hours: number;
  status: TrainingStatus;
  key_takeaways: string | null;
  action_plan: string | null;
  evidence_files: EvidenceFile[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingRecordWithUser extends TrainingRecord {
  title?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string;
  grade_level?: string;
  department_name?: string;
  signature_url?: string;
}

export interface TrainingFilters {
  userId?: string;
  trainingType?: TrainingType | 'All';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface TrainingFormInput {
  id?: string;
  user_id: string;
  course_name: string;
  training_type: TrainingType;
  organizer: string;
  start_date: string;
  end_date: string;
  hours: number;
  status: TrainingStatus;
  key_takeaways: string;
  action_plan: string;
  evidence_files: EvidenceFile[];
}

// คอลัมน์ตรงกับ TrainingRecordWithUser ทั้งหมด — ใช้แทน select('*') บน view training_records_with_user
const TRAINING_RECORD_WITH_USER_COLUMNS = `
  id,
  user_id,
  course_name,
  training_type,
  organizer,
  start_date,
  end_date,
  hours,
  status,
  key_takeaways,
  action_plan,
  evidence_files,
  created_by,
  created_at,
  updated_at,
  title,
  first_name,
  last_name,
  full_name,
  position,
  grade_level,
  department_name,
  signature_url
`;

export async function fetchTrainingRecords(filters: TrainingFilters = {}): Promise<TrainingRecordWithUser[]> {
  let query = supabase
    .from('training_records_with_user')
    .select(TRAINING_RECORD_WITH_USER_COLUMNS)
    .order('start_date', { ascending: false })
    .limit(300);

  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.trainingType && filters.trainingType !== 'All') query = query.eq('training_type', filters.trainingType);
  if (filters.dateFrom) query = query.gte('start_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('start_date', filters.dateTo);
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    query = query.or(`course_name.ilike.%${term}%,organizer.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TrainingRecordWithUser[];
}

export async function saveTrainingRecord(input: TrainingFormInput): Promise<string> {
  const payload = {
    user_id: input.user_id,
    course_name: input.course_name,
    training_type: input.training_type,
    organizer: input.organizer || null,
    start_date: input.start_date,
    end_date: input.end_date,
    hours: input.hours,
    status: input.status,
    key_takeaways: input.key_takeaways || null,
    action_plan: input.action_plan || null,
    evidence_files: input.evidence_files,
  };

  if (input.id) {
    const { error } = await supabase.from('training_records').update(payload).eq('id', input.id);
    if (error) throw error;
    return input.id;
  }

  const { data: { user: authUser } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_id', authUser?.id).maybeSingle();

  const { data, error } = await supabase
    .from('training_records')
    .insert({ ...payload, created_by: me?.id })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteTrainingRecord(id: string) {
  const { error } = await supabase.from('training_records').delete().eq('id', id);
  if (error) throw error;
}