import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { to, subject, html, attachments } = await req.json();
    
    const { data, error } = await resend.emails.send({
      from: "ระบบลา WKK <noreply@khienkhet.ac.th>",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      attachments: attachments ?? [],
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}