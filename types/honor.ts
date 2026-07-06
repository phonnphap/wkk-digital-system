export type AwardCategory = 'School' | 'Executive' | 'Teacher' | 'Student';

export type AwardLevel = 'International' | 'National' | 'Regional' | 'Provincial' | 'Local'| 'SchoolLevel';

export type AwardType =
  | 'Academic'
  | 'Sports'
  | 'Arts & Culture'
  | 'Morality/Ethics'
  | 'Innovation'
  | 'Other';

export type RecipientRole = 'Recipient' | 'Coach';

export const CATEGORY_LABELS: Record<AwardCategory, string> = {
  School: 'โรงเรียน',
  Executive: 'ผู้บริหาร',
  Teacher: 'ครู/บุคลากร',
  Student: 'นักเรียน',
};

export const AWARD_LEVEL_LABELS: Record<AwardLevel, string> = {
  International: 'ระดับนานาชาติ',
  National: 'ระดับประเทศ',
  Regional: 'ระดับภาค',
  Provincial: 'ระดับจังหวัด',
  Local: 'ระดับท้องถิ่น/เขตพื้นที่',
  SchoolLevel: 'ระดับโรงเรียน', 
};

export const AWARD_TYPE_LABELS: Record<AwardType, string> = {
  Academic: 'วิชาการ',
  Sports: 'กีฬา',
  'Arts & Culture': 'ศิลปะ/วัฒนธรรม',
  'Morality/Ethics': 'คุณธรรม/จริยธรรม',
  Innovation: 'นวัตกรรม',
  Other: 'อื่น ๆ',
};

export const RECIPIENT_ROLE_LABELS: Record<RecipientRole, string> = {
  Recipient: 'ผู้รับรางวัล',
  Coach: 'ผู้ฝึกสอน/ผู้ควบคุม',
};

export const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as AwardCategory[];
export const AWARD_LEVEL_OPTIONS = Object.keys(AWARD_LEVEL_LABELS) as AwardLevel[];
export const AWARD_TYPE_OPTIONS = Object.keys(AWARD_TYPE_LABELS) as AwardType[];
export const RECIPIENT_ROLE_OPTIONS = Object.keys(RECIPIENT_ROLE_LABELS) as RecipientRole[];

export interface Recipient {
  id?: string;
  recipient_name: string;
  student_id?: string | null;
  grade_level?: string | null;
  classroom?: string | null;
  department?: string | null;
  role?: RecipientRole | null;
}

export interface Award {
  id: string;
  category: AwardCategory;
  title: string;
  date_received: string; // ISO date
  academic_year: number;
  organizer: string | null;
  award_level: AwardLevel;
  award_type: AwardType;
  image_cover: string | null;
  certificate_file: string | null;
  award_images: string[] | null;  
  pr_link: string | null;
  tags: string[];
  kpi_standard: string | null;
  created_at: string;
  updated_at: string;
  // ★ เพิ่ม — สำหรับแสดงชื่อผู้บันทึกและเช็คสิทธิ์ลบ
  created_by?: string | null;
  created_by_name?: string | null;
}

// แถวที่อ่านจาก view awards_with_recipients
export interface AwardWithRecipients extends Award {
  recipients: Recipient[];
  departments: string[];
}

export interface AwardFormInput {
  id?: string;
  category: AwardCategory;
  title: string;
  date_received: string;
  academic_year: number;
  organizer: string;
  award_level: AwardLevel;
  award_type: AwardType;
  image_cover: string;
  certificate_file: string;
  award_images?: string[]; 
  pr_link: string;
  tags: string[];
  kpi_standard: string;
  recipients: Recipient[];
}

export interface AwardFilters {
  category?: AwardCategory | 'All';
  academic_year?: number | 'All';
  award_level?: AwardLevel | 'All';
  award_type?: AwardType | 'All';
  department?: string | 'All';
  search?: string;
}