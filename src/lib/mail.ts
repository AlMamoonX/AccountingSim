import { Resend } from "resend";
import { env } from "./env";

/** Sends the 6-digit sign-in code. Without RESEND_API_KEY (local development) the code is printed to the server log. */
export async function sendLoginCode(email: string, code: string, minutes: number) {
  const subject = `Your AccountingSim code: ${code}`;
  const text = `Your AccountingSim sign-in code is ${code}.\n\nIt works for ${minutes} minutes. If you didn't ask for it, ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;color:#1A0F3C">
  <p>Your AccountingSim sign-in code is</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;font-family:monospace">${code}</p>
  <p>It works for ${minutes} minutes. If you didn't ask for it, ignore this email.</p></div>`;

  if (!env.resendKey) {
    console.log(`\n[dev] Sign-in code for ${email}: ${code}\n`);
    return;
  }
  const resend = new Resend(env.resendKey);
  const { error } = await resend.emails.send({ from: env.mailFrom, to: email, subject, text, html });
  if (error) throw new Error(`${error.name}: ${error.message}`);
}
