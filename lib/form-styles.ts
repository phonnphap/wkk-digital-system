/**
 * lib/form-styles.ts
 * ใช้ร่วมกันทุกฟอร์มในระบบคลังเกียรติยศ
 * - ปกติ: พื้นขาว ขอบฟ้า (sky)
 * - error (บังคับกรอกแต่ว่าง ตอนกด submit): ขอบแดง + พื้นแดงอ่อน
 * ใช้สี tailwind มาตรฐาน (ไม่พึ่ง custom token เช่น navy/gold) เพื่อกันปัญหาสีจางกลืนพื้นหลัง
 * ถ้า tailwind.config มี custom token เหล่านี้ครบแล้ว ปรับกลับไปใช้ได้ตามสบาย
 *
 * @param hasError กรอบแดงเมื่อ true (ช่องบังคับที่ยังว่างตอนกด submit)
 * @param extra    คลาสเสริมต่อท้าย เช่น 'font-mono' สำหรับช่องรหัสนักเรียน
 */
export function fieldCls(hasError?: boolean, extra?: string): string {
  const base = [
    "w-full rounded-md border-2 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400",
    "bg-white transition-colors focus:outline-none focus:ring-2",
    hasError
      ? "border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-200"
      : "border-sky-300 focus:border-sky-500 focus:ring-sky-200",
  ].join(" ");

  return extra ? `${base} ${extra}` : base;
}