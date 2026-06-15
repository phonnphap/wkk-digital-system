import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { to, subject, html } = await req.json();
  try {
    await resend.emails.send({
      from: "ระบบลา WKK <noreply@khienkhet.ac.th>",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}