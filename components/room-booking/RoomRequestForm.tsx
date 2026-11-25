"use client";

// แบบคำขอการใช้บริการสถานที่ห้องประชุม (A4 หน้าเดียว) — จำลองจากแบบฟอร์ม .doc ของโรงเรียน
// ใช้ inline style ล้วน (ไม่ใช้ Tailwind) เพราะ html2canvas อ่านสี oklch ของ Tailwind v4 ไม่ได้

export const EQUIPMENT_OPTIONS = [
  "โต๊ะหมู่บูชา", "ชุดรับแขก", "เครื่องฉายโปรเจ็คเตอร์",
  "พระบรมฉายาลักษณ์", "แท่นกล่าวรายงาน", "เครื่องเสียง", "คอมพิวเตอร์/โน๊ตบุ๊ค",
];
export const SEATING_OPTIONS = ["โต๊ะและเก้าอี้", "เก้าอี้อย่างเดียว", "จัดแบบประชุมประจำเดือน"];

export type RoomFormData = {
  created_at?: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  room_name: string;
  requester_name: string;
  requester_position: string;
  purpose: string;
  attendees: number | null;
  equipment: string[];
  equipment_other: string | null;
  seating: string | null;
  seating_other: string | null;
  requester_signature: string | null;
  staff_result: string | null;
  staff_reason: string | null;
  staff_name: string | null;
  staff_signature: string | null;
  head_name: string | null;
  head_signature: string | null;
  deputy_name: string | null;
  deputy_signature: string | null;
  director_decision: string | null;
  director_name: string | null;
  director_signature: string | null;
};

const MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
function thaiParts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { d, m: MONTHS[m - 1], y: y + 543 };
}
const hhmm = (t: string) => t.slice(0, 5).replace(":", ".");

const Dots = ({ v, w = 80 }: { v?: string | number | null; w?: number }) => (
  <span style={{ display: "inline-block", minWidth: w, borderBottom: "1px dotted #000", textAlign: "center", padding: "0 4px" }}>
    {v ?? ""}
  </span>
);
const Box = ({ on }: { on: boolean }) => (
  <span style={{ display: "inline-block", width: 12, height: 12, border: "1px solid #000", marginRight: 4, verticalAlign: "middle", textAlign: "center", lineHeight: "11px", fontSize: 11 }}>
    {on ? "✓" : ""}
  </span>
);
const Sig = ({ src }: { src?: string | null }) => (
  <div style={{ height: 40, textAlign: "center" }}>
    {src && /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="" style={{ height: 40, maxWidth: 200 }} />}
  </div>
);

// ฟอนต์จาก /public/fonts (โหลดผ่าน @font-face ในตัวฟอร์มเอง)
const FONT_CSS = `
@font-face{font-family:"THSarabunNew";font-weight:400;src:url("/fonts/THSarabunNew.ttf") format("truetype");}
@font-face{font-family:"THSarabunNew";font-weight:700;src:url("/fonts/THSarabun-Bold.ttf") format("truetype");}
`;

const DEFAULT_STAFF = "นายเชิดชู ไวยบุรี";
const DEFAULT_DIRECTOR = "นายธนณัฐ ศิระวงษ์";

export default function RoomRequestForm({
  data, withSignatures, allRooms,
}: {
  data: RoomFormData;
  withSignatures: boolean;      // false = ฉบับไม่มีลายเซ็น/ผลการพิจารณา (ไว้พิมพ์ไปเซ็นมือ)
  allRooms: string[];
}) {
  const reqDate = data.created_at
    ? new Date(data.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
    : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const rd = thaiParts(reqDate);
  const bd = thaiParts(data.booking_date);
  const s = withSignatures;

  return (
    <div style={{ width: 794, height: 1123, boxSizing: "border-box", padding: "36px 56px", background: "#fff", color: "#000", fontFamily: '"THSarabunNew","TH Sarabun New",Tahoma,sans-serif', fontSize: 20, lineHeight: 1.3, position: "relative" }}>
      <style>{FONT_CSS}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images.jpg" alt="" style={{ position: "absolute", left: 56, top: 30, width: 64, height: 76, objectFit: "contain" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images1.jpg" alt="" style={{ position: "absolute", right: 56, top: 30, width: 70, height: 76, objectFit: "contain" }} />
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 23, padding: "0 80px" }}>
        แบบคำขอการใช้บริการสถานที่ห้องประชุม<br />
        โรงเรียนวัดเขียนเขต สำนักงานเขตพื้นที่การศึกษาประถมศึกษาปทุมธานี เขต 2
      </div>
      <div style={{ borderBottom: "1px solid #000", margin: "4px 0 6px" }} />

      <div style={{ textAlign: "right" }}>
        วันที่ <Dots v={rd.d} w={36} /> เดือน <Dots v={rd.m} w={90} /> พ.ศ. <Dots v={rd.y} w={50} />
      </div>
      <div>เรื่อง ขอใช้สถานที่ห้องประชุม</div>
      <div>เรียน ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>

      <div style={{ marginTop: 6, textIndent: 36 }}>
        ข้าพเจ้า <Dots v={data.requester_name} w={220} /> ตำแหน่ง <Dots v={data.requester_position} w={150} />
      </div>
      <div style={{ textIndent: 36 }}>มีความประสงค์จะขออนุญาตใช้ห้องประชุม ดังนี้</div>
      <div style={{ paddingLeft: 36 }}>
        {allRooms.map((r) => (
          <span key={r} style={{ marginRight: 14, whiteSpace: "nowrap" }}><Box on={r === data.room_name} />{r}</span>
        ))}
      </div>

      <div style={{ marginTop: 4 }}>
        เพื่อใช้ในการประชุม / จัดกิจกรรม / โครงการ <Dots v={data.purpose} w={300} />
      </div>
      <div>
        ในวันที่ <Dots v={bd.d} w={36} /> เดือน <Dots v={bd.m} w={90} /> พ.ศ. <Dots v={bd.y} w={50} />{" "}
        เวลา <Dots v={`${hhmm(data.start_time)} - ${hhmm(data.end_time)}`} w={110} /> น.
      </div>
      <div>จำนวนผู้เข้าร่วมประชุม/กิจกรรม/โครงการ <Dots v={data.attendees} w={70} /> คน</div>

      <div style={{ marginTop: 4 }}>โดยขอให้จัดเตรียมอุปกรณ์ประกอบดังนี้</div>
      <div style={{ paddingLeft: 36 }}>
        {EQUIPMENT_OPTIONS.map((e) => (
          <span key={e} style={{ marginRight: 14, whiteSpace: "nowrap" }}><Box on={data.equipment.includes(e)} />{e}</span>
        ))}
        <span style={{ whiteSpace: "nowrap" }}><Box on={!!data.equipment_other} />อื่นๆ <Dots v={data.equipment_other} w={120} /></span>
      </div>

      <div style={{ marginTop: 4 }}>
        การจัดที่นั่ง{" "}
        {SEATING_OPTIONS.map((e) => (
          <span key={e} style={{ marginRight: 14, whiteSpace: "nowrap" }}><Box on={data.seating === e} />{e}</span>
        ))}
        <span style={{ whiteSpace: "nowrap" }}><Box on={!!data.seating_other} />อื่นๆ <Dots v={data.seating_other} w={100} /></span>
      </div>

      <div style={{ marginTop: 8, textIndent: 36 }}>จึงเรียนมาเพื่อโปรดพิจารณา</div>

      <div style={{ marginTop: 6, marginLeft: 330, textAlign: "center" }}>
        <div>ลงชื่อ</div>
        <Sig src={s ? data.requester_signature : null} />
        <div>({data.requester_name || "........................................"}) ผู้ขอใช้</div>
        <div>ตำแหน่ง {data.requester_position || "........................................"}</div>
      </div>

      {/* ส่วนเจ้าหน้าที่ / ผู้อำนวยการ */}
      <div style={{ display: "flex", border: "1px solid #000", marginTop: 12, fontSize: 18, lineHeight: 1.25 }}>
        <div style={{ flex: 1, padding: 8, borderRight: "1px solid #000" }}>
          <div style={{ fontWeight: 700, textDecoration: "underline" }}>สำหรับเจ้าหน้าที่</div>
          <div>ตรวจสอบแล้ว ห้องประชุม <Dots v={s ? data.room_name : ""} w={110} /></div>
          <div><Box on={s && data.staff_result === "available"} />ว่าง</div>
          <div><Box on={s && data.staff_result === "unavailable"} />ไม่ว่าง เนื่องจาก <Dots v={s ? data.staff_reason : ""} w={110} /></div>
          <div style={{ textAlign: "center", marginTop: 4 }}>
            ลงชื่อ
            <Sig src={s ? data.staff_signature : null} />
            ({(s && data.staff_name) || DEFAULT_STAFF})<br />ตำแหน่ง หัวหน้างานอาคารสถานที่
          </div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>ตรวจเสนอ</div>
          <div style={{ display: "flex", gap: 6, textAlign: "center" }}>
            <div style={{ flex: 1 }}>
              <Sig src={s ? data.head_signature : null} />
              ({(s && data.head_name) || "..................."})<br />หัวหน้ากลุ่มบริหารทั่วไป
            </div>
            <div style={{ flex: 1 }}>
              <Sig src={s ? data.deputy_signature : null} />
              ({(s && data.deputy_name) || "..................."})<br />รองผู้อำนวยการกลุ่มบริหารทั่วไป
            </div>
          </div>
        </div>
        <div style={{ flex: 1, padding: 8 }}>
          <div style={{ fontWeight: 700, textDecoration: "underline" }}>ความเห็นของผู้อำนวยการโรงเรียน</div>
          <div style={{ marginTop: 6 }}>
            <Box on={s && data.director_decision === "approved"} />อนุมัติ{"    "}
            <Box on={s && data.director_decision === "rejected"} />ไม่อนุมัติ
          </div>
          <div style={{ textAlign: "center", marginTop: 40 }}>
            ลงชื่อ
            <Sig src={s ? data.director_signature : null} />
            ({(s && data.director_name) || DEFAULT_DIRECTOR})<br />ตำแหน่ง ผู้อำนวยการโรงเรียนวัดเขียนเขต
          </div>
        </div>
      </div>
    </div>
  );
}