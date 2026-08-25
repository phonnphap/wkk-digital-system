import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/studentAuth";

export default async function StudentPortalLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const session = await getStudentSession();
  if (!session || session.student_id !== studentId) {
    redirect(`/join/expired?next=${studentId}`);
  }
  return <>{children}</>;
}