"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type RepairStatus = "pending"|"in_progress"|"completed"|"cancelled";

interface Building {
  id: string; name: string;
  repair_user_ids?: string[];
  inspector_user_ids?: string[];
  repairUsers?: { id:string; first_name:string; last_name:string; email?:string }[];
  inspectorUsers?: { id:string; first_name:string; last_name:string; email?:string }[];
}
interface RepairRequest {
  id: string; ticket_no: string; reporter_id: string; category: string;
  building_id?: string; location: string; description: string;
  photo_urls: string[]|null; status: RepairStatus;
  assigned_to: string|null; assigned_at: string|null;
  progress_notes: {note:string;by:string;at:string}[]|null;
  completed_at: string|null; created_at: string; updated_at: string;
  reporter?: {first_name:string;last_name:string;position?:string;email?:string};
  assignee?: {first_name:string;last_name:string};
  building?: Building;
}
interface UserProfile {
  id:string; first_name:string; last_name:string; email:string; role:string; position?:string; title?:string;
}

function fullName(u:any){
  if(!u)return"-";
  const fn=u.first_name??""; const ln=u.last_name??"";
  if(!fn&&!ln)return"-";
  return `${fn} ${ln}`.trim();
}
function toThaiDateTime(iso:string){return new Date(iso).toLocaleString("th-TH",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Bangkok"});}
function toThaiDate(iso:string){return new Date(iso).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Bangkok"});}
function genTicketNo(){const y=new Date().getFullYear()+543;const r=Math.floor(Math.random()*9000)+1000;return`REP-${y}-${r}`;}

const CATEGORIES=[
  {key:"computer",  label:"คอมพิวเตอร์ / IT",       icon:"💻",color:"#3b82f6",bg:"#eff6ff",border:"#bfdbfe"},
  {key:"electrical",label:"ไฟฟ้า / แอร์",            icon:"⚡",color:"#f59e0b",bg:"#fffbeb",border:"#fde68a"},
  {key:"plumbing",  label:"ประปา / ห้องน้ำ",          icon:"🔧",color:"#06b6d4",bg:"#ecfeff",border:"#a5f3fc"},
  {key:"building",  label:"อาคาร / สถานที่",          icon:"🏫",color:"#8b5cf6",bg:"#f5f3ff",border:"#ddd6fe"},
  {key:"furniture", label:"เฟอร์นิเจอร์",             icon:"🪑",color:"#10b981",bg:"#ecfdf5",border:"#a7f3d0"},
  {key:"projector", label:"โปรเจกเตอร์ / จอ",        icon:"📽️",color:"#ec4899",bg:"#fdf2f8",border:"#fbcfe8"},
  {key:"network",   label:"เครือข่าย / อินเทอร์เน็ต", icon:"📡",color:"#14b8a6",bg:"#f0fdfa",border:"#99f6e4"},
  {key:"other",     label:"อื่นๆ",                    icon:"🔨",color:"#6b7280",bg:"#f9fafb",border:"#e5e7eb"},
];

// อีเมลพิเศษตามประเภท
const CATEGORY_SPECIAL_EMAILS: Record<string, string[]> = {
  network:  ["sirilack@khienkhet.ac.th"],
  computer: ["saruda@khienkhet.ac.th"],
};
const COMPLETED_NOTIFY_EMAIL = "general@khienkhet.ac.th";

const STATUS_CONFIG:Record<RepairStatus,{label:string;color:string;bg:string;border:string;dot:string}>={
  pending:    {label:"รอดำเนินการ",    color:"#92400e",bg:"#fffbeb",border:"#fcd34d",dot:"#f59e0b"},
  in_progress:{label:"กำลังดำเนินการ",color:"#1e40af",bg:"#eff6ff",border:"#93c5fd",dot:"#3b82f6"},
  completed:  {label:"เสร็จสิ้น",     color:"#065f46",bg:"#ecfdf5",border:"#6ee7b7",dot:"#10b981"},
  cancelled:  {label:"ยกเลิก",        color:"#6b7280",bg:"#f9fafb",border:"#d1d5db",dot:"#9ca3af"},
};

const ADMIN_ROLES      = ["admin","director","deputy_director","dept_head","staff"];
const SUPER_ADMIN_ROLES = ["admin","director"];

async function uploadToOneDrive(file:File,ticketNo:string):Promise<string|null>{
  try{
    const fd=new FormData();fd.append("file",file);fd.append("folder",`WKK_Repair_System/${ticketNo}`);fd.append("fileName",`${Date.now()}_${file.name}`);
    const res=await fetch("/api/upload-onedrive",{method:"POST",body:fd});if(!res.ok)return null;
    const {url}=await res.json();return url??null;
  }catch{return null;}
}

async function sendRepairNotification(req:RepairRequest,building?:Building,extraEmails:string[]=[],isCompleted=false){
  const catLabel=CATEGORIES.find(c=>c.key===req.category)?.label??req.category;
  const subject=isCompleted
    ?`[ซ่อมเสร็จ] ${req.ticket_no} - ${catLabel} - ${building?.name??""} ${req.location}`
    :`[แจ้งซ่อม] ${req.ticket_no} - ${catLabel} - ${building?.name??""} ${req.location}`;
  const body=`${isCompleted?"✅ งานซ่อมเสร็จสิ้นแล้ว":"มีการแจ้งซ่อมใหม่"}\nเลขที่: ${req.ticket_no}\nประเภท: ${catLabel}\nอาคาร: ${building?.name??"-"}\nสถานที่: ${req.location}\nรายละเอียด: ${req.description}\nผู้แจ้ง: ${fullName(req.reporter)}\n\nhttps://system.khienkhet.ac.th/repair`;
  try{await fetch("/api/send-repair-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject,body,ticketNo:req.ticket_no,extraEmails,isCompleted})});}catch(e){console.error(e);}
}

function StatusBadge({status}:{status:RepairStatus}){
  const cfg=STATUS_CONFIG[status];
  return(<span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:20,fontSize:13,fontWeight:600,color:cfg.color,background:cfg.bg,border:`1.5px solid ${cfg.border}`}}><span style={{width:7,height:7,borderRadius:"50%",background:cfg.dot,display:"inline-block"}}/>{cfg.label}</span>);
}

// ── BuildingAdmin — Dropdown แทนปุ่ม ─────────────────────────────────────────
function BuildingAdmin({allUsers,onClose}:{allUsers:UserProfile[];onClose:()=>void}){
  const [buildings,setBuildings]=useState<Building[]>([]);
  const [loading,setLoading]=useState(true);
  const [newName,setNewName]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{load();},[]);
  async function load(){
    setLoading(true);
    const {data}=await (supabase.from("buildings") as any).select("id,name,repair_user_ids,inspector_user_ids").order("name");
    setBuildings(data||[]);setLoading(false);
  }
  async function addBuilding(){
    if(!newName.trim())return;setSaving(true);
    await (supabase.from("buildings") as any).insert([{name:newName.trim(),repair_user_ids:[],inspector_user_ids:[]}]);
    setNewName("");await load();setSaving(false);
  }
  async function addUser(b:Building,field:"repair_user_ids"|"inspector_user_ids",uid:string){
    if(!uid)return;
    const cur=(b[field] as string[])||[];
    if(cur.includes(uid))return;
    await (supabase.from("buildings") as any).update({[field]:[...cur,uid]}).eq("id",b.id);await load();
  }
  async function removeUser(b:Building,field:"repair_user_ids"|"inspector_user_ids",uid:string){
    const cur=(b[field] as string[])||[];
    await (supabase.from("buildings") as any).update({[field]:cur.filter(x=>x!==uid)}).eq("id",b.id);await load();
  }
  async function del(id:string){if(!confirm("ลบอาคารนี้?"))return;await (supabase.from("buildings") as any).delete().eq("id",id);await load();}

  const uMap=Object.fromEntries(allUsers.map(u=>[u.id,u]));

  function UserTags({b,field,color}:{b:Building;field:"repair_user_ids"|"inspector_user_ids";color:string}){
    const ids=(b[field] as string[])||[];
    const remaining=allUsers.filter(u=>!ids.includes(u.id));
    return(
      <div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
          {ids.map(uid=>uMap[uid]&&(
            <span key={uid} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,background:color+"22",border:`1.5px solid ${color}`,fontSize:13,color}}>
              {fullName(uMap[uid])}
              <button onClick={()=>removeUser(b,field,uid)} style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:15,lineHeight:1,padding:0}}>×</button>
            </span>
          ))}
          {ids.length===0&&<span style={{fontSize:13,color:"#9ca3af"}}>ยังไม่ได้เลือก</span>}
        </div>
        {remaining.length>0&&(
          <select defaultValue="" onChange={e=>{addUser(b,field,e.target.value);e.target.value=""}}
            style={{fontSize:14,padding:"8px 12px",borderRadius:10,border:`2px solid ${color}44`,fontFamily:"inherit",background:"white",color:"#374151",cursor:"pointer"}}>
            <option value="">+ เพิ่มครู...</option>
            {remaining.map(u=><option key={u.id} value={u.id}>{fullName(u)}</option>)}
          </select>
        )}
      </div>
    );
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:24,width:"100%",maxWidth:640,maxHeight:"88vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"20px 24px",borderBottom:"2px solid #f3f4f6",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{margin:0,fontSize:18,fontWeight:700}}>🏫 จัดการอาคาร</h3>
          <button onClick={onClose} style={{width:36,height:36,borderRadius:10,border:"2px solid #e5e7eb",background:"white",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:24}}>
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="ชื่ออาคารใหม่..."
              style={{flex:1,padding:"10px 14px",fontSize:14,borderRadius:12,border:"2px solid #e5e7eb",outline:"none",fontFamily:"inherit"}}
              onKeyDown={e=>e.key==="Enter"&&addBuilding()}/>
            <button onClick={addBuilding} disabled={!newName.trim()||saving}
              style={{padding:"10px 20px",borderRadius:12,border:"none",background:"#3b82f6",color:"white",fontWeight:700,fontSize:14,cursor:"pointer"}}>+ เพิ่ม</button>
          </div>
          {loading?<p style={{color:"#9ca3af",textAlign:"center"}}>กำลังโหลด...</p>:(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {buildings.map(b=>(
                <div key={b.id} style={{background:"#f9fafb",borderRadius:16,padding:"16px 18px",border:"2px solid #f3f4f6"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                    <span style={{fontWeight:700,fontSize:15,color:"#111827"}}>🏫 {b.name}</span>
                    <button onClick={()=>del(b.id)} style={{padding:"4px 12px",borderRadius:8,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:13,cursor:"pointer"}}>ลบ</button>
                  </div>
                  <p style={{fontSize:13,fontWeight:700,color:"#1e40af",margin:"0 0 8px"}}>🔧 ผู้ดูแลซ่อม</p>
                  <UserTags b={b} field="repair_user_ids" color="#3b82f6"/>
                  <p style={{fontSize:13,fontWeight:700,color:"#065f46",margin:"14px 0 8px"}}>📋 ผู้ตรวจสอบประจำเดือน</p>
                  <UserTags b={b} field="inspector_user_ids" color="#10b981"/>
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
function RepairForm({user,buildings,onSubmit,onCancel}:{
  user:UserProfile;buildings:Building[];onSubmit:(d:any)=>Promise<void>;onCancel:()=>void;
}){
  const [category,setCategory]=useState("");
  const [buildingId,setBuildingId]=useState("");
  const [location,setLocation]=useState("");
  const [description,setDescription]=useState("");
  const [photoFiles,setPhotoFiles]=useState<File[]>([]);
  const [loading,setLoading]=useState(false);
  const [touched,setTouched]=useState(false); // สำหรับแสดงกรอบแดง
  const fileRef=useRef<HTMLInputElement>(null);
  const canSubmit=category&&buildingId&&location&&description;
  const selBuilding=buildings.find(b=>b.id===buildingId);

  async function handleSubmit(){
    setTouched(true);
    if(!canSubmit)return;
    setLoading(true);
    const ticketNo=genTicketNo();
    const photoUrls:string[]=[];
    for(const f of photoFiles){const url=await uploadToOneDrive(f,ticketNo);if(url)photoUrls.push(url);}
    await onSubmit({ticket_no:ticketNo,reporter_id:user.id,category,building_id:buildingId,location,description,photo_urls:photoUrls.length>0?photoUrls:null,status:"pending",progress_notes:[]});
    setLoading(false);
  }

  // Input styles
  function inp(hasErr:boolean){return{width:"100%",padding:"12px 16px",fontSize:15,borderRadius:12,border:`2px solid ${hasErr?"#ef4444":"#93c5fd"}`,background:"white",outline:"none",boxSizing:"border-box" as const,fontFamily:"inherit",transition:"border-color 0.15s"};}
  const lbl={display:"block" as const,fontSize:14,fontWeight:600 as const,color:"#374151",marginBottom:8};
  const step=(n:number,c:string)=>(<span style={{background:c,color:"white",width:24,height:24,borderRadius:"50%",fontSize:12,display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:700,flexShrink:0}}>{n}</span>);
  const errMsg=(msg:string)=>(<p style={{fontSize:12,color:"#ef4444",margin:"4px 0 0",fontWeight:600}}>⚠️ {msg}</p>);

  return(
    <div style={{maxWidth:720,margin:"0 auto",padding:"0 1rem 3rem"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:28,paddingTop:20}}>
        <button onClick={onCancel} style={{width:42,height:42,borderRadius:12,border:"2px solid #e5e7eb",background:"white",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <div><h2 style={{fontSize:22,fontWeight:700,margin:0}}>📝 แจ้งซ่อม</h2><p style={{fontSize:14,color:"#6b7280",margin:0}}>{fullName(user)}</p></div>
      </div>

      {/* 1: Category */}
      <div style={{background:"white",borderRadius:20,border:`2px solid ${touched&&!category?"#ef4444":"#f3f4f6"}`,padding:24,marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <p style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>{step(1,"#3b82f6")} หมวดหมู่ <span style={{color:"#ef4444"}}>*</span></p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
          {CATEGORIES.map(c=>(
            <button key={c.key} type="button" onClick={()=>setCategory(c.key)} style={{padding:"12px 8px",borderRadius:14,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontSize:13,fontWeight:600,textAlign:"center",lineHeight:1.3,background:category===c.key?c.bg:"#f9fafb",border:`2px solid ${category===c.key?c.color:"#e5e7eb"}`,color:category===c.key?c.color:"#6b7280",transform:category===c.key?"scale(1.03)":"scale(1)",transition:"all 0.15s"}}>
              <span style={{fontSize:24}}>{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
        {touched&&!category&&errMsg("กรุณาเลือกหมวดหมู่")}
        {/* แจ้งอีเมลพิเศษ */}
        {category&&CATEGORY_SPECIAL_EMAILS[category]&&(
          <div style={{marginTop:12,padding:"8px 14px",background:"#fef3c7",borderRadius:10,border:"1.5px solid #fcd34d",fontSize:13,color:"#92400e"}}>
            📧 ระบบจะแจ้ง: <strong>{CATEGORY_SPECIAL_EMAILS[category].join(", ")}</strong>
          </div>
        )}
      </div>

      {/* 2: Building + Location */}
      <div style={{background:"white",borderRadius:20,border:"1.5px solid #f3f4f6",padding:24,marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <p style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:18,display:"flex",alignItems:"center",gap:8}}>{step(2,"#10b981")} สถานที่ <span style={{color:"#ef4444"}}>*</span></p>
        <div style={{marginBottom:16}}>
          <label style={lbl}>🏫 อาคาร <span style={{color:"#ef4444"}}>*</span></label>
          <select value={buildingId} onChange={e=>setBuildingId(e.target.value)}
            style={{...inp(touched&&!buildingId),appearance:"auto",cursor:"pointer"}}>
            <option value="">— เลือกอาคาร —</option>
            {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {touched&&!buildingId&&errMsg("กรุณาเลือกอาคาร")}
          {selBuilding?.repairUsers&&selBuilding.repairUsers.length>0&&(
            <div style={{marginTop:10,padding:"10px 14px",background:"#eff6ff",borderRadius:12,border:"1.5px solid #bfdbfe",fontSize:13}}>
              <span style={{fontWeight:700,color:"#1e40af"}}>🔧 ผู้ดูแลตึก: </span>
              <span>{selBuilding.repairUsers.map(u=>fullName(u)).join(", ")}</span>
              <p style={{margin:"4px 0 0",color:"#6b7280",fontSize:12}}>ระบบจะแจ้งเตือนผู้ดูแลตึกอัตโนมัติ</p>
            </div>
          )}
        </div>
        <div>
          <label style={lbl}>📍 ห้อง / จุดที่แจ้งซ่อม <span style={{color:"#ef4444"}}>*</span></label>
          <input type="text" value={location} onChange={e=>setLocation(e.target.value)}
            placeholder="เช่น ห้อง 214, ห้องน้ำชาย ชั้น 1"
            style={inp(touched&&!location)}/>
          {touched&&!location&&errMsg("กรุณาระบุสถานที่")}
        </div>
      </div>

      {/* 3: Description */}
      <div style={{background:"white",borderRadius:20,border:"1.5px solid #f3f4f6",padding:24,marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <p style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:18,display:"flex",alignItems:"center",gap:8}}>{step(3,"#8b5cf6")} รายละเอียดปัญหา <span style={{color:"#ef4444"}}>*</span></p>
        <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={5}
          placeholder="อธิบายอาการเสียหาย..."
          style={{...inp(touched&&!description),resize:"vertical",lineHeight:1.7}}/>
        {touched&&!description&&errMsg("กรุณาระบุรายละเอียดปัญหา")}
      </div>

      {/* 4: Photo */}
      <div style={{background:"white",borderRadius:20,border:"1.5px solid #f3f4f6",padding:24,marginBottom:24,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
        <p style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>{step(4,"#f59e0b")} แนบรูปภาพ (ไม่บังคับ) — บันทึกใน OneDrive</p>
        <button type="button" onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:20,borderRadius:14,border:"2.5px dashed #d1d5db",background:"#f9fafb",cursor:"pointer",fontSize:14,color:"#6b7280",fontWeight:500}}>
          📸 คลิกเพื่อเลือกรูป
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>setPhotoFiles(prev=>[...prev,...Array.from(e.target.files??[])])}/>
        {photoFiles.length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12}}>
            {photoFiles.map((f,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:10,background:"#eff6ff",border:"1.5px solid #bfdbfe",fontSize:13,color:"#1e40af"}}>
                📎 <span style={{maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                <button type="button" onClick={()=>setPhotoFiles(p=>p.filter((_,idx)=>idx!==i))} style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:16,padding:0}}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {canSubmit&&(
        <div style={{background:"#f0fdf4",border:"2px solid #86efac",borderRadius:20,padding:20,marginBottom:20}}>
          <p style={{fontWeight:700,fontSize:14,color:"#166534",marginBottom:10}}>✅ สรุปรายการแจ้งซ่อม</p>
          <div style={{fontSize:14,color:"#374151",lineHeight:2}}>
            <div>🔧 ประเภท: <strong>{CATEGORIES.find(c=>c.key===category)?.label}</strong></div>
            <div>🏫 อาคาร: <strong>{buildings.find(b=>b.id===buildingId)?.name}</strong></div>
            <div>📍 สถานที่: <strong>{location}</strong></div>
            <div>📋 รายละเอียด: <strong>{description}</strong></div>
            {photoFiles.length>0&&<div>🖼️ รูปภาพ: <strong>{photoFiles.length} ไฟล์</strong></div>}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:12}}>
        <button type="button" onClick={onCancel} style={{flex:1,padding:14,borderRadius:14,border:"2px solid #e5e7eb",background:"white",fontSize:15,fontWeight:600,cursor:"pointer"}}>ยกเลิก</button>
        <button type="button" onClick={handleSubmit} disabled={loading} style={{flex:2,padding:14,borderRadius:14,border:"none",fontSize:15,fontWeight:700,cursor:!loading?"pointer":"not-allowed",background:!loading?"linear-gradient(135deg,#3b82f6,#6366f1)":"#e5e7eb",color:!loading?"white":"#9ca3af",boxShadow:!loading?"0 4px 14px rgba(99,102,241,0.4)":"none"}}>
          {loading?"⏳ กำลังส่ง...":"📤 ส่งคำขอแจ้งซ่อม"}
        </button>
      </div>
    </div>
  );
}

// ── RepairCard ────────────────────────────────────────────────────────────────
function RepairCard({req,currentUser,staff,onUpdate}:{req:RepairRequest;currentUser:UserProfile;staff:UserProfile[];onUpdate:()=>void;}){
  const [expanded,setExpanded]=useState(false);
  const [addingNote,setAddingNote]=useState(false);
  const [noteText,setNoteText]=useState("");
  const [loading,setLoading]=useState(false);
  const isAdmin=ADMIN_ROLES.includes(currentUser.role);
  const isOwner=req.reporter_id===currentUser.id;
  const isAssignee=req.assigned_to===currentUser.id;
  const repairUids=req.building?.repair_user_ids??[];
  const isBuildingRepair=repairUids.includes(currentUser.id);
  const isAssigned=!!req.assigned_to; // มีการมอบหมายแล้ว

  // ผู้แจ้งแก้ไขได้เมื่อยังไม่มอบหมาย, ห้ามแก้ไข/ลบหลังมอบหมาย
  const canEdit=(isAdmin||isAssignee||isBuildingRepair)&&req.status!=="cancelled"&&req.status!=="completed";
  const ownerCanEdit=isOwner&&!isAssigned&&req.status==="pending"; // แก้ไขได้เมื่อยังไม่มอบหมาย
  const cat=CATEGORIES.find(c=>c.key===req.category)??CATEGORIES[7];

  async function updateStatus(s:RepairStatus){
    setLoading(true);
    const u:any={status:s,updated_at:new Date().toISOString()};
    if(s==="completed"){
      u.completed_at=new Date().toISOString();
      // ส่งเมลแจ้งเสร็จไปที่ general@khienkhet.ac.th
      await sendRepairNotification(req,req.building,[COMPLETED_NOTIFY_EMAIL],true);
    }
    await (supabase.from("repair_requests") as any).update(u).eq("id",req.id);
    setLoading(false);onUpdate();
  }
  async function assignTo(uid:string){
    setLoading(true);
    await (supabase.from("repair_requests") as any).update({assigned_to:uid||null,assigned_at:uid?new Date().toISOString():null,status:uid?"in_progress":"pending",updated_at:new Date().toISOString()}).eq("id",req.id);
    setLoading(false);onUpdate();
  }
  async function addNote(){
    if(!noteText.trim())return;setLoading(true);
    const notes=[...(req.progress_notes??[]),{note:noteText.trim(),by:fullName(currentUser),at:new Date().toISOString()}];
    await (supabase.from("repair_requests") as any).update({progress_notes:notes,updated_at:new Date().toISOString()}).eq("id",req.id);
    setNoteText("");setAddingNote(false);setLoading(false);onUpdate();
  }
  async function cancelReq(){
    if(!confirm("ยืนยันการยกเลิก?"))return;setLoading(true);
    await (supabase.from("repair_requests") as any).update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",req.id);
    setLoading(false);onUpdate();
  }

  return(
    <div style={{background:"white",borderRadius:20,overflow:"hidden",border:`2px solid ${expanded?cat.border:"#f3f4f6"}`,boxShadow:expanded?`0 4px 20px ${cat.color}20`:"0 2px 8px rgba(0,0,0,0.05)",opacity:req.status==="cancelled"?0.65:1,transition:"all 0.2s ease"}}>
      <div style={{height:4,background:`linear-gradient(90deg,${cat.color},${cat.color}88)`}}/>
      <div style={{padding:"16px 20px",display:"flex",alignItems:"flex-start",gap:14,cursor:"pointer"}} onClick={()=>setExpanded(e=>!e)}>
        <div style={{width:48,height:48,borderRadius:14,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:cat.bg,border:`1.5px solid ${cat.border}`,fontSize:22}}>{cat.icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
            <span style={{fontSize:12,color:"#9ca3af",fontWeight:600,fontFamily:"monospace"}}>{req.ticket_no}</span>
            <StatusBadge status={req.status}/>
            {req.building&&<span style={{fontSize:12,background:"#f3f4f6",color:"#374151",padding:"2px 10px",borderRadius:10,fontWeight:600}}>🏫 {req.building.name}</span>}
            {isBuildingRepair&&!isAdmin&&<span style={{fontSize:12,background:"#ecfdf5",color:"#065f46",padding:"2px 10px",borderRadius:10,fontWeight:600,border:"1px solid #6ee7b7"}}>🔧 ผู้ดูแลตึก</span>}
          </div>
          <p style={{fontSize:16,fontWeight:700,margin:"0 0 3px",color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat.label} — {req.location}</p>
          <p style={{fontSize:14,color:"#6b7280",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req.description}</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          <span style={{fontSize:12,color:"#9ca3af"}}>{toThaiDate(req.created_at)}</span>
          <span style={{fontSize:18,color:"#9ca3af"}}>{expanded?"▲":"▼"}</span>
        </div>
      </div>

      {expanded&&(
        <div style={{borderTop:`2px solid ${cat.border}`,padding:"18px 20px",background:cat.bg}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 20px",marginBottom:16,fontSize:14}}>
            <div><span style={{color:"#6b7280"}}>👤 ผู้แจ้ง: </span><strong>{fullName(req.reporter)}</strong></div>
            <div><span style={{color:"#6b7280"}}>🕐 แจ้งเมื่อ: </span><strong>{toThaiDateTime(req.created_at)}</strong></div>
            {req.building&&<div><span style={{color:"#6b7280"}}>🏫 อาคาร: </span><strong>{req.building.name}</strong></div>}
            {req.assigned_to&&<div><span style={{color:"#6b7280"}}>🔧 ช่างที่รับงาน: </span><strong>{fullName(req.assignee)}</strong></div>}
            {req.completed_at&&<div className="col-span-2"><span style={{color:"#6b7280"}}>✅ เสร็จเมื่อ: </span><strong>{toThaiDateTime(req.completed_at)}</strong></div>}
          </div>
          {req.building?.repairUsers&&req.building.repairUsers.length>0&&(
            <div style={{padding:"10px 14px",background:"#eff6ff",borderRadius:12,border:"1.5px solid #bfdbfe",fontSize:13,marginBottom:12}}>
              <span style={{fontWeight:700,color:"#1e40af"}}>🔧 ผู้ดูแลตึก: </span>
              <span>{req.building.repairUsers.map(u=>fullName(u)).join(", ")}</span>
            </div>
          )}
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
          {/* เพิ่มบันทึก — เฉพาะ admin/assignee/repair user */}
          {canEdit&&(
            <div style={{marginBottom:14}}>
              {!addingNote?(
                <button type="button" onClick={()=>setAddingNote(true)} style={{fontSize:14,padding:"8px 16px",borderRadius:10,border:`1.5px dashed ${cat.color}`,background:"white",cursor:"pointer",color:cat.color,fontWeight:600}}>+ เพิ่มบันทึกความคืบหน้า</button>
              ):(
                <div style={{display:"flex",gap:8}}>
                  <input type="text" value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="บันทึก..." autoFocus
                    style={{flex:1,padding:"10px 14px",fontSize:14,borderRadius:10,border:`2px solid ${cat.color}`,outline:"none",fontFamily:"inherit"}}
                    onKeyDown={e=>e.key==="Enter"&&addNote()}/>
                  <button type="button" onClick={addNote} disabled={!noteText.trim()||loading} style={{padding:"10px 16px",borderRadius:10,border:"none",background:cat.color,color:"white",fontWeight:700,cursor:"pointer",fontSize:14}}>บันทึก</button>
                  <button type="button" onClick={()=>{setAddingNote(false);setNoteText("");}} style={{padding:"10px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",background:"white",cursor:"pointer",fontSize:14}}>ยกเลิก</button>
                </div>
              )}
            </div>
          )}
          {/* Admin actions */}
          {(isAdmin||isBuildingRepair)&&req.status!=="cancelled"&&req.status!=="completed"&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
              {(req.status==="pending"||req.status==="in_progress")&&isAdmin&&(
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,color:"#374151",fontWeight:600}}>มอบหมาย:</span>
                  <select value={req.assigned_to??""} onChange={e=>assignTo(e.target.value)} style={{fontSize:14,padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontFamily:"inherit"}}>
                    <option value="">— ยังไม่ได้มอบหมาย —</option>
                    {staff.map(s=><option key={s.id} value={s.id}>{fullName(s)}</option>)}
                  </select>
                </div>
              )}
              {req.status==="in_progress"&&(
                <button type="button" disabled={loading} onClick={()=>updateStatus("completed")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"white",fontWeight:700,fontSize:14,cursor:"pointer"}}>✅ ปิดงาน — เสร็จสิ้น</button>
              )}
              {req.status==="pending"&&isBuildingRepair&&!isAdmin&&(
                <button type="button" disabled={loading} onClick={()=>updateStatus("in_progress")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",fontWeight:700,fontSize:14,cursor:"pointer"}}>🔧 รับงานซ่อม</button>
              )}
            </div>
          )}
          {/* ผู้แจ้งยกเลิกได้เมื่อยังไม่มอบหมาย */}
          {ownerCanEdit&&(
            <div style={{marginTop:12}}>
              <button type="button" onClick={cancelReq} disabled={loading} style={{padding:"10px 18px",borderRadius:10,border:"2px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontWeight:600,fontSize:14,cursor:"pointer"}}>🗑️ ยกเลิกคำขอ</button>
            </div>
          )}
          {/* แจ้งเตือน: ถ้ามอบหมายแล้ว ห้ามแก้ไข/ลบ */}
          {isOwner&&isAssigned&&req.status!=="completed"&&req.status!=="cancelled"&&(
            <div style={{marginTop:10,padding:"8px 14px",background:"#fef3c7",borderRadius:10,border:"1.5px solid #fcd34d",fontSize:13,color:"#92400e"}}>
              🔒 งานนี้ถูกมอบหมายแล้ว ไม่สามารถแก้ไขหรือยกเลิกได้
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
  const router=useRouter();
  const [user,setUser]=useState<UserProfile|null>(null);
  const [requests,setRequests]=useState<RepairRequest[]>([]);
  const [buildings,setBuildings]=useState<Building[]>([]);
  const [staff,setStaff]=useState<UserProfile[]>([]);
  const [allUsers,setAllUsers]=useState<UserProfile[]>([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [showBuildingAdmin,setShowBuildingAdmin]=useState(false);
  const [filterStatus,setFilterStatus]=useState<RepairStatus|"all">("all");
  const [filterCat,setFilterCat]=useState("all");
  const [filterBuilding,setFilterBuilding]=useState("all");
  const [search,setSearch]=useState("");

  useEffect(()=>{
    const init=async()=>{
      const {data:{user:au}}=await supabase.auth.getUser();
      if(!au){setLoading(false);return;}
      const meta=au.user_metadata??{};const claims=meta.custom_claims??{};
      const email=au.email||meta.email||meta.preferred_username||meta.upn||claims.email||"";
      let ud:any=null;
      const byId=await supabase.from("users").select("id,first_name,last_name,email,role,position,title").eq("auth_id",au.id).maybeSingle();
      if(byId.data){ud=byId.data;}else if(email){const byE=await supabase.from("users").select("id,first_name,last_name,email,role,position,title").eq("email",email).maybeSingle();ud=byE.data;if(ud)await (supabase.from("users") as any).update({auth_id:au.id}).eq("id",ud.id);}
      if(ud){
        setUser(ud as UserProfile);
        const {data:sd}=await supabase.from("users").select("id,first_name,last_name,email,role,position").in("role",ADMIN_ROLES);setStaff((sd as UserProfile[])||[]);
        const {data:aU}=await supabase.from("users").select("id,first_name,last_name,email,role,position,title").order("first_name");setAllUsers((aU as UserProfile[])||[]);
      }
      const {data:bd}=await (supabase.from("buildings") as any).select("id,name,repair_user_ids,inspector_user_ids").order("name");
      const {data:aU2}=await supabase.from("users").select("id,first_name,last_name,email");
      const uMap:Record<string,any>={};(aU2||[]).forEach((u:any)=>{uMap[u.id]=u;});
      setBuildings((bd||[]).map((b:any)=>({...b,repairUsers:(b.repair_user_ids||[]).map((id:string)=>uMap[id]).filter(Boolean),inspectorUsers:(b.inspector_user_ids||[]).map((id:string)=>uMap[id]).filter(Boolean)})));
      setLoading(false);
    };
    init();
  },[]);

  const loadRequests=useCallback(async()=>{
    if(!user)return;
    const isAdm=ADMIN_ROLES.includes(user.role);
    const {data:myB}=await (supabase.from("buildings") as any).select("id").contains("repair_user_ids",[user.id]);
    const myBids=(myB||[]).map((b:any)=>b.id);
    let q=(supabase.from("repair_requests") as any)
      .select("*, reporter:users!reporter_id(first_name,last_name,position,email), assignee:users!assigned_to(first_name,last_name), building:buildings!building_id(id,name,repair_user_ids,inspector_user_ids)")
      .order("created_at",{ascending:false});
    if(!isAdm&&myBids.length>0) q=q.or(`reporter_id.eq.${user.id},building_id.in.(${myBids.join(",")})`);
    else if(!isAdm) q=q.eq("reporter_id",user.id);
    const {data}=await q;
    const {data:aU}=await supabase.from("users").select("id,first_name,last_name,email");
    const uMap:Record<string,any>={};(aU||[]).forEach((u:any)=>{uMap[u.id]=u;});
    setRequests(((data||[]).map((r:any)=>({...r,building:r.building?{...r.building,repairUsers:(r.building.repair_user_ids||[]).map((id:string)=>uMap[id]).filter(Boolean),inspectorUsers:(r.building.inspector_user_ids||[]).map((id:string)=>uMap[id]).filter(Boolean)}:null}))) as RepairRequest[]);
  },[user]);

  useEffect(()=>{if(user)loadRequests();},[user,loadRequests]);

  async function submitRepair(payload:any){
    const {data,error}=await (supabase.from("repair_requests") as any).insert([payload]).select("*, reporter:users!reporter_id(first_name,last_name,email), building:buildings!building_id(id,name,repair_user_ids)").single();
    if(error){alert("❌ "+error.message);return;}
    // อีเมลพิเศษตามประเภท
    const specialEmails=CATEGORY_SPECIAL_EMAILS[payload.category]??[];
    await sendRepairNotification(data,data.building,specialEmails);
    alert("✅ ส่งคำขอแจ้งซ่อมเรียบร้อยแล้ว\n📧 ระบบแจ้งเตือนผู้ดูแลแล้ว");
    setShowForm(false);await loadRequests();
  }

  const isAdm=user?ADMIN_ROLES.includes(user.role):false;
  const isSuperAdm=user?SUPER_ADMIN_ROLES.includes(user.role):false;

  // ── filter รวมทั้งหมด รวม location ────────────────────────────────────────
  const filtered=requests.filter(r=>{
    if(filterStatus!=="all"&&r.status!==filterStatus)return false;
    if(filterCat!=="all"&&r.category!==filterCat)return false;
    if(filterBuilding!=="all"&&r.building_id!==filterBuilding)return false;
    if(search){
      const q=search.toLowerCase();
      const inTicket=r.ticket_no.toLowerCase().includes(q);
      const inLocation=r.location.toLowerCase().includes(q); // แก้ค้นหาสถานที่
      const inDesc=r.description.toLowerCase().includes(q);
      const inBuilding=(r.building?.name??"").toLowerCase().includes(q);
      if(!inTicket&&!inLocation&&!inDesc&&!inBuilding)return false;
    }
    return true;
  });

  const stats={
    total:    requests.length,
    pending:  requests.filter(r=>r.status==="pending").length,
    in_progress:requests.filter(r=>r.status==="in_progress").length,
    completed:requests.filter(r=>r.status==="completed").length,
    cancelled:requests.filter(r=>r.status==="cancelled").length,
  };

  if(loading)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f9fafb"}}><div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>🔧</div><p style={{color:"#6b7280",fontSize:16}}>กำลังโหลด...</p></div></div>);
  if(!user)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:"#ef4444",fontSize:16,fontWeight:600}}>❌ กรุณาเข้าสู่ระบบก่อน</p></div>);
  if(showForm)return(<div style={{minHeight:"100vh",background:"#f9fafb"}}><RepairForm user={user} buildings={buildings} onSubmit={submitRepair} onCancel={()=>setShowForm(false)}/></div>);

  return(
    <div style={{minHeight:"100vh",background:"#f9fafb",fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
      {showBuildingAdmin&&<BuildingAdmin allUsers={allUsers} onClose={()=>setShowBuildingAdmin(false)}/>}
      {/* Top bar */}
      <div style={{position:"sticky",top:0,zIndex:40,background:"white",borderBottom:"2px solid #f3f4f6",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>router.push("/dashboard")} style={{width:40,height:40,borderRadius:12,border:"2px solid #e5e7eb",background:"white",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>🏠</button>
          <div><h1 style={{fontSize:18,fontWeight:700,margin:0}}>🔧 แจ้งซ่อม (Helpdesk)</h1><p style={{fontSize:12,color:"#9ca3af",margin:0}}>โรงเรียนวัดเขียนเขต</p></div>
        </div>
        <div style={{display:"flex",gap:10}}>
          {isSuperAdm&&(<button onClick={()=>setShowBuildingAdmin(true)} style={{padding:"10px 16px",borderRadius:14,border:"2px solid #e5e7eb",background:"white",color:"#374151",fontWeight:600,fontSize:14,cursor:"pointer"}}>🏫 จัดการอาคาร</button>)}
          <button type="button" onClick={()=>setShowForm(true)} style={{padding:"10px 20px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:"0 4px 14px rgba(99,102,241,0.4)",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>➕</span> แจ้งซ่อม
          </button>
        </div>
      </div>

      <div style={{padding:"20px",width:"100%",boxSizing:"border-box"}}>
        {/* Stats — 5 การ์ด (total + pending + in_progress + completed + cancelled) */}
        {isAdm&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
            {[
              {key:"all",      label:"ทั้งหมด",        val:stats.total,      emoji:"📋",color:"#6366f1",bg:"#eef2ff",border:"#c7d2fe"},
              {key:"pending",  label:"รอดำเนินการ",    val:stats.pending,    emoji:"⏳",color:"#f59e0b",bg:"#fffbeb",border:"#fcd34d"},
              {key:"in_progress",label:"กำลังดำเนินการ",val:stats.in_progress,emoji:"⚙️",color:"#3b82f6",bg:"#eff6ff",border:"#93c5fd"},
              {key:"completed",label:"เสร็จสิ้น",      val:stats.completed,  emoji:"✅",color:"#10b981",bg:"#ecfdf5",border:"#6ee7b7"},
              {key:"cancelled",label:"ยกเลิก",         val:stats.cancelled,  emoji:"🚫",color:"#6b7280",bg:"#f9fafb",border:"#d1d5db"},
            ].map(s=>{
              const active=filterStatus===(s.key==="all"?"all":s.key);
              return(
                <div key={s.key} onClick={()=>setFilterStatus(s.key==="all"?"all":s.key as RepairStatus)}
                  style={{padding:"16px 14px",borderRadius:18,cursor:"pointer",background:active?s.bg:"white",border:`2px solid ${active?s.color:"#f3f4f6"}`,boxShadow:active?`0 4px 16px ${s.color}30`:"0 2px 8px rgba(0,0,0,0.04)",transition:"all 0.2s ease"}}>
                  <p style={{fontSize:12,color:"#6b7280",margin:"0 0 6px",fontWeight:600,display:"flex",alignItems:"center",gap:5}}><span>{s.emoji}</span>{s.label}</p>
                  <p style={{fontSize:28,fontWeight:800,margin:0,color:active?s.color:"#111827"}}>{s.val}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
          <div style={{flex:1,minWidth:200,position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:16}}>🔍</span>
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหา ticket / สถานที่ / อาคาร..."
              style={{width:"100%",paddingLeft:44,paddingRight:16,paddingTop:12,paddingBottom:12,fontSize:14,borderRadius:14,border:"2px solid #e5e7eb",outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:"white"}}/>
          </div>
          <select value={filterBuilding} onChange={e=>setFilterBuilding(e.target.value)} style={{fontSize:14,padding:"12px 16px",borderRadius:14,border:"2px solid #e5e7eb",fontFamily:"inherit",background:"white"}}>
            <option value="all">🏫 ทุกอาคาร</option>
            {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{fontSize:14,padding:"12px 16px",borderRadius:14,border:"2px solid #e5e7eb",fontFamily:"inherit",background:"white"}}>
            <option value="all">📦 ทุกหมวดหมู่</option>
            {CATEGORIES.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value as any)} style={{fontSize:14,padding:"12px 16px",borderRadius:14,border:"2px solid #e5e7eb",fontFamily:"inherit",background:"white"}}>
            <option value="all">📋 ทุกสถานะ</option>
            {Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {filtered.length===0?(
          <div style={{textAlign:"center",padding:"4rem 2rem",background:"white",borderRadius:24,border:"2px dashed #e5e7eb"}}>
            <div style={{fontSize:56,marginBottom:16}}>🔧</div>
            <p style={{color:"#374151",fontSize:18,fontWeight:700,margin:"0 0 8px"}}>{requests.length===0?"ยังไม่มีรายการแจ้งซ่อม":"ไม่พบรายการที่ตรงกับการค้นหา"}</p>
            {requests.length===0&&(<><p style={{color:"#9ca3af",fontSize:14,marginBottom:20}}>เริ่มแจ้งซ่อมรายการแรกได้เลย</p><button type="button" onClick={()=>setShowForm(true)} style={{padding:"12px 28px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"white",fontWeight:700,fontSize:15,cursor:"pointer"}}>➕ แจ้งซ่อมรายการแรก</button></>)}
          </div>
        ):(
          <div>
            <p style={{fontSize:13,color:"#9ca3af",marginBottom:12,fontWeight:500}}>แสดง {filtered.length} จาก {requests.length} รายการ</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(480px,1fr))",gap:12}}>
              {filtered.map(r=><RepairCard key={r.id} req={r} currentUser={user} staff={staff} onUpdate={loadRequests}/>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}