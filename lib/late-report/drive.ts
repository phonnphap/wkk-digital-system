import { google } from "googleapis";
import { Readable } from "node:stream";

function drive() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth });
}

async function ensureFolder(d: ReturnType<typeof google.drive>, name: string) {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const { data } = await d.files.list({ q, fields: "files(id)", pageSize: 1 });
  if (data.files?.[0]?.id) return data.files[0].id;
  const { data: made } = await d.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder" }, fields: "id",
  });
  return made.id!;
}

export async function uploadToDrive(folderName: string, fileName: string, bytes: Uint8Array) {
  const d = drive();
  if (!d) return; // ยังไม่ตั้งค่า → ข้าม
  const folderId = await ensureFolder(d, folderName);
  const { data } = await d.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`, fields: "files(id)", pageSize: 1,
  });
  const media = { mimeType: "application/pdf", body: Readable.from(Buffer.from(bytes)) };
  if (data.files?.[0]?.id) await d.files.update({ fileId: data.files[0].id, media });
  else await d.files.create({ requestBody: { name: fileName, parents: [folderId] }, media, fields: "id" });
}