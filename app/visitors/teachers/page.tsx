import TeacherFinder from "@/components/visitors/TeacherFinder";

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-5">
      <h1 className="text-3xl font-black">👩‍🏫 ติดต่อครูประจำชั้น</h1>
      <TeacherFinder big />
    </div>
  );
}