import axios from 'axios';
import qs from 'qs';

// บัญชี OneDrive ปลายทาง (ต้องตรงกับค่า ONEDRIVE_ACCOUNT ที่ล็อกไว้ฝั่งหน้าเว็บใน page.tsx เสมอ)
const TARGET_EMAIL = process.env.MICROSOFT_TARGET_EMAIL!;
const ROOT_FOLDER  = process.env.ONEDRIVE_ROOT_FOLDER || 'WKK_School_Uploads';

let cachedToken: { token: string; expiresAt: number } | null = null;

// ฟังก์ชันขอ Token (แคชไว้จนใกล้หมดอายุ ลดการยิงขอ token ซ้ำทุกครั้ง)
export async function getMicrosoftAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const url = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;

  const data = qs.stringify({
    'client_id': process.env.MICROSOFT_CLIENT_ID,
    'client_secret': process.env.MICROSOFT_CLIENT_SECRET,
    'grant_type': 'client_credentials',
    'scope': 'https://graph.microsoft.com/.default',
  });

  try {
    const response = await axios.post(url, data, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    cachedToken = { token: response.data.access_token, expiresAt: Date.now() + response.data.expires_in * 1000 };
    return cachedToken.token;
  } catch (error: any) {
    console.error('Error getting MS Token:', error.response?.data || error.message);
    throw new Error('ไม่สามารถขอตั๋วผ่านทางจาก Microsoft ได้');
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

export type OneDriveUploadResult = {
  itemId: string; name: string; webUrl: string; size: number; mimeType: string; account: string;
};

// ฟังก์ชันอัปโหลดไฟล์
// ★ คืนค่าเป็น object ที่มี itemId เสมอ (ไม่ใช่ลิงก์ดาวน์โหลดตรง) เพราะลิงก์
// @microsoft.graph.downloadUrl หมดอายุใน ~1 ชม. เก็บลง Supabase แล้วใช้ต่อภายหลังไม่ได้
// ต้องใช้ itemId คู่กับ /api/onedrive-file (proxy route) เพื่อดึงไฟล์มาแสดงใหม่ได้เสมอไม่มีวันหมดอายุ
//
// subFolder: แยกโฟลเดอร์รูปภาพ/ไฟล์สื่อแนบออกจากกันใต้ ROOT_FOLDER เช่น "รูปภาพ", "ไฟล์สื่อแนบ"
export async function uploadFileToOneDrive(
  fileBuffer: Buffer,
  fileName: string,
  subFolder: string = ''
): Promise<OneDriveUploadResult> {
  const accessToken = await getMicrosoftAccessToken();
  const safeName = sanitizeFileName(fileName);
  const path = subFolder
    ? `${ROOT_FOLDER}/${subFolder}/${Date.now()}_${safeName}`
    : `${ROOT_FOLDER}/${Date.now()}_${safeName}`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const baseUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(TARGET_EMAIL)}/drive/root:/${encodedPath}`;

  try {
    let item: any;

    if (fileBuffer.byteLength <= 4 * 1024 * 1024) {
      // ไฟล์ไม่เกิน 4MB — อัปโหลดตรงในครั้งเดียว (เหมือนโค้ดเดิมของคุณ)
      const response = await axios.put(`${baseUrl}:/content`, fileBuffer, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' },
      });
      item = response.data;
    } else {
      // ไฟล์ใหญ่กว่า 4MB — Graph ไม่รองรับ PUT ตรงๆ ต้องใช้ upload session
      const sessionRes = await axios.post(
        `${baseUrl}:/createUploadSession`,
        { item: { '@microsoft.graph.conflictBehavior': 'rename' } },
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      const uploadUrl = sessionRes.data.uploadUrl;
      const uploadRes = await axios.put(uploadUrl, fileBuffer, {
        headers: {
          'Content-Length': String(fileBuffer.byteLength),
          'Content-Range': `bytes 0-${fileBuffer.byteLength - 1}/${fileBuffer.byteLength}`,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      item = uploadRes.data;
    }

    return {
      itemId: item.id,
      name: item.name,
      webUrl: item.webUrl,
      size: item.size,
      mimeType: item.file?.mimeType ?? '',
      account: TARGET_EMAIL,
    };
  } catch (error: any) {
    console.error('Error uploading to OneDrive:', error.response?.data || error.message);
    throw new Error('ไม่สามารถส่งไฟล์ไปที่ OneDrive ได้');
  }
}