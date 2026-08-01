// app/api/teams-dm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendTeamsDM } from "@/lib/teams-dm";

export async function POST(req: NextRequest) {
  try {
    const { sender, targetEmail, message } = await req.json();

    if (!sender || !targetEmail || !message) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

    await sendTeamsDM(sender, targetEmail, message);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/teams-dm] error:", err);
    return NextResponse.json({ error: err?.message ?? "unknown error" }, { status: 500 });
  }
}