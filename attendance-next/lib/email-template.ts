/**
 * Branded transactional email in the app's "Ink & Signal" style: an ink header band with the
 * signal-lime mark, a paper body and one ink button. Table layout + inline styles so it renders
 * in Gmail/Outlook. Always paired with a plain-text version. Pure (no server imports).
 */

export interface EmailContent {
  company: string;
  title: string;
  body: string;
  /** Absolute URL for the call to action */
  url?: string | null;
  actionLabel?: string;
}

// Design tokens (DESIGN.md §2): email clients can't read CSS variables.
const INK = "#17171a";
const PAPER = "#f5ecd6";
const CARD = "#ffffff";
const BRAND = "#151410";
const MUTED = "#63646b";
const BORDER = "#e4e4e0";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Paragraphs from blank lines, <br> for single newlines; everything escaped. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font:15px/1.6 ${FONT};color:${INK};">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function renderEmail({ company, title, body, url, actionLabel = "Open in Attendance" }: EmailContent): { html: string; text: string } {
  const safeUrl = url && /^https?:\/\//i.test(url) ? url : null;
  const text = [title, "", body, ...(safeUrl ? ["", `${actionLabel}: ${safeUrl}`] : []), "", "—", `${company} · Attendance`, "This is an automatic message; replies aren't read."].join("\n");

  const button = safeUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td style="border-radius:10px;background:${BRAND};">
        <a href="${escapeHtml(safeUrl)}" style="display:inline-block;padding:11px 20px;font:600 14px/1 ${FONT};color:${PAPER};text-decoration:none;border-radius:10px;">${escapeHtml(actionLabel)} &rarr;</a>
      </td></tr></table>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<span style="display:none!important;opacity:0;color:transparent;max-height:0;overflow:hidden;">${escapeHtml(body.slice(0, 120))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="background:${BRAND};border-radius:16px 16px 0 0;padding:18px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:28px;height:28px;background:#ffffff;border-radius:7px;text-align:center;vertical-align:middle;font:700 14px/28px ${FONT};color:${BRAND};">&#9719;</td>
        <td style="padding-left:12px;font:600 15px/1.2 ${FONT};color:#fafaf5;">${escapeHtml(company)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${CARD};border:1px solid ${BORDER};border-top:0;border-radius:0 0 16px 16px;padding:28px 24px 24px;">
      <p style="margin:0 0 8px;font:500 10.5px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">Attendance</p>
      <h1 style="margin:0 0 16px;font:600 21px/1.3 ${FONT};letter-spacing:-.02em;color:${INK};">${escapeHtml(title)}</h1>
      ${paragraphs(body)}
      ${button}
    </td></tr>
    <tr><td style="padding:16px 8px;font:12px/1.5 ${FONT};color:${MUTED};text-align:center;">
      ${escapeHtml(company)} &middot; Attendance<br>This is an automatic message; replies aren&#39;t read.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  return { html, text };
}
