// path: app/api/visitors/photo/route.ts — ลิงก์รูปหน้าผู้มาติดต่อ (เฉพาะแอดมิน)
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/visitor-server";
import { getMe } from "@/lib/visitors/admin-auth";

export async function GET(req: Request) {
  const me = await getMe(req);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const db = adminClient();
  const { data: v } = await db.from("visitors").select("photo_path").eq("id", id).maybeSingle();
  if (!v?.photo_path) return NextResponse.json({ error: "no photo" }, { status: 404 });

  const { data } = await db.storage.from("visitor-photos").createSignedUrl(v.photo_path, 300);
  return NextResponse.json({ url: data?.signedUrl ?? null });
}