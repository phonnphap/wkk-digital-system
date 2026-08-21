import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = new TextEncoder().encode(process.env.STUDENT_JWT_SECRET!);
const COOKIE_NAME = "student_session";
const EXPIRES_IN = "12h";

export async function issueStudentSession(studentId: string) {
  const token = await new SignJWT({ student_id: studentId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function getStudentSession(): Promise<{ student_id: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return { student_id: payload.student_id as string };
  } catch {
    return null;
  }
}

export async function clearStudentSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}