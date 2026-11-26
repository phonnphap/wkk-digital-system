"use client";

// หนังสือขออนุญาตใช้รถยนต์ทางราชการ (A4 หน้าเดียว) — จำลองจากหน้า 2 ของไฟล์ PDF แบบขอใช้รถราชการ
// ใช้ inline style ล้วน เพราะ html2canvas อ่านสี oklch ของ Tailwind v4 ไม่ได้

export type VehicleFormData = {
  created_at?: string | null;
  start_date: string; start_time: string;
  end_date: string; end_time: string;
  vehicles: { id: string; label: string }[];   // รถราชการทั้งหมด (ติ๊กช่องที่จัดให้)
  vehicle_id: string | null;
  vehicle_label: string | null;                 // รถที่จัดให้ (ใช้แสดงกรณีรถจ้างชั่วคราว)
  vehicle_hired: boolean;
  requester_name: string; requester_position: string;
  purpose: string; destination: string;
  distance_km: number | null; passengers: number | null;
  requester_signature: string | null;
  driver_name: string | null;
  assign_note: string | null;
  assigner_name: string | null; assigner_position: string | null; assigner_signature: string | null;
  director_decision: string | null; director_name: string | null; director_signature: string | null;
};

const MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const thaiParts = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return { d, m: MONTHS[m - 1], y: y + 543 }; };
const hhmm = (t: string) => t.slice(0, 5).replace(":", ".");

const FONT_CSS = `
@font-face{font-family:"THSarabunNew";font-weight:400;src:url("/fonts/THSarabunNew.ttf") format("truetype");}
@font-face{font-family:"THSarabunNew";font-weight:700;src:url("/fonts/THSarabun-Bold.ttf") format("truetype");}
`;
const Dots = ({ v, w = 80 }: { v?: string | number | null; w?: number }) => (
  <span style={{ display: "inline-block", minWidth: w, borderBottom: "1px dotted #000", textAlign: "center", padding: "0 4px" }}>{v ?? ""}</span>
);
const Radio = ({ on }: { on: boolean }) => (
  <span style={{ display: "inline-block", width: 13, height: 13, border: "1px solid #000", borderRadius: "50%", marginRight: 5, verticalAlign: "middle", position: "relative" }}>
    {on && <span style={{ position: "absolute", left: 2.5, top: 2.5, width: 6, height: 6, borderRadius: "50%", background: "#000" }} />}
  </span>
);
const Sig = ({ src }: { src?: string | null }) => (
  <div style={{ height: 42, textAlign: "center" }}>
    {src && /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="" style={{ height: 42, maxWidth: 200 }} />}
  </div>
);

const DEFAULT_DIRECTOR = "นายธนณัฐ ศิระวงษ์";

export default function VehicleRequestForm({ data, withSignatures }: { data: VehicleFormData; withSignatures: boolean }) {
  const s = withSignatures;
  const reqIso = (data.created_at ? new Date(data.created_at) : new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const rd = thaiParts(reqIso), sd = thaiParts(data.start_date), ed = thaiParts(data.end_date);
  const hiredShown = s && data.vehicle_hired && data.vehicle_label;

  return (
    <div style={{ width: 794, height: 1123, boxSizing: "border-box", padding: "34px 56px", background: "#fff", color: "#000", fontFamily: '"THSarabunNew","TH Sarabun New",Tahoma,sans-serif', fontSize: 20, lineHeight: 1.35, position: "relative" }}>
      <style>{FONT_CSS}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images1.jpg" alt="" style={{ display: "block", margin: "0 auto", width: 84, height: 84, objectFit: "contain" }} />
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 23, marginTop: 4 }}>หนังสือขออนุญาตใช้รถยนต์ทางราชการ</div>

      <div style={{ textAlign: "right", marginTop: 4 }}>
        วันที่ <Dots v={rd.d} w={40} /> เดือน <Dots v={rd.m} w={100} /> พ.ศ. <Dots v={rd.y} w={56} />
      </div>
      <div>เรื่อง ขออนุญาตใช้รถยนต์ทางราชการ</div>
      <div style={{ paddingLeft: 40 }}>
        {data.vehicles.map((v) => (
          <span key={v.id} style={{ marginRight: 14, whiteSpace: "nowrap" }}><Radio on={s && data.vehicle_id === v.id} />{v.label}</span>
        ))}
        {hiredShown && <span style={{ whiteSpace: "nowrap" }}><Radio on />รถจ้างชั่วคราว {data.vehicle_label}</span>}
      </div>
      <div>เรียน ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>

      <div style={{ paddingLeft: 40, marginTop: 4 }}>
        ข้าพเจ้า <Dots v={data.requester_name} w={250} /> ตำแหน่ง <Dots v={data.requester_position} w={190} />
      </div>
      <div style={{ marginTop: 2 }}>ขออนุญาตใช้รถยนต์ของทางราชการเพื่อ <Dots v={data.purpose} w={400} /></div>
      <div style={{ paddingLeft: 40, marginTop: 2 }}>สถานที่ไป <Dots v={data.destination} w={520} /></div>
      <div style={{ paddingLeft: 40, marginTop: 2 }}>
        ระยะทางโดยประมาณ <Dots v={data.distance_km} w={110} /> กม. จำนวนผู้โดยสาร <Dots v={data.passengers} w={90} /> คน
      </div>
      <div style={{ marginTop: 2 }}>
        เดินทางวันที่ <Dots v={sd.d} w={36} /> เดือน <Dots v={sd.m} w={90} /> พ.ศ. <Dots v={sd.y} w={50} />{" "}
        ถึงวันที่ <Dots v={ed.d} w={36} /> เดือน <Dots v={ed.m} w={90} /> พ.ศ. <Dots v={ed.y} w={50} />
      </div>
      <div style={{ marginTop: 2 }}>
        เวลาเริ่มเดินทางโดยประมาณ <Dots v={hhmm(data.start_time)} w={90} /> น. เวลากลับโดยประมาณ <Dots v={hhmm(data.end_time)} w={90} /> น.
      </div>
      <div style={{ paddingLeft: 40, marginTop: 8 }}>จึงเรียนมาเพื่อโปรดพิจารณา</div>

      <div style={{ marginLeft: 330, marginTop: 6, textAlign: "center" }}>
        <div>ลงชื่อ</div>
        <Sig src={s ? data.requester_signature : null} />
        <div>({data.requester_name || "........................................"}) ผู้ขออนุญาต</div>
        <div>ตำแหน่ง {data.requester_position || "........................................"}</div>
      </div>

      <div style={{ display: "flex", marginTop: 16, gap: 24 }}>
        <div style={{ flex: 1.1 }}>
          <div>ความเห็น <Dots v={s ? data.assign_note : ""} w={230} /></div>
          <div style={{ marginTop: 2 }}>พนักงานขับรถ <Dots v={s ? data.driver_name : ""} w={190} /></div>
          <div style={{ marginTop: 6, textAlign: "center" }}>
            ลงชื่อ
            <Sig src={s ? data.assigner_signature : null} />
            ({(s && data.assigner_name) || "........................................"})<br />
            {(s && data.assigner_position) || "ตำแหน่ง ........................................"}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>ทราบ</div>
          <div style={{ paddingLeft: 24 }}>
            <div><Radio on={s && data.director_decision === "approved"} />อนุญาต</div>
            <div><Radio on={s && data.director_decision === "rejected"} />ไม่อนุญาต</div>
            <div><Radio on={false} />อื่นๆ <Dots v="" w={150} /></div>
          </div>
          <div style={{ marginTop: 6, textAlign: "center" }}>
            <Sig src={s ? data.director_signature : null} />
            ({(s && data.director_name) || DEFAULT_DIRECTOR})<br />ผู้อำนวยการโรงเรียนวัดเขียนเขต
          </div>
        </div>
      </div>
    </div>
  );
}
