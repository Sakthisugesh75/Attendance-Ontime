import "server-only";
import nodemailer from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transport: nodemailer.Transporter | null = null;

/**
 * Sends an email over SMTP. Without SMTP_HOST (development) the message is printed to the
 * server log instead, so flows like password reset still work locally.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.info(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM, ...mail });
}
