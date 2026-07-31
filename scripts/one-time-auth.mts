// scripts/one-time-auth.mts
import "dotenv/config";
import { PublicClientApplication } from "@azure/msal-node";
import { DeviceCodeResponse } from "@azure/msal-common";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function loginAccount(label: "hr" | "general" | "academic") {
  const pca = new PublicClientApplication({
    auth: {
      clientId: process.env.AZURE_CLIENT_ID!,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    },
  });

  console.log(`\n=== กำลัง login บัญชี: ${label} ===`);
  const result = await pca.acquireTokenByDeviceCode({
    scopes: ["Chat.Create", "ChatMessage.Send", "User.Read", "offline_access"],
    deviceCodeCallback: (resp: DeviceCodeResponse) => console.log(resp.message),
    // ตอนนี้จะขึ้นข้อความ "ไปที่ microsoft.com/devicelogin แล้วใส่โค้ด XXXXXX"
    // ให้เปิด browser ไปที่นั้น แล้ว "login ด้วยบัญชี hr@khienkhet.ac.th" (หรือ general/academic ตามรอบ)
  });

  const cache = pca.getTokenCache().serialize();

  // เก็บลง Supabase table แยกตาม label — ควรเข้ารหัสก่อนเก็บจริง (ใส่ทีหลังได้)
  await supabase.from("teams_auth_cache").upsert({ label, cache_data: cache });

  console.log(`✅ เก็บ cache ของ ${label} เรียบร้อย`);
}

// รันทีละบัญชี — แก้ label แล้วรันใหม่ 3 รอบ
async function main() {
  await loginAccount("hr");
  // await loginAccount("general");
  // await loginAccount("academic");
}

main();