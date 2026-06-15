import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { to, subject, html } = await req.json();
    
    // Dynamic import เพื่อหลีกเลี่ยง build error
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const toList = Array.isArray(to) ? to : [to];
    
    await resend.emails.send({
      from: "ระบบลา WKK <noreply@khienkhet.ac.th>",
      to: toList,
      subject,
      html,
    });
    
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Send email error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}