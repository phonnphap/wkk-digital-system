import StudentPortalClient from "../../StudentPortalClient";

export default async function SubjectPortalPage({
  params,
}: {
  params: Promise<{ studentId: string; sectionId: string }>;
}) {
  const { studentId } = await params;
  return <StudentPortalClient studentId={studentId} />;
}