import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
import type { AwardFilters, AwardFormInput, AwardWithRecipients } from '@/types/honor';

/**
 * ดึงรายการรางวัลทั้งหมดตามเงื่อนไข filter (ใช้ view awards_with_recipients)
 */
export async function fetchAwards(filters: AwardFilters = {}): Promise<AwardWithRecipients[]> {
  let query = supabase
    .from('awards_with_recipients')
    .select('*')
    .order('date_received', { ascending: false });

  if (filters.category && filters.category !== 'All') {
    query = query.eq('category', filters.category);
  }
  if (filters.academic_year && filters.academic_year !== 'All') {
    query = query.eq('academic_year', filters.academic_year);
  }
  if (filters.award_level && filters.award_level !== 'All') {
    query = query.eq('award_level', filters.award_level);
  }
  if (filters.award_type && filters.award_type !== 'All') {
    query = query.eq('award_type', filters.award_type);
  }
  if (filters.department && filters.department !== 'All') {
    query = query.contains('departments', [filters.department]);
  }
  if (filters.search && filters.search.trim() !== '') {
    const term = filters.search.trim();
    query = query.or(`title.ilike.%${term}%,organizer.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AwardWithRecipients[];
}

export async function fetchAwardById(id: string): Promise<AwardWithRecipients | null> {
  const { data, error } = await supabase
    .from('awards_with_recipients')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as AwardWithRecipients | null;
}

/**
 * ดึงรายชื่อ "ปีการศึกษา" และ "ฝ่ายงาน/กลุ่มสาระ" ที่มีอยู่จริงในข้อมูล เพื่อเอาไปทำ dropdown filter
 */
export async function fetchFilterOptions(): Promise<{ years: number[]; departments: string[] }> {
  const [{ data: yearRows, error: yearErr }, { data: deptRows, error: deptErr }] =
    await Promise.all([
      supabase.from('awards').select('academic_year'),
      supabase.from('award_recipients').select('department'),
    ]);

  if (yearErr) throw yearErr;
  if (deptErr) throw deptErr;

  const years = Array.from(
    new Set((yearRows ?? []).map((r: { academic_year: number }) => r.academic_year))
  ).sort((a, b) => b - a);

  const departments = Array.from(
    new Set(
      (deptRows ?? [])
        .map((r: { department: string | null }) => r.department)
        .filter((d): d is string => !!d)
    )
  ).sort();

  return { years, departments };
}

/**
 * บันทึกรางวัลใหม่ หรือแก้ไขรางวัลเดิม พร้อมรายชื่อผู้รับทั้งหมด (atomic ผ่าน RPC)
 */
export async function saveAward(input: AwardFormInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_award', {
    p_id: input.id ?? null,
    p_category: input.category,
    p_title: input.title,
    p_date_received: input.date_received,
    p_academic_year: input.academic_year,
    p_organizer: input.organizer || null,
    p_award_level: input.award_level,
    p_award_type: input.award_type,
    p_image_cover: input.image_cover || null,
    p_certificate_file: input.certificate_file || null,
    p_pr_link: input.pr_link || null,
    p_tags: input.tags,
    p_kpi_standard: input.kpi_standard || null,
    p_recipients: input.recipients,
  });

  if (error) throw error;
  return data as string;
}

export async function deleteAward(id: string): Promise<void> {
  const { error } = await supabase.from('awards').delete().eq('id', id);
  if (error) throw error;
}

/**
 * อัปโหลดไฟล์ (รูปปก หรือ เกียรติบัตร PDF) ขึ้น Supabase Storage แล้วคืน public URL
 */
export async function uploadAwardFile(
  file: File,
  bucket: 'award-images' | 'award-certificates'
): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * สถิติสรุปสำหรับหน้า Dashboard
 */
export async function fetchStats(): Promise<{
  total: number;
  byCategory: Record<string, number>;
  byLevel: Record<string, number>;
}> {
  const { data, error } = await supabase.from('awards').select('category, award_level');
  if (error) throw error;

  const byCategory: Record<string, number> = {};
  const byLevel: Record<string, number> = {};
  for (const row of data ?? []) {
    byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
    byLevel[row.award_level] = (byLevel[row.award_level] ?? 0) + 1;
  }

  return { total: data?.length ?? 0, byCategory, byLevel };
}
