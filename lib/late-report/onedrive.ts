// path: lib/late-report/onedrive.ts (ฝั่ง server) — ส่งไฟล์รายงานจับสายขึ้น OneDrive ของ general@khienkhet.ac.th ผ่าน Microsoft Graph
// ใช้แอปลงทะเบียน (Azure App registration) ตัวเดียวกับระบบลาได้ ถ้ามีสิทธิ์ Application "Files.ReadWrite.All" (admin consent)
// โฟลเดอร์ "รายงานจับสาย" และ "รายงานจับสาย_ไม่มีลายเซน" จะถูกสร้างอัตโนมัติตอนอัปโหลดครั้งแรก

const env = (...names: string[]) => names.map((n) => process.env[n]).find(Boolean) ?? "";
// ★ ชื่อตัวแปรลองหลายแบบ — ถ้าระบบลาใช้ชื่ออื่นใน .env ให้เพิ่มชื่อนั้นต่อท้ายตรงนี้
const TENANT = () => env("MS_TENANT_ID", "AZURE_TENANT_ID", "GRAPH_TENANT_ID", "MICROSOFT_TENANT_ID", "ONEDRIVE_TENANT_ID");
const CLIENT = () => env("MS_CLIENT_ID", "AZURE_CLIENT_ID", "GRAPH_CLIENT_ID", "MICROSOFT_CLIENT_ID", "ONEDRIVE_CLIENT_ID");
const SECRET = () => env("MS_CLIENT_SECRET", "AZURE_CLIENT_SECRET", "GRAPH_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET", "ONEDRIVE_CLIENT_SECRET");
export const ONEDRIVE_OWNER = () => process.env.LATE_REPORT_ONEDRIVE_USER || "general@khienkhet.ac.th";

let cached: { token: string; exp: number } | null = null;
async function getToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const tenant = TENANT(), id = CLIENT(), secret = SECRET();
  if (!tenant || !id || !secret) throw new Error("ยังไม่ได้ตั้งค่า Microsoft Graph (tenant/client id/client secret) ใน env");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error("ขอ token ไม่สำเร็จ: " + (j.error_description ?? res.status));
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3000) * 1000 };
  return cached.token;
}

/** ชื่อไฟล์ = วันที่แบบ ddmmyyyy (พ.ศ.) เช่น 16112569.pdf */
export function oneDriveFileName(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}${m}${Number(y) + 543}.pdf`;
}

const pathOf = (folder: string, name: string) => [folder, name].map(encodeURIComponent).join("/");

/** อัปโหลด (ทับไฟล์เดิมถ้าซ้ำ) — ไฟล์ < 4 MB ใช้ simple upload */
export async function uploadToOneDrive(folder: string, fileName: string, bytes: Uint8Array) {
  const token = await getToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_OWNER())}/drive/root:/${pathOf(folder, fileName)}:/content?@microsoft.graph.conflictBehavior=replace`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" },
    body: Buffer.from(bytes),
  });
  if (!res.ok) throw new Error(`OneDrive ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

/** ลบไฟล์ (ไม่พบไฟล์ก็ถือว่าสำเร็จ) */
export async function deleteFromOneDrive(folder: string, fileName: string) {
  const token = await getToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_OWNER())}/drive/root:/${pathOf(folder, fileName)}`;
  const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`OneDrive delete ${res.status}`);
}