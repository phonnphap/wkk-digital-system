import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";

export async function POST(req: NextRequest) {
  const { subject, body, ticketNo } = await req.json();

  // ใช้ Resend หรือ Nodemailer — ตัวอย่างใช้ Resend
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "ระบบแจ้งซ่อม <noreply@khienkhet.ac.th>",
      to: ["general@khienkhet.ac.th"],
      subject,
      text: body,
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Email failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}