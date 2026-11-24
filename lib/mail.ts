import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { createTransport } from "nodemailer";
import { getAdminDb } from "@/lib/firebase-admin";

// Plain strings only, so the message can be logged to Firestore as-is.
type Message = { to: string; subject: string; text: string; html: string };

let transporter: ReturnType<typeof createSmtpTransport> | undefined;

function createSmtpTransport() {
  const { SMTP_EMAIL, SMTP_ENDPOINT, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD } = process.env;
  if (!SMTP_EMAIL || !SMTP_ENDPOINT || !SMTP_PORT || !SMTP_USERNAME || !SMTP_PASSWORD) {
    throw new Error("SMTP_* environment variables are not set");
  }
  return createTransport(
    {
      host: SMTP_ENDPOINT,
      port: Number(SMTP_PORT),
      // 465 is implicit TLS; other ports must upgrade with STARTTLS before AUTH.
      secure: SMTP_PORT === "465",
      requireTLS: true,
      auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
    },
    { from: SMTP_EMAIL },
  );
}

export async function sendMail(message: Message) {
  transporter ??= createSmtpTransport();
  const info = await transporter.sendMail(message);
  try {
    await getAdminDb()
      .collection("email")
      .add({
        ...message,
        messageId: info.messageId,
        response: info.response,
        sentAt: FieldValue.serverTimestamp(),
      });
  } catch (error) {
    // The email is already sent; a logging failure must not fail (and roll back) the caller.
    console.error("[mail] Failed to log sent email", error);
  }
  return info;
}
