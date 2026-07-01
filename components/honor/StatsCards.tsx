import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '@/types/honor';

const ICONS: Record<string, string> = {
  School: '🏛',
  Executive: '🎖',
  Teacher: '📘',
  Student: '🎓',
};

export default function StatsCards({ byCategory }: { byCategory: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {CATEGORY_OPTIONS.map((cat) => (
        <div key={cat} className="card-honor p-5 flex items-center gap-4">
          <span className="text-2xl" aria-hidden>{ICONS[cat]}</span>
          <div>
            <p className="text-2xl font-display font-semibold text-navy">{byCategory[cat] ?? 0}</p>
            <p className="text-xs text-muted">{CATEGORY_LABELS[cat]}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
