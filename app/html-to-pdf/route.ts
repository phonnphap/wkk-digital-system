// app/api/generate-leave-pdf/route.ts

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Vercel Pro ได้สูงสุด 60s
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let html = "";
  try {
    const body = await req.json();
    html = body.html as string;
    if (!html) {
      return NextResponse.json({ ok: false, error: "No HTML provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // Dynamic import เพื่อไม่ให้ crash ถ้า package ไม่มี
    const [chromiumMod, puppeteerMod] = await Promise.all([
      import("@sparticuz/chromium").catch(() => null),
      import("puppeteer-core").catch(() => null),
    ]);

    if (!chromiumMod || !puppeteerMod) {
      console.warn("[generate-leave-pdf] puppeteer/chromium not installed");
      return NextResponse.json(
        { ok: false, error: "PDF engine not available", fallback: true },
        { status: 503 }
      );
    }

    const chromium = chromiumMod.default;
    const puppeteer = puppeteerMod.default;

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    // ใส่ content โดยตรงแทนการ navigate เพื่อให้เร็วขึ้น
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
    });
    
    await browser.close();

    const pdfBuffer = Buffer.from(pdfBytes);
    console.log("[generate-leave-pdf] PDF size:", pdfBuffer.length, "bytes");

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[generate-leave-pdf] Error:", e);
    // ถ้า puppeteer ทำงานไม่ได้ ให้ส่ง fallback กลับไป
    // client จะ upload HTML แทน
    return NextResponse.json(
      { ok: false, error: e.message, fallback: true },
      { status: 503 }
    );
  }
}