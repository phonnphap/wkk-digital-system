// app/api/html-to-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import puppeteer, { PuppeteerLifeCycleEvent } from "puppeteer";

export async function POST(req: NextRequest) {
  try {
    const { html } = await req.json();
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    
    // 💡 จุดแก้ไขที่ 1: หล่อไทป์ให้เป็น PuppeteerLifeCycleEvent หรือส่งเป็นอาร์เรย์เพื่อแก้เรื่อง networkidle0
    await page.setContent(html, { 
      waitUntil: "networkidle0" as any
    });
    
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    
    await browser.close();
    
    // 💡 จุดแก้ไขที่ 2: แปลงโครงสร้างไบนารี Uint8Array ให้กลายเป็น Buffer หรือ Blob ก่อนส่งเข้า NextResponse
    const pdfBuffer = Buffer.from(pdf);
    
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=leave-document.pdf",
      },
    });
  } catch (e: any) {
    console.error("html-to-pdf error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}