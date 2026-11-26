"use client";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@/lib/supabase/client";
import { SIGNATURE_COLUMN } from "@/lib/booking-config";

const supabase = createClient() as any;

// fetch พร้อมแนบ Bearer token (ให้ API ตรวจว่าล็อกอินจริง)
export async function authFetch(url: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session) headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

// ลายเซ็นที่บันทึกไว้ใน users → data URL (รองรับทั้ง data URL และลิงก์รูป)
export async function getStoredSignature(userId: string): Promise<string | null> {
  const { data } = await supabase.from("users").select(SIGNATURE_COLUMN).eq("id", userId).maybeSingle();
  const v = (data as any)?.[SIGNATURE_COLUMN] as string | undefined;
  if (!v) return null;
  if (v.startsWith("data:")) return v;
  try {
    const blob = await (await fetch(v)).blob();
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

// เรนเดอร์คอมโพเนนต์ฟอร์มนอกจอ → PDF A4 หน้าเดียว
export async function renderToPdf(node: ReactElement): Promise<File> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(node);
    await new Promise((r) => setTimeout(r, 300));
    const fonts = (document as any).fonts;
    await Promise.all([fonts?.load('20px "THSarabunNew"'), fonts?.load('700 20px "THSarabunNew"')]).catch(() => {});
    await fonts?.ready;
    await Promise.all(Array.from(host.querySelectorAll("img")).map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = () => r(null); }))));
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
    const canvas = await html2canvas(host.firstElementChild as HTMLElement, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
    return new File([pdf.output("blob")], "form.pdf", { type: "application/pdf" });
  } finally {
    root.unmount();
    host.remove();
  }
}

export type BookingFileKind = "signed" | "unsigned" | "layout" | "vehicle_signed" | "vehicle_unsigned";

export async function uploadBookingFile(file: File, kind: BookingFileKind, date: string, label: string) {
  const fd = new FormData();
  fd.append("file", file); fd.append("kind", kind); fd.append("date", date); fd.append("label", label);
  const res = await authFetch("/api/booking-upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "อัปโหลดไม่สำเร็จ");
  return json.webUrl as string;
}
