// lib/teams-dm.ts
import { ConfidentialClientApplication } from "@azure/msal-node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Sender = "hr" | "general" | "academic";

async function getSenderToken(sender: Sender): Promise<string> {
  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.AZURE_CLIENT_ID!,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
  });

  const { data, error } = await supabase
    .from("teams_auth_cache")
    .select("cache_data")
    .eq("label", sender)
    .single();

  if (error || !data) throw new Error(`ไม่พบ token cache ของบัญชี ${sender} — ต้อง login ใหม่ผ่าน one-time-auth.mts`);

  cca.getTokenCache().deserialize(data.cache_data);
  const accounts = await cca.getTokenCache().getAllAccounts();
  if (accounts.length === 0) throw new Error(`ไม่พบบัญชีใน token cache ของ ${sender}`);

  const result = await cca.acquireTokenSilent({
    account: accounts[0],
    scopes: ["Chat.Create", "ChatMessage.Send"],
  });

  // สำคัญ: เซฟ cache กลับทุกครั้ง เผื่อ MSAL หมุน refresh token ใหม่ให้
  await supabase
    .from("teams_auth_cache")
    .update({ cache_data: cca.getTokenCache().serialize() })
    .eq("label", sender);

  if (!result?.accessToken) throw new Error(`ขอ token ของ ${sender} ไม่สำเร็จ`);
  return result.accessToken;
}

export async function sendTeamsDM(sender: Sender, targetEmail: string, message: string) {
  try {
    const token = await getSenderToken(sender);

    // หา/สร้างแชท 1:1 ระหว่างบัญชี sender กับผู้รับ (ใช้ email/UPN แทน user id ได้)
    const chatRes = await fetch("https://graph.microsoft.com/v1.0/chats", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        chatType: "oneOnOne",
        members: [
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${targetEmail}')`,
          },
        ],
      }),
    });

    if (!chatRes.ok) {
      console.error("[sendTeamsDM] create chat failed:", await chatRes.text());
      return;
    }
    const chat = await chatRes.json();

    const msgRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: { content: message } }),
    });

    if (!msgRes.ok) console.error("[sendTeamsDM] send message failed:", await msgRes.text());
  } catch (err) {
    // ไม่ throw ต่อ — ถ้าส่ง DM พลาด ไม่ควรทำให้การอนุมัติ/ปฏิเสธคำขอในระบบล้มเหลวไปด้วย
    console.error("[sendTeamsDM] error:", err);
  }
}