// lib/student-prefix.ts
// ★ Utility กลาง สำหรับคำนวณคำนำหน้า (คำนำหน้าชื่อ) ของนักเรียนจากอายุ + เพศ
// ใช้ร่วมกันทุกหน้าที่แสดง/แก้ไขชื่อนักเรียน เพื่อไม่ให้ logic กระจัดกระจาย
//
// กฎ:
//   ชาย  อายุ < 15 -> เด็กชาย   | อายุ >= 15 -> นาย
//   หญิง อายุ < 15 -> เด็กหญิง  | อายุ >= 15 -> นางสาว
//
// หมายเหตุ: คำนวณจาก birth_date ทุกครั้งที่ต้อง "แสดงผล" (ไม่ใช่แค่ตอนบันทึกฟอร์ม)
// เพราะอายุของนักเรียนเปลี่ยนไปเรื่อยๆ ตามวันเกิด ถ้าไปยึดค่า prefix ที่บันทึกไว้ในฐานข้อมูล
// เฉยๆ อาจจะเก่า/ไม่ตรงกับอายุจริง ณ วันที่เปิดดูหน้านั้น

/** คำนวณอายุปัจจุบัน (ปี) จากวันเกิด, คืน null ถ้าข้อมูลไม่ถูกต้อง/ไม่มี */
export function calculateAge(birthDateStr?: string | null): number | null {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }
  return age;
}

/** คำนวณคำนำหน้าที่ "ควรจะเป็น" จากเพศ + วันเกิด, คืน null ถ้าคำนวณไม่ได้ (ข้อมูลไม่ครบ) */
export function getAutoPrefix(
  gender?: string | null,
  birthDateStr?: string | null
): string | null {
  const age = calculateAge(birthDateStr);
  if (age === null || !gender) return null;
  if (gender === "male") return age >= 15 ? "นาย" : "เด็กชาย";
  if (gender === "female") return age >= 15 ? "นางสาว" : "เด็กหญิง";
  return null;
}

/**
 * คำนำหน้าที่ควรใช้ "แสดงผล" จริง:
 * ถ้าคำนวณจากอายุ+เพศได้ ให้ใช้ค่าที่คำนวณได้เสมอ (ตรงกับอายุปัจจุบัน)
 * ถ้าคำนวณไม่ได้ (ไม่มี birth_date หรือ gender) ให้ fallback ไปใช้ค่า prefix ที่เก็บไว้ในฐานข้อมูล
 * ถ้าไม่มีทั้งสองอย่าง คืนค่าว่าง
 */
export function getDisplayPrefix(
  gender?: string | null,
  birthDateStr?: string | null,
  storedPrefix?: string | null
): string {
  return getAutoPrefix(gender, birthDateStr) ?? storedPrefix ?? "";
}