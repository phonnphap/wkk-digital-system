// app/student-portal/[studentId]/page.tsx
import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/studentAuth";
import StudentPortalClient from "./StudentPortalClient";

export default async function StudentPortalPage({ params }: { params: { studentId: string } }) {
  const session = await getStudentSession();
  if (!session || session.student_id !== params.studentId) {
    redirect("/join/expired"); // หรือหน้าที่บอกว่า session หมดอายุ/ไม่ตรงสิทธิ์
  }
  return <StudentPortalClient studentId={params.studentId} />;
}