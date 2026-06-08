// lib/pdf-generator.ts
// สร้าง PDF ใบลาจาก HTML ด้วย html2canvas + jsPDF

export interface LeaveFormData {
  fullName: string;
  position: string;
  leaveType: string;
  leaveTypeName: string;
  otherLeaveName?: string;
  startDate: string;
  endDate: string;
  days: number;
  halfDay?: "morning" | "afternoon" | null;
  reason: string;
  signatureUrl?: string;
  submittedDate: string;
}

export function buildLeaveHTML(data: LeaveFormData): string {
  const thaiDate = (iso: string) =>
    new Date(iso).toLocaleDateString("th-TH", {
      day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
    });

  const submittedD = new Date(data.submittedDate);
  const thDay   = submittedD.getDate();
  const thMonth = submittedD.toLocaleDateString("th-TH", { month: "long", timeZone: "Asia/Bangkok" });
  const thYear  = submittedD.getFullYear() + 543;

  const isSick      = data.leaveType === "sick";
  const isPersonal  = data.leaveType === "personal";
  const isMaternity = data.leaveType === "maternity";
  const isOther     = data.leaveType === "other";

  const leaveLabel = isOther && data.otherLeaveName
    ? data.otherLeaveName
    : data.leaveTypeName;

  const halfDayText = data.halfDay === "morning" ? " (ครึ่งวันเช้า)" :
                      data.halfDay === "afternoon" ? " (ครึ่งวันบ่าย)" : "";

  const daysDisplay = data.halfDay ? "0.5" : String(data.days);

  return `
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Sarabun', 'TH SarabunPSK', sans-serif;
    font-size: 14pt;
    color: #000;
    background: white;
    width: 210mm;
    padding: 15mm 20mm;
  }
  .header { text-align: center; margin-bottom: 8px; }
  .header img { width: 70px; height: 70px; }
  .title { font-size: 16pt; font-weight: bold; text-align: center; margin: 8px 0; }
  .school-info { text-align: right; margin-bottom: 12px; line-height: 1.7; }
  .date-line { text-align: right; margin-bottom: 16px; }
  .subject { margin-bottom: 6px; }
  .to-line { margin-bottom: 14px; }
  .name-line { margin: 14px 0 8px; display: flex; gap: 8px; }
  .leave-check { margin: 10px 0 10px 40px; line-height: 2.2; }
  .checkbox { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #000; vertical-align: middle; margin-right: 6px; text-align: center; font-size: 11pt; line-height: 1; }
  .checked::after { content: '✓'; font-weight: bold; }
  .date-range { margin: 10px 0; line-height: 2; }
  .prev-leave { margin: 10px 0; line-height: 2; }
  .contact { margin: 8px 0 20px; line-height: 2; }
  .signature-block { text-align: center; margin: 20px 0 20px 60%; }
  .sig-img { width: 120px; height: 60px; object-fit: contain; display: block; margin: 0 auto 4px; }
  .sig-line { border-bottom: 1px solid #000; width: 200px; margin: 0 auto 4px; }
  .sig-name { font-size: 13pt; }
  .stats-table { width: 45%; border-collapse: collapse; margin-top: 10px; font-size: 12pt; }
  .stats-table th, .stats-table td { border: 1px solid #000; padding: 4px 8px; text-align: center; }
  .stats-table th { background: #f0f0f0; font-weight: bold; }
  .approval-section { margin-top: 10px; display: flex; gap: 30px; }
  .approval-box { flex: 1; border: 1px solid #666; border-radius: 4px; padding: 10px 14px; font-size: 12pt; min-height: 100px; }
  .approval-box .title-box { font-weight: bold; margin-bottom: 8px; }
  .dotted-line { border-bottom: 1px dotted #666; margin: 4px 0; height: 20px; }
  .footer-sig { text-align: center; margin-top: 8px; font-size: 12pt; }
  .bold { font-weight: bold; }
  .underline { text-decoration: underline; }
</style>
</head>
<body>
  <!-- Logo -->
  <div class="header">
    <img src="https://system.khienkhet.ac.th/logo.png" alt="logo" onerror="this.style.display='none'"/>
  </div>
  <div class="title">แบบ${isMaternity ? "ใบลาคลอดบุตร" : "ใบลาป่วย ลากิจส่วนตัว ลาคลอดบุตร"}</div>

  <div class="school-info">
    โรงเรียนวัดเขียนเขต ตำบลบึงยี่โถ<br>
    อำเภอธัญบุรี จังหวัดปทุมธานี
  </div>

  <div class="date-line">
    วันที่ <span class="underline">&nbsp;${thDay}&nbsp;</span>
    เดือน <span class="underline">&nbsp;${thMonth}&nbsp;</span>
    พ.ศ. <span class="underline">&nbsp;${thYear}&nbsp;</span>
  </div>

  <div class="subject">เรื่อง <span class="underline">&nbsp;&nbsp;ขอ${leaveLabel}${halfDayText}&nbsp;&nbsp;</span></div>
  <div class="to-line">เรียน ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>

  <div class="name-line">
    ข้าพเจ้า <span class="underline">&nbsp;&nbsp;${data.fullName}&nbsp;&nbsp;</span>
    ตำแหน่ง <span class="underline">&nbsp;&nbsp;${data.position}&nbsp;&nbsp;</span>
  </div>
  <div style="margin-bottom:8px">สังกัดโรงเรียนวัดเขียนเขต สำนักงานเขตพื้นที่การศึกษาประถมศึกษาปทุมธานี เขต 2</div>

  <div class="leave-check">
    <div>
      <span class="checkbox ${isSick?"checked":""}"></span> ลาป่วย
    </div>
    <div>
      <span class="checkbox ${isPersonal?"checked":""}"></span> ลากิจส่วนตัว
      เนื่องจาก <span class="underline">&nbsp;&nbsp;${isPersonal||isOther ? data.reason : ""}&nbsp;&nbsp;</span>
    </div>
    ${isOther ? `<div style="margin-left:24px;font-size:12pt;color:#333">ประเภท: <strong>${data.otherLeaveName??""}</strong></div>` : ""}
    <div>
      <span class="checkbox ${isMaternity?"checked":""}"></span> ลาคลอดบุตร
    </div>
  </div>

  <div class="date-range">
    ตั้งแต่วันที่ <span class="underline">&nbsp;&nbsp;${thaiDate(data.startDate)}&nbsp;&nbsp;</span>
    ถึงวันที่ <span class="underline">&nbsp;&nbsp;${thaiDate(data.endDate)}&nbsp;&nbsp;</span>
    มีกำหนด <span class="underline">&nbsp;&nbsp;${daysDisplay}&nbsp;&nbsp;</span> วัน${halfDayText}
  </div>

  <div class="prev-leave">
    ข้าพเจ้า ได้
    <span class="checkbox"></span> ลาป่วย
    <span class="checkbox"></span> ลากิจส่วนตัว
    <span class="checkbox"></span> ลาคลอดบุตร ครั้งสุดท้าย
    <br>
    ตั้งแต่วันที่ <span class="underline">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
    ถึงวันที่ <span class="underline">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
    มีกำหนด <span class="underline">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> วัน
  </div>

  <div class="contact">
    ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่
    <span class="underline">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
  </div>

  <div style="text-align:right;margin-bottom:4px">ขอแสดงความนับถือ</div>

  <div class="signature-block">
    ${data.signatureUrl ? `<img src="${data.signatureUrl}" class="sig-img" alt="ลายเซ็น"/>` : '<div style="height:60px"></div>'}
    <div class="sig-line"></div>
    <div class="sig-name">(${data.fullName})</div>
  </div>

  <!-- สถิติการลา -->
  <div class="bold underline" style="margin-top:16px;margin-bottom:6px">สถิติการลาในปีงบประมาณนี้</div>
  <table class="stats-table">
    <tr><th>ประเภทการลา</th><th>ลามาแล้ว</th><th>ลาครั้งนี้</th><th>รวมเป็น</th></tr>
    <tr><td>ลาป่วย</td><td></td><td>${isSick?daysDisplay:""}</td><td></td></tr>
    <tr><td>ลากิจส่วนตัว</td><td></td><td>${isPersonal||isOther?daysDisplay:""}</td><td></td></tr>
    <tr><td>ลาคลอดบุตร</td><td></td><td>${isMaternity?daysDisplay:""}</td><td></td></tr>
  </table>

  <!-- ช่องอนุมัติ -->
  <div class="approval-section" style="margin-top:16px">
    <div class="approval-box">
      <div class="title-box">ความเห็นของรอง.ผอ.กลุ่มบริหารงานบุคคล</div>
      <div class="dotted-line"></div><div class="dotted-line"></div>
      <div class="footer-sig">
        ลงชื่อ................................<br>
        (นางลัดดา จำปาแดง)<br>
        ตำแหน่ง รองผู้อำนวยการกลุ่มบริหารงานบุคคล
      </div>
    </div>
    <div class="approval-box">
      <div class="title-box">ความเห็นของผู้บังคับบัญชา</div>
      <div style="margin:4px 0">
        ลงชื่อ........................ผู้ตรวจสอบ<br>
        (นางสาวพรรษา แก้วใหญ่)<br>
        ตำแหน่ง ครู<br>
        วันที่..............................<br><br>
        <strong>คำสั่ง</strong><br>
        <span class="checkbox"></span> อนุญาต &nbsp;&nbsp;
        <span class="checkbox"></span> ไม่อนุญาต<br>
        <div class="dotted-line"></div>
        ลงชื่อ<br>
        (นายธนณัฐ ศิระวงษ์)<br>
        ตำแหน่ง ผู้อำนวยการโรงเรียนวัดเขียนเขต<br>
        วันที่..............................
      </div>
    </div>
  </div>
</body>
</html>`;
}