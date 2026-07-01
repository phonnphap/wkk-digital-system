import AwardForm from '@/components/honor/AwardForm';

export default function NewAwardPage() {
  return (
    <div className="px-6 md:px-10 py-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <p className="eyebrow">คลังเกียรติยศ</p>
        <h1 className="font-display text-3xl font-semibold text-navy mt-1">บันทึกรางวัลใหม่</h1>
      </header>
      <AwardForm />
    </div>
  );
}
