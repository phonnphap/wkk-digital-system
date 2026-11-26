// ค่าตั้งต้นที่ใช้ร่วมกันของระบบจองห้อง/รถ

// true  = รถ: เมื่อผู้จัดรถกดจัดรถ+คนขับ ระบบลงชื่อ "ผอ. อนุญาต" ให้ทันที (ดึงลายเซ็นจาก users)
// false = รถ: ส่งต่อให้ ผอ. กดอนุญาตเอง (สถานะ pending_director)
export const VEHICLE_DIRECTOR_AUTO = true;

// ชื่อคอลัมน์ลายเซ็นในตาราง users
export const SIGNATURE_COLUMN = "signature_url";

// ผู้ดูแลระบบ = role ที่มีคำว่า admin หรืออีเมล admin@
export const isAdminRole = (role?: string | null, email?: string | null) =>
  (role ?? "").toLowerCase().includes("admin") || (email ?? "").toLowerCase() === "admin@khienkhet.ac.th";
