# 🏫 ระบบปฏิบัติงานรวมศูนย์ โรงเรียนวัดเขียนเขต

Digital School Management System — Next.js 14 + Supabase + face-api.js

---

## ⚡ เริ่มต้นใช้งาน (5 ขั้นตอน)

### 1. Clone / วางไฟล์โปรเจกต์
```bash
cd school-app
npm install
```

### 2. ตั้งค่า Environment Variables
```bash
cp .env.example .env.local
```
เปิด `.env.local` แล้วกรอก:
- `NEXT_PUBLIC_SUPABASE_URL` — จาก Supabase Dashboard → Settings → API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — จาก Supabase Dashboard → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — จาก Supabase Dashboard → Settings → API (ห้าม expose!)
- `NEXT_PUBLIC_SCHOOL_LAT` / `NEXT_PUBLIC_SCHOOL_LNG` — พิกัด GPS โรงเรียน

### 3. ดาวน์โหลด face-api.js models
สร้าง folder `public/models/` แล้วดาวน์โหลดไฟล์จาก:
https://github.com/justadudewhohacks/face-api.js/tree/master/weights

ไฟล์ที่ต้องการ (วางใน `public/models/`):
```
tiny_face_detector_model-weights_manifest.json
tiny_face_detector_model-shard1
face_landmark_68_model-weights_manifest.json
face_landmark_68_model-shard1
face_recognition_model-weights_manifest.json
face_recognition_model-shard1
face_recognition_model-shard2
```

หรือรัน script นี้:
```bash
mkdir -p public/models
cd public/models
BASE="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"
for f in \
  tiny_face_detector_model-weights_manifest.json \
  tiny_face_detector_model-shard1 \
  face_landmark_68_model-weights_manifest.json \
  face_landmark_68_model-shard1 \
  face_recognition_model-weights_manifest.json \
  face_recognition_model-shard1 \
  face_recognition_model-shard2; do
  curl -O "$BASE/$f"
done
```

### 4. ตั้งค่า Supabase Auth (Google / Microsoft SSO)
ใน Supabase Dashboard:
1. Authentication → Providers → เปิด **Google** และ/หรือ **Azure**
2. กรอก Client ID และ Client Secret จาก Google Cloud Console / Azure AD
3. Redirect URL: `https://your-domain.com/api/auth/callback`
4. Google: ใน "Allowed domains" กรอก `wankianket.ac.th`

### 5. รันโปรเจกต์
```bash
npm run dev
```
เปิด http://localhost:3000

---

## 📁 โครงสร้างโปรเจกต์

```
school-app/
├── app/
│   ├── layout.tsx              # Root layout (font, toaster)
│   ├── page.tsx                # Redirect → /dashboard
│   ├── globals.css             # Tailwind + design tokens
│   ├── login/
│   │   └── page.tsx            # SSO login page
│   ├── dashboard/
│   │   ├── layout.tsx          # Sidebar + Header layout
│   │   └── page.tsx            # Dashboard homepage
│   ├── face-scan/
│   │   └── page.tsx            # ★ ระบบสแกนใบหน้าเข้า-ออกงาน
│   ├── leave/                  # ใบลา (TODO)
│   ├── homeroom/               # ครูประจำชั้น (TODO)
│   └── api/
│       ├── auth/callback/      # OAuth callback
│       ├── attendance/         # ★ POST check-in/out, GET status
│       └── face/               # GET face vectors
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser client
│   │   └── server.ts           # Server + Service Role client
│   ├── face-api-loader.ts      # ★ face-api.js loader + matcher
│   └── utils.ts                # GPS, date, helpers
├── types/
│   └── database.ts             # TypeScript types for all DB tables
├── middleware.ts               # Auth session middleware
├── .env.example                # Environment template
└── public/
    └── models/                 # face-api.js model files (ดาวน์โหลดเอง)
```

---

## 🔐 หลักการทำงาน Face Recognition

```
[มือถือครู] → เปิดกล้อง → face-api.js (TinyFaceDetector + FaceRecognition)
     ↓
[Client] → ตรวจจับใบหน้า → ดึง 128-dim descriptor (Float32Array)
     ↓
[Client] → เปรียบเทียบกับ face vectors ทั้งหมดจาก /api/face
           ใช้ Euclidean distance (threshold = 0.5)
     ↓
[Client] → ตรวจสอบ GPS (Haversine formula, radius 300m)
     ↓
[Client] → POST /api/attendance { type, lat, lng, faceScore, descriptor }
     ↓
[Server] → บันทึกใน teacher_attendance table + อัปเดต face_vector ใน users
```

**ทำไมประมวลผลฝั่ง Client?**
- ไม่ต้องส่งภาพใหญ่เข้า server → ประหยัด bandwidth + เร็วกว่า
- ทำงานได้แม้ internet ช้า (เฉพาะขั้นตอนการจับ descriptor)
- รองรับ iPhone/Safari/Android เต็มรูปแบบ

---

## 📋 Database Tables ที่ใช้งาน

| Table | ใช้งาน |
|-------|--------|
| `users` | ข้อมูลครู + `face_vector` (128-dim JSON array) |
| `teacher_attendance` | บันทึก check-in/out รายวัน |
| `homeroom_attendance` | เช็คชื่อนักเรียนตอนเช้า |
| `subject_attendance` | เช็คชื่อรายคาบ |
| `leave_requests` | ใบลา |
| `documents` | เลขเอกสาร |

---

## 🚀 โมดูลที่พัฒนาแล้ว
- [x] ระบบล็อกอิน SSO (Google / Microsoft)
- [x] Layout + Sidebar + Navigation
- [x] **ระบบสแกนใบหน้าเข้า-ออกงาน** (face-api.js + GPS + Supabase)
- [x] Dashboard homepage
- [x] API: `/api/attendance` (check-in/out)
- [x] API: `/api/face` (face vectors)
- [x] Middleware auth protection

## 📌 โมดูลถัดไป (TODO)
- [ ] ใบลา / ไปราชการ (workflow อนุมัติ)
- [ ] ครูประจำชั้น — เช็คชื่อนักเรียน + LINE แจ้งผู้ปกครอง
- [ ] ตารางสอน + แลกคาบ
- [ ] เลขเอกสาร + E-Archive
- [ ] แจ้งซ่อม (Helpdesk)
