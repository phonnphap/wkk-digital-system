'use client';

import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  AWARD_LEVEL_LABELS,
  AWARD_LEVEL_OPTIONS,
  AWARD_TYPE_LABELS,
  AWARD_TYPE_OPTIONS,
} from '@/types/honor';
import type { AwardFilters } from '@/types/honor';

interface Props {
  filters: AwardFilters;
  years: number[];
  departments: string[];
  onChange: (filters: AwardFilters) => void;
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm text-ink focus-gold focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

export default function FilterBar({ filters, years, departments, onChange }: Props) {
  const update = (patch: Partial<AwardFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="card-honor p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
      <label className="flex flex-col gap-1 text-sm col-span-2 lg:col-span-1">
        <span className="text-xs text-muted font-medium">ค้นหา</span>
        <input
          type="text"
          placeholder="ชื่อรางวัล, หน่วยงาน..."
          value={filters.search ?? ''}
          onChange={(e) => update({ search: e.target.value })}
          className="rounded-md border border-navy/15 bg-white px-3 py-2 text-sm text-ink focus-gold focus:outline-none"
        />
      </label>

      <Select
        label="กลุ่มเป้าหมาย"
        value={filters.category ?? 'All'}
        onChange={(v) => update({ category: v as AwardFilters['category'] })}
      >
        <option value="All">ทั้งหมด</option>
        {CATEGORY_OPTIONS.map((c) => (
          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
        ))}
      </Select>

      <Select
        label="ปีการศึกษา"
        value={String(filters.academic_year ?? 'All')}
        onChange={(v) => update({ academic_year: v === 'All' ? 'All' : Number(v) })}
      >
        <option value="All">ทุกปี</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </Select>

      <Select
        label="ระดับรางวัล"
        value={filters.award_level ?? 'All'}
        onChange={(v) => update({ award_level: v as AwardFilters['award_level'] })}
      >
        <option value="All">ทุกระดับ</option>
        {AWARD_LEVEL_OPTIONS.map((l) => (
          <option key={l} value={l}>{AWARD_LEVEL_LABELS[l]}</option>
        ))}
      </Select>

      <Select
        label="ประเภทรางวัล"
        value={filters.award_type ?? 'All'}
        onChange={(v) => update({ award_type: v as AwardFilters['award_type'] })}
      >
        <option value="All">ทุกประเภท</option>
        {AWARD_TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>{AWARD_TYPE_LABELS[t]}</option>
        ))}
      </Select>

      <Select
        label="กลุ่มสาระ/ฝ่ายงาน"
        value={filters.department ?? 'All'}
        onChange={(v) => update({ department: v })}
      >
        <option value="All">ทั้งหมด</option>
        {departments.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </Select>
    </div>
  );
}
