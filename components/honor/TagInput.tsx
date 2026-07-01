'use client';

import { useState } from 'react';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export default function TagInput({ tags, onChange }: Props) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const value = draft.trim();
    if (value && !tags.includes(value)) {
      onChange([...tags, value]);
    }
    setDraft('');
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-navy/15 bg-white px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-gold">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-navy/8 text-navy text-xs font-medium px-2.5 py-1"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            aria-label={`ลบแท็ก ${tag}`}
            className="text-navy/50 hover:text-navy"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? 'พิมพ์แท็กแล้วกด Enter เช่น สพฐ, STEM' : 'เพิ่มแท็ก...'}
        className="flex-1 min-w-[120px] text-sm outline-none py-1"
      />
    </div>
  );
}
