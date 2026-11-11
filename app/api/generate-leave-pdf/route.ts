import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { html } = await req.json();
    if (!html) return NextResponse.json({ ok: false, error: "no html" }, { status: 400 });

    const isDev = process.env.NODE_ENV === "development";
    const browser = await puppeteer.launch(
      isDev
        ? { executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true }
        : { args: chromium.args, executablePath: await chromium.executablePath(), headless: true }
    );
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 30000 });
await page.evaluate(() => (document as any).fonts.ready);
await page.evaluate(async () => {
  const imgs = Array.from(document.images);
  await Promise.all(imgs.map(img => img.complete ? null : new Promise(res => { img.onload = img.onerror = () => res(null); })));
});
      await page.evaluate(() => (document as any).fonts.ready);
      const pdf = await page.pdf({ format: "A4", landscape: false, printBackground: true, preferCSSPageSize: true });
      return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf" } });
    } finally {
      await browser.close();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}