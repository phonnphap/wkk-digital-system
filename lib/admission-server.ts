import { createClient } from "@supabase/supabase-js";

export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const OD_USER = process.env.ADMISSION_ONEDRIVE_USER ?? "general@khienkhet.ac.th";

let cached: { token: string; exp: number } | null = null;
export async function graphToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("ขอ token OneDrive ไม่สำเร็จ");
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

export const safe = (s: string) => (s ?? "").replace(/[\\/:*?"<>|#%~&{}]/g, "").trim() || "-";

/** path ภายใน OneDrive ของ general@ → Graph URL */
export const odUrl = (path: string, suffix = "") =>
  `https://graph.microsoft.com/v1.0/users/${OD_USER}/drive/root:/${path.split("/").map(encodeURIComponent).join("/")}${suffix}`;

export async function requireAdmin(req: Request) {
  const t = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!t) return null;
  const { data: { user } } = await db.auth.getUser(t);
  if (!user) return null;
  const { data } = await db.from("users").select("role").eq("auth_id", user.id).maybeSingle();
  return data && /admin/i.test(String(data.role ?? "")) ? user : null;
}

// rate limit แบบง่าย (ต่อ instance) — ถ้าใช้ production จริงจังแนะนำ Upstash/Vercel WAF
const hits = new Map<string, { n: number; t: number }>();
export function limited(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.t > windowMs) { hits.set(key, { n: 1, t: now }); return false; }
  h.n++;
  return h.n > max;
}
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";