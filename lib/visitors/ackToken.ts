import { createHmac, timingSafeEqual } from "crypto";

const secret = () => {
  const s = process.env.ACK_SECRET;
  if (!s) throw new Error("ACK_SECRET is not set");
  return s;
};

export function signAck(visitorId: string) {
  return createHmac("sha256", secret()).update(visitorId).digest("hex");
}

export function verifyAck(visitorId: string, token: string) {
  try {
    const a = Buffer.from(signAck(visitorId), "hex");
    const b = Buffer.from(token, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}