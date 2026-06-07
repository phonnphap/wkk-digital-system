"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type RepairStatus = "pending" | "in_progress" | "completed" | "cancelled";

interface RepairRequest {
  id: string;
  ticket_no: string;
  reporter_id: string;
  category: string;
  location: string;
  description: string;
  photo_urls: string[] | null;
  status: RepairStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  progress_notes: { note: string; by: string; at: string }[] | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  reporter?: { first_name: string; last_name: string; position?: string };
  assignee?: { first_name: string; last_name: string };
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  position?: string;
}

function fullName(u: any) {
  if (!u) return "-";
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "-";
}
function toThaiDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  });
}
function toThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok",
  });
}
function genTicketNo(): string {
  const y = new Date().getFullYear() + 543;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `REP-${y}-${rand}`;
}

const CATEGORIES = [
  { key: "computer",   label: "คอมพิวเตอร์ / IT",     icon: "💻", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
  { key: "electrical", label: "ไฟฟ้า / แอร์",          icon: "⚡", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  { key: "plumbing",   label: "ประปา / ห้องน้ำ",        icon: "🔧", color: "#06b6d4", bg: "#ecfeff", border: "#a5f3fc" },
  { key: "building",   label: "อาคาร / สถานที่",        icon: "🏫", color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
  { key: "furniture",  label: "เฟอร์นิเจอร์",           icon: "🪑", color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0" },
  { key: "projector",  label: "โปรเจกเตอร์ / จอ",      icon: "📽️", color: "#ec4899", bg: "#fdf2f8", border: "#fbcfe8" },
  { key: "network",    label: "เครือข่าย / อินเทอร์เน็ต", icon: "📡", color: "#14b8a6", bg: "#f0fdfa", border: "#99f6e4" },
  { key: "other",      label: "อื่นๆ",                  icon: "🔨", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
];

const STATUS_CONFIG: Record<RepairStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  pending:     { label: "รอดำเนินการ",    color: "#92400e", bg: "#fffbeb", border: "#fcd34d", dot: "#f59e0b" },
  in_progress: { label: "กำลังดำเนินการ", color: "#1e40af", bg: "#eff6ff", border: "#93c5fd", dot: "#3b82f6" },
  completed:   { label: "เสร็จสิ้น",      color: "#065f46", bg: "#ecfdf5", border: "#6ee7b7", dot: "#10b981" },
  cancelled:   { label: "ยกเลิก",         color: "#6b7280", bg: "#f9fafb", border: "#d1d5db", dot: "#9ca3af" },
};

const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "staff"];

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: RepairStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 12px", borderRadius: 20,
      fontSize: 13, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
      border: `1.5px solid ${cfg.border}`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
      {cfg.label}
    </span>
  );
}

// ── RepairForm ────────────────────────────────────────────────────────────────
function RepairForm({ user, onSubmit, onCancel }: {
  user: UserProfile;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [category,    setCategory]    = useState("");
  const [location,    setLocation]    = useState("");
  const [description, setDescription] = useState("");
  const [photoFiles,  setPhotoFiles]  = useState<File[]>([]);
  const [loading,     setLoading]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canSubmit = category && location && description;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    const photoUrls: string[] = [];
    for (const f of photoFiles) {
      const path = `repairs/${Date.now()}_${f.name}`;
      const { data, error } = await supabase.storage.from("school-files").upload(path, f, { upsert: true });
      if (!error && data) {
        const { data: urlData } = supabase.storage.from("school-files").getPublicUrl(data.path);
        photoUrls.push(urlData.publicUrl);
      }
    }
    await onSubmit({
      ticket_no: genTicketNo(), reporter_id: user.id, category, location, description,
      photo_urls: photoUrls.length > 0 ? photoUrls : null,
      status: "pending", progress_notes: [],
    });
    setLoading(false);
  }

  const selCat = CATEGORIES.find(c => c.key === category);

  return (
    <div style={{ maxWidth: 660, margin: "0 auto", padding: "0 1rem 2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28, paddingTop: 20 }}>
        <button onClick={onCancel} style={{
          width: 42, height: 42, borderRadius: 12, border: "2px solid #e5e7eb",
          background: "white", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}>←</button>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#111827" }}>📝 แจ้งซ่อม</h2>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>{fullName(user)} · {user.position ?? user.role}</p>
        </div>
      </div>

      {/* Section 1: Category */}
      <div style={{ background: "white", borderRadius: 20, border: "1.5px solid #f3f4f6", padding: 24, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: "#3b82f6", color: "white", width: 24, height: 24, borderRadius: "50%", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>1</span>
          หมวดหมู่ปัญหา <span style={{ color: "#ef4444" }}>*</span>
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {CATEGORIES.map(c => (
            <button key={c.key} type="button" onClick={() => setCategory(c.key)} style={{
              padding: "12px 10px", borderRadius: 14, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 600, textAlign: "center", lineHeight: 1.3,
              background: category === c.key ? c.bg : "#f9fafb",
              border: `2px solid ${category === c.key ? c.color : "#e5e7eb"}`,
              color: category === c.key ? c.color : "#6b7280",
              transform: category === c.key ? "scale(1.02)" : "scale(1)",
              transition: "all 0.15s ease",
            }}>
              <span style={{ fontSize: 24 }}>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: Details */}
      <div style={{ background: "white", borderRadius: 20, border: "1.5px solid #f3f4f6", padding: 24, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: "#10b981", color: "white", width: 24, height: 24, borderRadius: "50%", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>2</span>
          รายละเอียด
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
            📍 สถานที่ <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)}
            placeholder="เช่น ห้อง 214 ตึก 2, ห้องคอมพิวเตอร์ 1"
            style={{ width: "100%", padding: "12px 16px", fontSize: 15, borderRadius: 12, border: "2px solid #e5e7eb", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
            📋 รายละเอียดปัญหา <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="อธิบายอาการเสียหาย หรือสิ่งที่ต้องการให้ซ่อม..."
            style={{ width: "100%", padding: "12px 16px", fontSize: 15, borderRadius: 12, border: "2px solid #e5e7eb", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
        </div>
      </div>

      {/* Section 3: Photo */}
      <div style={{ background: "white", borderRadius: 20, border: "1.5px solid #f3f4f6", padding: 24, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: "#f59e0b", color: "white", width: 24, height: 24, borderRadius: "50%", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>3</span>
          แนบรูปภาพ (ไม่บังคับ)
        </p>
        <button type="button" onClick={() => fileRef.current?.click()} style={{
          width: "100%", padding: 20, borderRadius: 14, border: "2.5px dashed #d1d5db",
          background: "#f9fafb", cursor: "pointer", fontSize: 14, color: "#6b7280", fontWeight: 500,
        }}>
          📸 คลิกเพื่อเลือกรูป (JPG, PNG)
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={e => setPhotoFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])} />
        {photoFiles.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {photoFiles.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 10, background: "#eff6ff", border: "1.5px solid #bfdbfe", fontSize: 13, color: "#1e40af" }}>
                📎 <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <button type="button" onClick={() => setPhotoFiles(p => p.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 12 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "2px solid #e5e7eb", background: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", color: "#374151" }}>
          ยกเลิก
        </button>
        <button type="button" onClick={handleSubmit} disabled={!canSubmit || loading} style={{
          flex: 2, padding: "14px", borderRadius: 14, border: "none", fontSize: 15, fontWeight: 700, cursor: canSubmit && !loading ? "pointer" : "not-allowed",
          background: canSubmit && !loading ? "linear-gradient(135deg, #3b82f6, #6366f1)" : "#e5e7eb",
          color: canSubmit && !loading ? "white" : "#9ca3af",
          boxShadow: canSubmit && !loading ? "0 4px 14px rgba(99,102,241,0.4)" : "none",
        }}>
          {loading ? "⏳ กำลังส่ง..." : "📤 ส่งคำขอแจ้งซ่อม"}
        </button>
      </div>
    </div>
  );
}

// ── RepairCard ────────────────────────────────────────────────────────────────
function RepairCard({ req, currentUser, staff, onUpdate }: {
  req: RepairRequest; currentUser: UserProfile; staff: UserProfile[]; onUpdate: () => void;
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteText,   setNoteText]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const isAdmin   = ADMIN_ROLES.includes(currentUser.role);
  const isOwner   = req.reporter_id === currentUser.id;
  const isAssignee = req.assigned_to === currentUser.id;
  const cat = CATEGORIES.find(c => c.key === req.category) ?? CATEGORIES[7];
  const st  = STATUS_CONFIG[req.status];

  async function updateStatus(status: RepairStatus) {
    setLoading(true);
    const updates: any = { status, updated_at: new Date().toISOString() };
    if (status === "completed") updates.completed_at = new Date().toISOString();
    await (supabase.from("repair_requests") as any).update(updates).eq("id", req.id);
    setLoading(false); onUpdate();
  }
  async function assignTo(userId: string) {
    setLoading(true);
    await (supabase.from("repair_requests") as any).update({
      assigned_to: userId || null, assigned_at: userId ? new Date().toISOString() : null,
      status: userId ? "in_progress" : "pending", updated_at: new Date().toISOString(),
    }).eq("id", req.id);
    setLoading(false); onUpdate();
  }
  async function addNote() {
    if (!noteText.trim()) return;
    setLoading(true);
    const notes = [...(req.progress_notes ?? []), { note: noteText.trim(), by: fullName(currentUser), at: new Date().toISOString() }];
    await (supabase.from("repair_requests") as any).update({ progress_notes: notes, updated_at: new Date().toISOString() }).eq("id", req.id);
    setNoteText(""); setAddingNote(false); setLoading(false); onUpdate();
  }
  async function cancelRequest() {
    if (!confirm("ยืนยันการยกเลิกคำขอแจ้งซ่อมนี้?")) return;
    setLoading(true);
    await (supabase.from("repair_requests") as any).update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", req.id);
    setLoading(false); onUpdate();
  }

  return (
    <div style={{
      background: "white", borderRadius: 20, overflow: "hidden",
      border: `2px solid ${expanded ? cat.border : "#f3f4f6"}`,
      boxShadow: expanded ? `0 4px 20px ${cat.color}20` : "0 2px 8px rgba(0,0,0,0.05)",
      opacity: req.status === "cancelled" ? 0.65 : 1,
      transition: "all 0.2s ease",
    }}>
      {/* Color bar top */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${cat.color}, ${cat.color}88)` }} />

      {/* Card header */}
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: cat.bg, border: `1.5px solid ${cat.border}`, fontSize: 22,
        }}>{cat.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600, fontFamily: "monospace" }}>{req.ticket_no}</span>
            <StatusBadge status={req.status} />
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 3px", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cat.label} — {req.location}
          </p>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {req.description}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{toThaiDate(req.created_at)}</span>
          <span style={{ fontSize: 18, color: "#9ca3af" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: `2px solid ${cat.border}`, padding: "18px 20px", background: cat.bg }}>
          {/* Meta grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: 16, fontSize: 14 }}>
            <div><span style={{ color: "#6b7280", fontWeight: 500 }}>👤 ผู้แจ้ง: </span><strong>{fullName(req.reporter)}</strong></div>
            <div><span style={{ color: "#6b7280", fontWeight: 500 }}>🕐 แจ้งเมื่อ: </span><strong>{toThaiDateTime(req.created_at)}</strong></div>
            {req.assigned_to && <div><span style={{ color: "#6b7280", fontWeight: 500 }}>🔧 ช่างที่รับงาน: </span><strong>{fullName(req.assignee)}</strong></div>}
            {req.completed_at && <div><span style={{ color: "#6b7280", fontWeight: 500 }}>✅ เสร็จเมื่อ: </span><strong>{toThaiDateTime(req.completed_at)}</strong></div>}
          </div>

          {/* Description */}
          <div style={{ padding: "14px 16px", background: "white", borderRadius: 14, fontSize: 15, marginBottom: 16, lineHeight: 1.7, color: "#374151", border: `1.5px solid ${cat.border}` }}>
            {req.description}
          </div>

          {/* Photos */}
          {req.photo_urls && req.photo_urls.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              {req.photo_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 12, border: `2px solid ${cat.border}` }} />
                </a>
              ))}
            </div>
          )}

          {/* Progress notes */}
          {req.progress_notes && req.progress_notes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10 }}>📝 บันทึกความคืบหน้า</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {req.progress_notes.map((n, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: 12, background: "white", fontSize: 14, borderLeft: `4px solid ${cat.color}` }}>
                    <p style={{ margin: "0 0 4px", color: "#111827" }}>{n.note}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>{n.by} · {toThaiDateTime(n.at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add note */}
          {(isAdmin || isAssignee) && req.status !== "completed" && req.status !== "cancelled" && (
            <div style={{ marginBottom: 14 }}>
              {!addingNote ? (
                <button type="button" onClick={() => setAddingNote(true)} style={{
                  fontSize: 14, padding: "8px 16px", borderRadius: 10, border: `1.5px dashed ${cat.color}`, background: "white", cursor: "pointer", color: cat.color, fontWeight: 600,
                }}>+ เพิ่มบันทึกความคืบหน้า</button>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" value={noteText} onChange={e => setNoteText(e.target.value)}
                    placeholder="บันทึกความคืบหน้า..." autoFocus
                    style={{ flex: 1, padding: "10px 14px", fontSize: 14, borderRadius: 10, border: `2px solid ${cat.color}`, outline: "none", fontFamily: "inherit" }}
                    onKeyDown={e => e.key === "Enter" && addNote()} />
                  <button type="button" onClick={addNote} disabled={!noteText.trim() || loading}
                    style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: cat.color, color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>บันทึก</button>
                  <button type="button" onClick={() => { setAddingNote(false); setNoteText(""); }}
                    style={{ padding: "10px 14px", borderRadius: 10, border: `1.5px solid #e5e7eb`, background: "white", cursor: "pointer", fontSize: 14 }}>ยกเลิก</button>
                </div>
              )}
            </div>
          )}

          {/* Admin actions */}
          {isAdmin && req.status !== "cancelled" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              {(req.status === "pending" || req.status === "in_progress") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>มอบหมาย:</span>
                  <select value={req.assigned_to ?? ""} onChange={e => assignTo(e.target.value)}
                    style={{ fontSize: 14, padding: "8px 12px", borderRadius: 10, border: "2px solid #e5e7eb", fontFamily: "inherit" }}>
                    <option value="">— ยังไม่ได้มอบหมาย —</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
                  </select>
                </div>
              )}
              {req.status === "in_progress" && (
                <button type="button" disabled={loading} onClick={() => updateStatus("completed")} style={{
                  padding: "10px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #10b981, #059669)",
                  color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 3px 10px rgba(16,185,129,0.4)",
                }}>✅ ปิดงาน — เสร็จสิ้น</button>
              )}
            </div>
          )}

          {/* Owner cancel */}
          {isOwner && req.status === "pending" && (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={cancelRequest} disabled={loading} style={{
                padding: "10px 18px", borderRadius: 10, border: "2px solid #fecaca",
                background: "#fef2f2", color: "#dc2626", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}>🗑️ ยกเลิกคำขอ</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Page ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function RepairPage() {
  const router = useRouter();
  const [user,         setUser]         = useState<UserProfile | null>(null);
  const [requests,     setRequests]     = useState<RepairRequest[]>([]);
  const [staff,        setStaff]        = useState<UserProfile[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [filterStatus, setFilterStatus] = useState<RepairStatus | "all">("all");
  const [filterCat,    setFilterCat]    = useState("all");
  const [search,       setSearch]       = useState("");

  useEffect(() => {
    const init = async () => {
      const { data: { user: au } } = await supabase.auth.getUser();
      if (!au) { setLoading(false); return; }

      const meta = au.user_metadata ?? {};
      const claims = meta.custom_claims ?? {};
      const email = au.email || meta.email || meta.preferred_username || meta.upn || claims.email || claims.preferred_username || "";

      let data: any = null;

      const byAuthId = await supabase.from("users")
        .select("id, first_name, last_name, email, role, position")
        .eq("auth_id", au.id).maybeSingle();

      if (byAuthId.data) {
        data = byAuthId.data;
      } else if (email) {
        const byEmail = await supabase.from("users")
          .select("id, first_name, last_name, email, role, position")
          .eq("email", email).maybeSingle();
        data = byEmail.data;
        if (data) {
          await (supabase.from("users") as any)
            .update({ auth_id: au.id }).eq("id", data.id);
        }
      }

      if (data) {
        setUser(data as UserProfile);
        const { data: staffData } = await supabase.from("users")
          .select("id, first_name, last_name, role, position")
          .in("role", ADMIN_ROLES);
        setStaff((staffData as UserProfile[]) || []);
      }
      setLoading(false);  // ← ย้ายมาอยู่ใน init
    };
    init();
  }, []);

  const loadRequests = useCallback(async () => {
    if (!user) return;
    const isAdmin = ADMIN_ROLES.includes(user.role);
    let query = (supabase.from("repair_requests") as any)
      .select("*, reporter:users!reporter_id(first_name,last_name,position), assignee:users!assigned_to(first_name,last_name)")
      .order("created_at", { ascending: false });
    if (!isAdmin) query = query.eq("reporter_id", user.id);
    const { data } = await query;
    setRequests((data as RepairRequest[]) || []);
  }, [user]);

  useEffect(() => { if (user) loadRequests(); }, [user, loadRequests]);

  async function submitRepair(payload: any) {
    const { error } = await (supabase.from("repair_requests") as any).insert([payload]);
    if (error) { alert("❌ " + error.message); return; }
    alert("✅ ส่งคำขอแจ้งซ่อมเรียบร้อยแล้ว");
    setShowForm(false);
    await loadRequests();
  }

  const filtered = requests.filter(r => {
    const inStatus = filterStatus === "all" || r.status === filterStatus;
    const inCat    = filterCat    === "all" || r.category === filterCat;
    const inSearch = !search ||
      r.ticket_no.toLowerCase().includes(search.toLowerCase()) ||
      r.location.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase());
    return inStatus && inCat && inSearch;
  });

  const isAdmin = user ? ADMIN_ROLES.includes(user.role) : false;
  const stats = {
    pending:     requests.filter(r => r.status === "pending").length,
    in_progress: requests.filter(r => r.status === "in_progress").length,
    completed:   requests.filter(r => r.status === "completed").length,
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
        <p style={{ color: "#6b7280", fontSize: 16, fontWeight: 500 }}>กำลังโหลด...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
      <p style={{ color: "#ef4444", fontSize: 16, fontWeight: 600 }}>❌ กรุณาเข้าสู่ระบบก่อน</p>
    </div>
  );

  if (showForm) return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      <RepairForm user={user} onSubmit={submitRepair} onCancel={() => setShowForm(false)} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif" }}>

      {/* Top bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "white", borderBottom: "2px solid #f3f4f6",
        padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* ปุ่มกลับหน้าหลัก */}
          <button onClick={() => router.push("/")} style={{
            width: 40, height: 40, borderRadius: 12, border: "2px solid #e5e7eb",
            background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }} title="กลับหน้าหลัก">🏠</button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>🔧 แจ้งซ่อม (Helpdesk)</h1>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>โรงเรียนวัดเขียนเขต</p>
          </div>
        </div>
        <button type="button" onClick={() => setShowForm(true)} style={{
          padding: "10px 20px", borderRadius: 14, border: "none",
          background: "linear-gradient(135deg, #3b82f6, #6366f1)",
          color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer",
          boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>➕</span> แจ้งซ่อม
        </button>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 860, margin: "0 auto" }}>

        {/* Stats — admin only */}
        {isAdmin && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { key: "pending",     label: "รอดำเนินการ",    val: stats.pending,     emoji: "⏳", color: "#f59e0b", bg: "#fffbeb", border: "#fcd34d" },
              { key: "in_progress", label: "กำลังดำเนินการ", val: stats.in_progress, emoji: "⚙️", color: "#3b82f6", bg: "#eff6ff", border: "#93c5fd" },
              { key: "completed",   label: "เสร็จสิ้น",      val: stats.completed,   emoji: "✅", color: "#10b981", bg: "#ecfdf5", border: "#6ee7b7" },
            ].map(s => (
              <div key={s.key} onClick={() => setFilterStatus(filterStatus === s.key ? "all" : s.key as RepairStatus)}
                style={{
                  padding: "18px 16px", borderRadius: 20, cursor: "pointer",
                  background: filterStatus === s.key ? s.bg : "white",
                  border: `2px solid ${filterStatus === s.key ? s.color : "#f3f4f6"}`,
                  boxShadow: filterStatus === s.key ? `0 4px 16px ${s.color}30` : "0 2px 8px rgba(0,0,0,0.04)",
                  transition: "all 0.2s ease",
                }}>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{s.emoji}</span> {s.label}
                </p>
                <p style={{ fontSize: 32, fontWeight: 800, margin: 0, color: filterStatus === s.key ? s.color : "#111827" }}>{s.val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>🔍</span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา ticket / สถานที่ / รายละเอียด..."
              style={{ width: "100%", paddingLeft: 40, padding: "12px 16px 12px 40px", fontSize: 14, borderRadius: 14, border: "2px solid #e5e7eb", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ fontSize: 14, padding: "12px 16px", borderRadius: 14, border: "2px solid #e5e7eb", fontFamily: "inherit", background: "white" }}>
            <option value="all">📦 ทุกหมวดหมู่</option>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
            style={{ fontSize: 14, padding: "12px 16px", borderRadius: 14, border: "2px solid #e5e7eb", fontFamily: "inherit", background: "white" }}>
            <option value="all">📋 ทุกสถานะ</option>
            {(Object.entries(STATUS_CONFIG)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "4rem 2rem",
            background: "white", borderRadius: 24, border: "2px dashed #e5e7eb",
          }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🔧</div>
            <p style={{ color: "#374151", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
              {requests.length === 0 ? "ยังไม่มีรายการแจ้งซ่อม" : "ไม่พบรายการที่ตรงกับการค้นหา"}
            </p>
            {requests.length === 0 && (
              <>
                <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 20 }}>เริ่มแจ้งซ่อมรายการแรกของคุณได้เลย</p>
                <button type="button" onClick={() => setShowForm(true)} style={{
                  padding: "12px 28px", borderRadius: 14, border: "none",
                  background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                  color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
                }}>➕ แจ้งซ่อมรายการแรก</button>
              </>
            )}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12, fontWeight: 500 }}>แสดง {filtered.length} รายการ</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(r => (
                <RepairCard key={r.id} req={r} currentUser={user} staff={staff} onUpdate={loadRequests} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}