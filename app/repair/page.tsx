"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type RepairStatus = "pending"|"in_progress"|"completed"|"cancelled";

interface Building {
  id: string;
  name: string;
  description?: string;
  responsible_user_id?: string;
  responsible?: { first_name: string; last_name: string; email?: string };
}

interface RepairRequest {
  id: string;
  ticket_no: string;
  reporter_id: string;
  category: string;
  building_id?: string;
  location: string;
  description: string;
  photo_urls: string[]|null;
  status: RepairStatus;
  assigned_to: string|null;
  assigned_at: string|null;
  progress_notes: {note:string;by:string;at:string}[]|null;
  completed_at: string|null;
  created_at: string;
  updated_at: string;
  reporter?: {first_name:string;last_name:string;position?:string;email?:string};
  assignee?: {first_name:string;last_name:string};
  building?: Building;
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  position?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fullName(u:any){if(!u)return"-";return`${u.first_name??""}${u.last_name??""}`.trim()||"-";}
function toThaiDateTime(iso:string){return new Date(iso).toLocaleString("th-TH",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Bangkok"});}
function toThaiDate(iso:string){return new Date(iso).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Bangkok"});}
function genTicketNo():string{const y=new Date().getFullYear()+543;const r=Math.floor(Math.random()*9000)+1000;return`REP-${y}-${r}`;}

const CATEGORIES=[
  {key:"computer",  label:"คอมพิวเตอร์ / IT",      icon:"💻",color:"#3b82f6",bg:"#eff6ff",border:"#bfdbfe"},
  {key:"electrical",label:"ไฟฟ้า / แอร์",           icon:"⚡",color:"#f59e0b",bg:"#fffbeb",border:"#fde68a"},
  {key:"plumbing",  label:"ประปา / ห้องน้ำ",         icon:"🔧",color:"#06b6d4",bg:"#ecfeff",border:"#a5f3fc"},
  {key:"building",  label:"อาคาร / สถานที่",         icon:"🏫",color:"#8b5cf6",bg:"#f5f3ff",border:"#ddd6fe"},
  {key:"furniture", label:"เฟอร์นิเจอร์",            icon:"🪑",color:"#10b981",bg:"#ecfdf5",border:"#a7f3d0"},
  {key:"projector", label:"โปรเจกเตอร์ / จอ",       icon:"📽️",color:"#ec4899",bg:"#fdf2f8",border:"#fbcfe8"},
  {key:"network",   label:"เครือข่าย / อินเทอร์เน็ต",icon:"📡",color:"#14b8a6",bg:"#f0fdfa",border:"#99f6e4"},
  {key:"other",     label:"อื่นๆ",                   icon:"🔨",color:"#6b7280",bg:"#f9fafb",border:"#e5e7eb"},
];

const STATUS_CONFIG:Record<RepairStatus,{label:string;color:string;bg:string;border:string;dot:string}>={
  pending:    {label:"รอดำเนินการ",   color:"#92400e",bg:"#fffbeb",border:"#fcd34d",dot:"#f59e0b"},
  in_progress:{label:"กำลังดำเนินการ",color:"#1e40af",bg:"#eff6ff",border:"#93c5fd",dot:"#3b82f6"},
  completed:  {label:"เสร็จสิ้น",     color:"#065f46",bg:"#ecfdf5",border:"#6ee7b7",dot:"#10b981"},
  cancelled:  {label:"ยกเลิก",        color:"#6b7280",bg:"#f9fafb",border:"#d1d5db",dot:"#9ca3af"},
};

const ADMIN_ROLES=["admin","director","deputy_director","dept_head","staff"];
const NOTIFY_ROLES=["admin","director","deputy_director"]; // roles ที่รับแจ้งเตือนเสมอ

// ── Send notification email ───────────────────────────────────────────────────
async function sendNotificationEmail(req: RepairRequest, building?: Building, reporterEmail?: string) {
  const catLabel = CATEGORIES.find(c=>c.key===req.category)?.label ?? req.category;
  const subject = `[แจ้งซ่อม] ${req.ticket_no} - ${catLabel} - ${building?.name ?? ""} ${req.location}`;
  const body = `
มีการแจ้งซ่อมใหม่เข้ามาในระบบ

เลขที่: ${req.ticket_no}
ประเภท: ${catLabel}
อาคาร: ${building?.name ?? "-"}
สถานที่: ${req.location}
รายละเอียด: ${req.description}
ผู้แจ้ง: ${fullName(req.reporter)}
วันเวลา: ${toThaiDateTime(req.created_at)}

กรุณาเข้าระบบเพื่อดำเนินการ: https://system.khienkhet.ac.th/repair
  `.trim();

  // ส่งผ่าน Supabase Edge Function หรือ API Route
  try {
    await fetch("/api/send-repair-email", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ subject, body, ticketNo: req.ticket_no }),
    });
  } catch(e) {
    console.error("Email send failed:", e);
  }
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({status}:{status:RepairStatus}){
  const cfg=STATUS_CONFIG[status];
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:20,fontSize:13,fontWeight:600,color:cfg.color,background:cfg.bg,border:`1.5px solid ${cfg.border}`}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:cfg.dot,display:"inline-block"}}/>
      {cfg.label}
    </span>
  );
}

// ── BuildingAdmin ─────────────────────────────────────────────────────────────
function BuildingAdmin({allUsers, onClose}:{allUsers:UserProfile[];onClose:()=>void}){
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(()=>{loadBuildings();},[]);

  async function loadBuildings(){
    setLoading(true);
    const {data} = await (supabase.from("buildings") as any)
      .select("*, responsible:users!responsible_user_id(first_name,last_name,email)")
      .order("name");
    setBuildings(data||[]);
    setLoading(false);
  }

  async function addBuilding(){
    if(!newName.trim()) return;
    setSaving(true);
    await (supabase.from("buildings") as any).insert([{name:newName.trim()}]);
    setNewName(""); await loadBuildings(); setSaving(false);
  }

  async function updateResponsible(buildingId:string, userId:string){
    await (supabase.from("buildings") as any)
      .update({responsible_user_id: userId||null}).eq("id",buildingId);
    await loadBuildings();
  }

  async function deleteBuilding(id:string){
    if(!confirm("ลบอาคารนี้?")) return;
    await (supabase.from("buildings") as any).delete().eq("id",id);
    await loadBuildings();
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:24,width:"100%",maxWidth:600,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"20px 24px",borderBottom:"2px solid #f3f4f6",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{margin:0,fontSize:18,fontWeight:700}}>🏫 จัดการอาคาร / ผู้รับผิดชอบ</h3>
          <button onClick={onClose} style={{width:36,height:36,borderRadius:10,border:"2px solid #e5e7eb",background:"white",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:24}}>
          {/* Add new */}
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            <input value={newName} onChange={e=>setNewName(e.target.value)}
              placeholder="ชื่ออาคารใหม่..."
              style={{flex:1,padding:"10px 14px",fontSize:14,borderRadius:12,border:"2px solid #e5e7eb",outline:"none",fontFamily:"inherit"}}
              onKeyDown={e=>e.key==="Enter"&&addBuilding()}/>
            <button onClick={addBuilding} disabled={!newName.trim()||saving}
              style={{padding:"10px 20px",borderRadius:12,border:"none",background:"#3b82f6",color:"white",fontWeight:700,fontSize:14,cursor:"pointer"}}>
              + เพิ่ม
            </button>
          </div>
          {/* List */}
          {loading ? <p style={{color:"#9ca3af",textAlign:"center"}}>กำลังโหลด...</p> : (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {buildings.map(b=>(
                <div key={b.id} style={{background:"#f9fafb",borderRadius:16,padding:"14px 16px",border:"2px solid #f3f4f6"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <span style={{fontWeight:700,fontSize:15,color:"#111827"}}>🏫 {b.name}</span>
                    <button onClick={()=>deleteBuilding(b.id)}
                      style={{padding:"4px 12px",borderRadius:8,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:13,cursor:"pointer"}}>
                      ลบ
                    </button>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:13,color:"#6b7280",fontWeight:600,whiteSpace:"nowrap"}}>👤 ผู้รับผิดชอบ:</span>
                    <select value={b.responsible_user_id??""} onChange={e=>updateResponsible(b.id,e.target.value)}
                      style={{flex:1,fontSize:14,padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontFamily:"inherit",background:"white"}}>
                      <option value="">— ยังไม่ได้กำหนด —</option>
                      {allUsers.map(u=><option key={u.id} value={u.id}>{fullName(u)} ({u.position??u.role})</option>)}
                    </select>
                  </div>
                  {b.responsible && (
                    <p style={{margin:"6px 0 0",fontSize:12,color:"#6b7280"}}>
                      📧 {(b.responsible as any).email ?? "-"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── RepairForm ────────────────────────────────────────────────────────────────
function RepairForm({user, buildings, onSubmit, onCancel}:{
  user:UserProfile; buildings:Building[];
  onSubmit:(data:any)=>Promise<void>; onCancel:()=>void;
}){
  const [category,    setCategory]    = useState("");
  const [buildingId,  setBuildingId]  = useState("");
  const [location,    setLocation]    = useState("");
  const [description, setDescription] = useState("");
  const [photoFiles,  setPhotoFiles]  = useState<File[]>([]);
  const [loading,     setLoading]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canSubmit = category && buildingId && location && description;

  async function handleSubmit(){
    if(!canSubmit) return;
    setLoading(true);
    const photoUrls:string[]=[];
    for(const f of photoFiles){
      const path=`repairs/${Date.now()}_${f.name}`;
      const {data,error}=await supabase.storage.from("school-files").upload(path,f,{upsert:true});
      if(!error&&data){
        const {data:u}=supabase.storage.from("school-files").getPublicUrl(data.path);
        photoUrls.push(u.publicUrl);
      }
    }
    await onSubmit({
      ticket_no:genTicketNo(), reporter_id:user.id,
      category, building_id:buildingId, location, description,
      photo_urls:photoUrls.length>0?photoUrls:null,
      status:"pending", progress_notes:[],
    });
    setLoading(false);
  }

  const selCat=CATEGORIES.find(c=>c.key===category);
  const inputStyle={width:"100%",padding:"12px 16px",fontSize:15,borderRadius:12,border:"2px solid #e5e7eb",outline:"none",boxSizing:"border-box" as const,fontFamily:"inherit"};
  const labelStyle={display:"block" as const,fontSize:14,fontWeight:600 as const,color:"#374151",marginBottom:8};

  return(
    <div style={{maxWidth:700,margin:"0 auto",padding:"0 1rem 3rem"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:28,paddingTop:20}}>
        <button onClick={onCancel} style={{width:42,height:42,borderRadius:12,border:"2px solid #e5e7eb",background:"white",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <div>
          <h2 style={{fontSize:22,fontWeight:700,margin:0,color:"#111827"}}>📝 แจ้งซ่อม</h2>
          <p style={{fontSize:14,color:"#6b7280",margin:0}}>{fullName(user)} · {user.position??user.role}</p>
        </div>
      </div>

      {/* Step 1: Category */}
      <div style={{background:"white",borderRadius:20,border:"1.5px solid #f3f4f6",padding:24,marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <p style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          <span style={{background:"#3b82f6",color:"white",width:24,height:24,borderRadius:"50%",fontSize:12,display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>1</span>
          หมวดหมู่ปัญหา <span style={{color:"#ef4444"}}>*</span>
        </p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
          {CATEGORIES.map(c=>(
            <button key={c.key} type="button" onClick={()=>setCategory(c.key)} style={{
              padding:"12px 8px",borderRadius:14,cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:6,
              fontSize:13,fontWeight:600,textAlign:"center",lineHeight:1.3,
              background:category===c.key?c.bg:"#f9fafb",
              border:`2px solid ${category===c.key?c.color:"#e5e7eb"}`,
              color:category===c.key?c.color:"#6b7280",
              transform:category===c.key?"scale(1.03)":"scale(1)",
              transition:"all 0.15s ease",
            }}>
              <span style={{fontSize:24}}>{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Building + Location */}
      <div style={{background:"white",borderRadius:20,border:"1.5px solid #f3f4f6",padding:24,marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <p style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:18,display:"flex",alignItems:"center",gap:8}}>
          <span style={{background:"#10b981",color:"white",width:24,height:24,borderRadius:"50%",fontSize:12,display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>2</span>
          สถานที่ <span style={{color:"#ef4444"}}>*</span>
        </p>

        {/* Building dropdown */}
        <div style={{marginBottom:16}}>
          <label style={labelStyle}>🏫 อาคาร <span style={{color:"#ef4444"}}>*</span></label>
          <select value={buildingId} onChange={e=>setBuildingId(e.target.value)}
            style={{...inputStyle,appearance:"auto",cursor:"pointer"}}>
            <option value="">— เลือกอาคาร —</option>
            {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Location detail */}
        <div>
          <label style={labelStyle}>📍 ห้อง / จุดที่แจ้งซ่อม <span style={{color:"#ef4444"}}>*</span></label>
          <input type="text" value={location} onChange={e=>setLocation(e.target.value)}
            placeholder="เช่น ห้อง 214, ห้องน้ำชาย ชั้น 1, หน้าห้องธุรการ"
            style={inputStyle}/>
        </div>
      </div>

      {/* Step 3: Description */}
      <div style={{background:"white",borderRadius:20,border:"1.5px solid #f3f4f6",padding:24,marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <p style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:18,display:"flex",alignItems:"center",gap:8}}>
          <span style={{background:"#8b5cf6",color:"white",width:24,height:24,borderRadius:"50%",fontSize:12,display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>3</span>
          รายละเอียดปัญหา <span style={{color:"#ef4444"}}>*</span>
        </p>
        <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={5}
          placeholder="อธิบายอาการเสียหาย หรือสิ่งที่ต้องการให้ซ่อม..."
          style={{...inputStyle,resize:"vertical",lineHeight:1.7}}/>
      </div>

      {/* Step 4: Photo */}
      <div style={{background:"white",borderRadius:20,border:"1.5px solid #f3f4f6",padding:24,marginBottom:24,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <p style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          <span style={{background:"#f59e0b",color:"white",width:24,height:24,borderRadius:"50%",fontSize:12,display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>4</span>
          แนบรูปภาพ (ไม่บังคับ)
        </p>
        <button type="button" onClick={()=>fileRef.current?.click()} style={{
          width:"100%",padding:20,borderRadius:14,border:"2.5px dashed #d1d5db",
          background:"#f9fafb",cursor:"pointer",fontSize:14,color:"#6b7280",fontWeight:500,
        }}>📸 คลิกเพื่อเลือกรูป (JPG, PNG)</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}}
          onChange={e=>setPhotoFiles(prev=>[...prev,...Array.from(e.target.files??[])])}/>
        {photoFiles.length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12}}>
            {photoFiles.map((f,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:10,background:"#eff6ff",border:"1.5px solid #bfdbfe",fontSize:13,color:"#1e40af"}}>
                📎 <span style={{maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                <button type="button" onClick={()=>setPhotoFiles(p=>p.filter((_,idx)=>idx!==i))} style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:16,lineHeight:1,padding:0}}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview summary */}
      {canSubmit&&(
        <div style={{background:"#f0fdf4",border:"2px solid #86efac",borderRadius:20,padding:20,marginBottom:20}}>
          <p style={{fontWeight:700,fontSize:14,color:"#166534",marginBottom:10}}>✅ สรุปรายการแจ้งซ่อม</p>
          <div style={{fontSize:14,color:"#374151",lineHeight:2}}>
            <div>🔧 ประเภท: <strong>{CATEGORIES.find(c=>c.key===category)?.label}</strong></div>
            <div>🏫 อาคาร: <strong>{buildings.find(b=>b.id===buildingId)?.name}</strong></div>
            <div>📍 สถานที่: <strong>{location}</strong></div>
            <div>📋 รายละเอียด: <strong>{description}</strong></div>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div style={{display:"flex",gap:12}}>
        <button type="button" onClick={onCancel} style={{flex:1,padding:"14px",borderRadius:14,border:"2px solid #e5e7eb",background:"white",fontSize:15,fontWeight:600,cursor:"pointer",color:"#374151"}}>
          ยกเลิก
        </button>
        <button type="button" onClick={handleSubmit} disabled={!canSubmit||loading} style={{
          flex:2,padding:"14px",borderRadius:14,border:"none",fontSize:15,fontWeight:700,
          cursor:canSubmit&&!loading?"pointer":"not-allowed",
          background:canSubmit&&!loading?"linear-gradient(135deg,#3b82f6,#6366f1)":"#e5e7eb",
          color:canSubmit&&!loading?"white":"#9ca3af",
          boxShadow:canSubmit&&!loading?"0 4px 14px rgba(99,102,241,0.4)":"none",
        }}>
          {loading?"⏳ กำลังส่ง...":"📤 ส่งคำขอแจ้งซ่อม"}
        </button>
      </div>
    </div>
  );
}

// ── RepairCard ────────────────────────────────────────────────────────────────
function RepairCard({req, currentUser, staff, onUpdate}:{
  req:RepairRequest; currentUser:UserProfile; staff:UserProfile[]; onUpdate:()=>void;
}){
  const [expanded,   setExpanded]   = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteText,   setNoteText]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const isAdmin   = ADMIN_ROLES.includes(currentUser.role);
  const isOwner   = req.reporter_id===currentUser.id;
  const isAssignee= req.assigned_to===currentUser.id;
  const cat = CATEGORIES.find(c=>c.key===req.category)??CATEGORIES[7];

  async function updateStatus(status:RepairStatus){
    setLoading(true);
    const upd:any={status,updated_at:new Date().toISOString()};
    if(status==="completed") upd.completed_at=new Date().toISOString();
    await (supabase.from("repair_requests") as any).update(upd).eq("id",req.id);
    setLoading(false); onUpdate();
  }
  async function assignTo(userId:string){
    setLoading(true);
    await (supabase.from("repair_requests") as any).update({
      assigned_to:userId||null,
      assigned_at:userId?new Date().toISOString():null,
      status:userId?"in_progress":"pending",
      updated_at:new Date().toISOString(),
    }).eq("id",req.id);
    setLoading(false); onUpdate();
  }
  async function addNote(){
    if(!noteText.trim()) return;
    setLoading(true);
    const notes=[...(req.progress_notes??[]),{note:noteText.trim(),by:fullName(currentUser),at:new Date().toISOString()}];
    await (supabase.from("repair_requests") as any).update({progress_notes:notes,updated_at:new Date().toISOString()}).eq("id",req.id);
    setNoteText(""); setAddingNote(false); setLoading(false); onUpdate();
  }
  async function cancelRequest(){
    if(!confirm("ยืนยันการยกเลิก?")) return;
    setLoading(true);
    await (supabase.from("repair_requests") as any).update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",req.id);
    setLoading(false); onUpdate();
  }

  return(
    <div style={{background:"white",borderRadius:20,overflow:"hidden",border:`2px solid ${expanded?cat.border:"#f3f4f6"}`,boxShadow:expanded?`0 4px 20px ${cat.color}20`:"0 2px 8px rgba(0,0,0,0.05)",opacity:req.status==="cancelled"?0.65:1,transition:"all 0.2s ease"}}>
      <div style={{height:4,background:`linear-gradient(90deg,${cat.color},${cat.color}88)`}}/>
      {/* Header */}
      <div style={{padding:"16px 20px",display:"flex",alignItems:"flex-start",gap:14,cursor:"pointer"}} onClick={()=>setExpanded(e=>!e)}>
        <div style={{width:48,height:48,borderRadius:14,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:cat.bg,border:`1.5px solid ${cat.border}`,fontSize:22}}>{cat.icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
            <span style={{fontSize:12,color:"#9ca3af",fontWeight:600,fontFamily:"monospace"}}>{req.ticket_no}</span>
            <StatusBadge status={req.status}/>
            {req.building&&<span style={{fontSize:12,background:"#f3f4f6",color:"#374151",padding:"2px 10px",borderRadius:10,fontWeight:600}}>🏫 {req.building.name}</span>}
          </div>
          <p style={{fontSize:16,fontWeight:700,margin:"0 0 3px",color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {cat.label} — {req.location}
          </p>
          <p style={{fontSize:14,color:"#6b7280",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req.description}</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          <span style={{fontSize:12,color:"#9ca3af"}}>{toThaiDate(req.created_at)}</span>
          <span style={{fontSize:18,color:"#9ca3af"}}>{expanded?"▲":"▼"}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded&&(
        <div style={{borderTop:`2px solid ${cat.border}`,padding:"18px 20px",background:cat.bg}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 20px",marginBottom:16,fontSize:14}}>
            <div><span style={{color:"#6b7280"}}>👤 ผู้แจ้ง: </span><strong>{fullName(req.reporter)}</strong></div>
            <div><span style={{color:"#6b7280"}}>🕐 แจ้งเมื่อ: </span><strong>{toThaiDateTime(req.created_at)}</strong></div>
            {req.building&&<div><span style={{color:"#6b7280"}}>🏫 อาคาร: </span><strong>{req.building.name}</strong></div>}
            {req.assigned_to&&<div><span style={{color:"#6b7280"}}>🔧 ช่างที่รับงาน: </span><strong>{fullName(req.assignee)}</strong></div>}
            {req.completed_at&&<div><span style={{color:"#6b7280"}}>✅ เสร็จเมื่อ: </span><strong>{toThaiDateTime(req.completed_at)}</strong></div>}
          </div>
          <div style={{padding:"14px 16px",background:"white",borderRadius:14,fontSize:15,marginBottom:16,lineHeight:1.7,color:"#374151",border:`1.5px solid ${cat.border}`}}>{req.description}</div>
          {req.photo_urls&&req.photo_urls.length>0&&(
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
              {req.photo_urls.map((url,i)=>(
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="" style={{width:90,height:90,objectFit:"cover",borderRadius:12,border:`2px solid ${cat.border}`}}/>
                </a>
              ))}
            </div>
          )}
          {req.progress_notes&&req.progress_notes.length>0&&(
            <div style={{marginBottom:16}}>
              <p style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:10}}>📝 บันทึกความคืบหน้า</p>
              {req.progress_notes.map((n,i)=>(
                <div key={i} style={{padding:"10px 14px",borderRadius:12,background:"white",fontSize:14,borderLeft:`4px solid ${cat.color}`,marginBottom:6}}>
                  <p style={{margin:"0 0 4px",color:"#111827"}}>{n.note}</p>
                  <p style={{margin:0,fontSize:12,color:"#9ca3af"}}>{n.by} · {toThaiDateTime(n.at)}</p>
                </div>
              ))}
            </div>
          )}
          {(isAdmin||isAssignee)&&req.status!=="completed"&&req.status!=="cancelled"&&(
            <div style={{marginBottom:14}}>
              {!addingNote?(
                <button type="button" onClick={()=>setAddingNote(true)} style={{fontSize:14,padding:"8px 16px",borderRadius:10,border:`1.5px dashed ${cat.color}`,background:"white",cursor:"pointer",color:cat.color,fontWeight:600}}>+ เพิ่มบันทึกความคืบหน้า</button>
              ):(
                <div style={{display:"flex",gap:8}}>
                  <input type="text" value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="บันทึก..." autoFocus
                    style={{flex:1,padding:"10px 14px",fontSize:14,borderRadius:10,border:`2px solid ${cat.color}`,outline:"none",fontFamily:"inherit"}}
                    onKeyDown={e=>e.key==="Enter"&&addNote()}/>
                  <button type="button" onClick={addNote} disabled={!noteText.trim()||loading}
                    style={{padding:"10px 16px",borderRadius:10,border:"none",background:cat.color,color:"white",fontWeight:700,cursor:"pointer",fontSize:14}}>บันทึก</button>
                  <button type="button" onClick={()=>{setAddingNote(false);setNoteText("");}}
                    style={{padding:"10px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",background:"white",cursor:"pointer",fontSize:14}}>ยกเลิก</button>
                </div>
              )}
            </div>
          )}
          {isAdmin&&req.status!=="cancelled"&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
              {(req.status==="pending"||req.status==="in_progress")&&(
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,color:"#374151",fontWeight:600}}>มอบหมาย:</span>
                  <select value={req.assigned_to??""} onChange={e=>assignTo(e.target.value)}
                    style={{fontSize:14,padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontFamily:"inherit"}}>
                    <option value="">— ยังไม่ได้มอบหมาย —</option>
                    {staff.map(s=><option key={s.id} value={s.id}>{fullName(s)}</option>)}
                  </select>
                </div>
              )}
              {req.status==="in_progress"&&(
                <button type="button" disabled={loading} onClick={()=>updateStatus("completed")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"white",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:"0 3px 10px rgba(16,185,129,0.4)"}}>✅ ปิดงาน — เสร็จสิ้น</button>
              )}
            </div>
          )}
          {isOwner&&req.status==="pending"&&(
            <div style={{marginTop:12}}>
              <button type="button" onClick={cancelRequest} disabled={loading} style={{padding:"10px 18px",borderRadius:10,border:"2px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontWeight:600,fontSize:14,cursor:"pointer"}}>🗑️ ยกเลิกคำขอ</button>
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
export default function RepairPage(){
  const router = useRouter();
  const [user,         setUser]         = useState<UserProfile|null>(null);
  const [requests,     setRequests]     = useState<RepairRequest[]>([]);
  const [buildings,    setBuildings]    = useState<Building[]>([]);
  const [staff,        setStaff]        = useState<UserProfile[]>([]);
  const [allUsers,     setAllUsers]     = useState<UserProfile[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [showBuildingAdmin, setShowBuildingAdmin] = useState(false);
  const [filterStatus, setFilterStatus] = useState<RepairStatus|"all">("all");
  const [filterCat,    setFilterCat]    = useState("all");
  const [search,       setSearch]       = useState("");

  useEffect(()=>{
    const init=async()=>{
      const {data:{user:au}}=await supabase.auth.getUser();
      if(!au){setLoading(false);return;}
      const meta=au.user_metadata??{};
      const claims=meta.custom_claims??{};
      const email=au.email||meta.email||meta.preferred_username||meta.upn||claims.email||"";
      let data:any=null;
      const byId=await supabase.from("users").select("id,first_name,last_name,email,role,position").eq("auth_id",au.id).maybeSingle();
      if(byId.data){data=byId.data;}
      else if(email){
        const byEmail=await supabase.from("users").select("id,first_name,last_name,email,role,position").eq("email",email).maybeSingle();
        data=byEmail.data;
        if(data) await (supabase.from("users") as any).update({auth_id:au.id}).eq("id",data.id);
      }
      if(data){
        setUser(data as UserProfile);
        const {data:sd}=await supabase.from("users").select("id,first_name,last_name,email,role,position").in("role",ADMIN_ROLES);
        setStaff((sd as UserProfile[])||[]);
        const {data:ud}=await supabase.from("users").select("id,first_name,last_name,email,role,position").order("first_name");
        setAllUsers((ud as UserProfile[])||[]);
      }
      // load buildings
      const {data:bd}=await (supabase.from("buildings") as any)
        .select("*, responsible:users!responsible_user_id(first_name,last_name,email)")
        .order("name");
      setBuildings(bd||[]);
      setLoading(false);
    };
    init();
  },[]);

  const loadRequests=useCallback(async()=>{
    if(!user) return;
    const isAdm=ADMIN_ROLES.includes(user.role);
    let query=(supabase.from("repair_requests") as any)
      .select("*, reporter:users!reporter_id(first_name,last_name,position,email), assignee:users!assigned_to(first_name,last_name), building:buildings!building_id(id,name,responsible_user_id,responsible:users!responsible_user_id(first_name,last_name,email))")
      .order("created_at",{ascending:false});
    if(!isAdm) query=query.eq("reporter_id",user.id);
    const {data}=await query;
    setRequests((data as RepairRequest[])||[]);
  },[user]);

  useEffect(()=>{if(user) loadRequests();},[user,loadRequests]);

  async function submitRepair(payload:any){
    const {data,error}=await (supabase.from("repair_requests") as any).insert([payload]).select("*, reporter:users!reporter_id(first_name,last_name,email), building:buildings!building_id(id,name,responsible_user_id,responsible:users!responsible_user_id(first_name,last_name,email))").single();
    if(error){alert("❌ "+error.message);return;}
    
    // ส่งเมล
    await sendNotificationEmail(data, data.building, data.reporter?.email);
    
    alert("✅ ส่งคำขอแจ้งซ่อมเรียบร้อยแล้ว\n📧 ระบบส่งการแจ้งเตือนไปยังผู้รับผิดชอบแล้ว");
    setShowForm(false);
    await loadRequests();
  }

  const isAdm=user?ADMIN_ROLES.includes(user.role):false;
  const filtered=requests.filter(r=>{
    const inSt=filterStatus==="all"||r.status===filterStatus;
    const inCat=filterCat==="all"||r.category===filterCat;
    const inSr=!search||r.ticket_no.toLowerCase().includes(search.toLowerCase())||r.location.toLowerCase().includes(search.toLowerCase())||r.description.toLowerCase().includes(search.toLowerCase());
    return inSt&&inCat&&inSr;
  });
  const stats={
    pending:requests.filter(r=>r.status==="pending").length,
    in_progress:requests.filter(r=>r.status==="in_progress").length,
    completed:requests.filter(r=>r.status==="completed").length,
  };

  if(loading) return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f9fafb"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>🔧</div><p style={{color:"#6b7280",fontSize:16}}>กำลังโหลด...</p></div>
    </div>
  );
  if(!user) return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <p style={{color:"#ef4444",fontSize:16,fontWeight:600}}>❌ กรุณาเข้าสู่ระบบก่อน</p>
    </div>
  );
  if(showForm) return(
    <div style={{minHeight:"100vh",background:"#f9fafb"}}>
      <RepairForm user={user} buildings={buildings} onSubmit={submitRepair} onCancel={()=>setShowForm(false)}/>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"#f9fafb",fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
      {showBuildingAdmin&&<BuildingAdmin allUsers={allUsers} onClose={()=>{setShowBuildingAdmin(false);}}/>}

      {/* Top bar */}
      <div style={{position:"sticky",top:0,zIndex:40,background:"white",borderBottom:"2px solid #f3f4f6",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>router.push("/dashboard")} style={{width:40,height:40,borderRadius:12,border:"2px solid #e5e7eb",background:"white",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}} title="กลับหน้าหลัก">🏠</button>
          <div>
            <h1 style={{fontSize:18,fontWeight:700,margin:0,color:"#111827"}}>🔧 แจ้งซ่อม (Helpdesk)</h1>
            <p style={{fontSize:12,color:"#9ca3af",margin:0}}>โรงเรียนวัดเขียนเขต</p>
          </div>
        </div>
        <div style={{display:"flex",gap:10}}>
          {isAdm&&(
            <button onClick={()=>setShowBuildingAdmin(true)} style={{padding:"10px 16px",borderRadius:14,border:"2px solid #e5e7eb",background:"white",color:"#374151",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              🏫 จัดการอาคาร
            </button>
          )}
          <button type="button" onClick={()=>setShowForm(true)} style={{padding:"10px 20px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:"0 4px 14px rgba(99,102,241,0.4)",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>➕</span> แจ้งซ่อม
          </button>
        </div>
      </div>

      <div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}>
        {/* Stats */}
        {isAdm&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
            {[
              {key:"pending",    label:"รอดำเนินการ",   val:stats.pending,    emoji:"⏳",color:"#f59e0b",bg:"#fffbeb",border:"#fcd34d"},
              {key:"in_progress",label:"กำลังดำเนินการ",val:stats.in_progress,emoji:"⚙️",color:"#3b82f6",bg:"#eff6ff",border:"#93c5fd"},
              {key:"completed",  label:"เสร็จสิ้น",     val:stats.completed,  emoji:"✅",color:"#10b981",bg:"#ecfdf5",border:"#6ee7b7"},
            ].map(s=>(
              <div key={s.key} onClick={()=>setFilterStatus(filterStatus===s.key?"all":s.key as RepairStatus)}
                style={{padding:"18px 16px",borderRadius:20,cursor:"pointer",background:filterStatus===s.key?s.bg:"white",border:`2px solid ${filterStatus===s.key?s.color:"#f3f4f6"}`,boxShadow:filterStatus===s.key?`0 4px 16px ${s.color}30`:"0 2px 8px rgba(0,0,0,0.04)",transition:"all 0.2s ease"}}>
                <p style={{fontSize:13,color:"#6b7280",margin:"0 0 8px",fontWeight:600,display:"flex",alignItems:"center",gap:6}}><span>{s.emoji}</span>{s.label}</p>
                <p style={{fontSize:32,fontWeight:800,margin:0,color:filterStatus===s.key?s.color:"#111827"}}>{s.val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
          <div style={{flex:1,minWidth:200,position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:16}}>🔍</span>
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหา ticket / สถานที่..."
              style={{width:"100%",paddingLeft:44,paddingRight:16,paddingTop:12,paddingBottom:12,fontSize:14,borderRadius:14,border:"2px solid #e5e7eb",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
            style={{fontSize:14,padding:"12px 16px",borderRadius:14,border:"2px solid #e5e7eb",fontFamily:"inherit",background:"white"}}>
            <option value="all">📦 ทุกหมวดหมู่</option>
            {CATEGORIES.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value as any)}
            style={{fontSize:14,padding:"12px 16px",borderRadius:14,border:"2px solid #e5e7eb",fontFamily:"inherit",background:"white"}}>
            <option value="all">📋 ทุกสถานะ</option>
            {Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* List */}
        {filtered.length===0?(
          <div style={{textAlign:"center",padding:"4rem 2rem",background:"white",borderRadius:24,border:"2px dashed #e5e7eb"}}>
            <div style={{fontSize:56,marginBottom:16}}>🔧</div>
            <p style={{color:"#374151",fontSize:18,fontWeight:700,margin:"0 0 8px"}}>{requests.length===0?"ยังไม่มีรายการแจ้งซ่อม":"ไม่พบรายการที่ตรงกับการค้นหา"}</p>
            {requests.length===0&&(
              <>
                <p style={{color:"#9ca3af",fontSize:14,marginBottom:20}}>เริ่มแจ้งซ่อมรายการแรกของคุณได้เลย</p>
                <button type="button" onClick={()=>setShowForm(true)} style={{padding:"12px 28px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:"0 4px 14px rgba(99,102,241,0.4)"}}>➕ แจ้งซ่อมรายการแรก</button>
              </>
            )}
          </div>
        ):(
          <div>
            <p style={{fontSize:13,color:"#9ca3af",marginBottom:12,fontWeight:500}}>แสดง {filtered.length} รายการ</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {filtered.map(r=><RepairCard key={r.id} req={r} currentUser={user} staff={staff} onUpdate={loadRequests}/>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}