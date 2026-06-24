import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function POST(req: NextRequest) {
  const { html } = await req.json();
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" }); // ✅ แก้ networkidle0 → load
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();
  return new NextResponse(Buffer.from(pdf), { // ✅ แก้ Uint8Array → Buffer
    headers: { "Content-Type": "application/pdf" },
  });
}