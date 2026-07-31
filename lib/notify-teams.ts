// lib/notify-teams.ts
export async function notifyTeams(params: {
  title: string;
  message: string;
  facts?: Record<string, any>;
}) {
  try {
    await fetch("/api/notify-teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch (err) {
    console.error("[notifyTeams] ส่งไม่สำเร็จ:", err);
  }
}