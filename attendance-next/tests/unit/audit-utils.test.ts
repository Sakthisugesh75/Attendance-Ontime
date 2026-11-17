import { describe, expect, it } from "vitest";
import { NAV } from "@/components/layout/nav";
import { auditQueryString, csvCell, diffAudit, formatJsonValue, jsonEqual, parseAuditParams, toCsv } from "@/components/audit/audit-utils";
import { escapeHtml, renderEmail } from "@/lib/email-template";
import { PERMISSION_KEYS, SYSTEM_ROLES } from "@/lib/access/permissions";
import { breadcrumbsFor, filterPalette, navFor, paletteScore } from "@/lib/palette";

describe("diffAudit", () => {
  it("returns nothing when there is no before or after", () => {
    expect(diffAudit(null, null)).toEqual([]);
    expect(diffAudit(undefined, undefined)).toEqual([]);
  });

  it("marks changed, unchanged, added and removed keys", () => {
    const rows = diffAudit({ fullName: "Anitha", phone: "9876500002", status: "ACTIVE" }, { fullName: "Anitha Raman", status: "ACTIVE", exitDate: "2026-12-31" });
    expect(rows.map((r) => [r.key, r.kind])).toEqual([
      ["fullName", "changed"],
      ["phone", "removed"],
      ["status", "same"],
      ["exitDate", "added"],
    ]);
    expect(rows[0]).toMatchObject({ before: "Anitha", after: "Anitha Raman" });
    expect(rows[1]).toMatchObject({ before: "9876500002", after: null });
  });

  it("treats a create as all-added and a delete as all-removed", () => {
    expect(diffAudit(null, { code: "EMP001" })).toEqual([{ key: "code", before: null, after: "EMP001", kind: "added", multiline: false }]);
    expect(diffAudit({ code: "EMP001" }, null)[0]).toMatchObject({ kind: "removed", before: "EMP001", after: null });
  });

  it("compares nested JSON structurally and pretty-prints it", () => {
    const [same] = diffAudit({ geo: { lat: 1, lng: 2 } }, { geo: { lng: 2, lat: 1 } });
    expect(same!.kind).toBe("same");
    const [changed] = diffAudit({ counts: { ok: 1 } }, { counts: { ok: 2 } });
    expect(changed!.kind).toBe("changed");
    expect(changed!.multiline).toBe(true);
    expect(changed!.after).toBe('{\n  "ok": 2\n}');
  });

  it("distinguishes null from a missing key and keeps falsy values", () => {
    const rows = diffAudit({ managerId: null, active: false, count: 0 }, { managerId: 4, active: false, count: 0 });
    expect(rows.find((r) => r.key === "managerId")).toMatchObject({ kind: "changed", before: "null", after: "4" });
    expect(rows.filter((r) => r.kind === "same").map((r) => r.after)).toEqual(["false", "0"]);
  });

  it("falls back to a single row for non-object values", () => {
    expect(diffAudit([1, 2], [1, 2, 3])).toEqual([{ key: "(value)", before: "[\n  1,\n  2\n]", after: "[\n  1,\n  2,\n  3\n]", kind: "changed", multiline: true }]);
    expect(diffAudit("a", "a")[0]!.kind).toBe("same");
  });

  it("jsonEqual and formatJsonValue", () => {
    expect(jsonEqual([1, { a: 1 }], [1, { a: 1 }])).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
    expect(formatJsonValue("text")).toBe("text");
    expect(formatJsonValue(true)).toBe("true");
  });
});

describe("CSV", () => {
  it("leaves plain values alone and quotes commas, quotes and newlines", () => {
    expect(csvCell("LOGIN")).toBe("LOGIN");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
    expect(csvCell("Raman, Anitha")).toBe('"Raman, Anitha"');
    expect(csvCell('said "hi"')).toBe('"said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(" padded")).toBe('" padded"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+91 98765")).toBe("'+91 98765");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("serialises objects as JSON and joins rows with CRLF", () => {
    expect(csvCell({ a: 1, b: "x" })).toBe('"{""a"":1,""b"":""x""}"');
    expect(toCsv([["A", "B"], ["1", "x,y"]])).toBe('A,B\r\n1,"x,y"\r\n');
  });
});

describe("audit URL params", () => {
  it("parses valid filters and drops junk", () => {
    expect(parseAuditParams({ from: "2026-11-01", to: "bad", actor: "12", action: "LOGIN", page: "3" })).toEqual({ from: "2026-11-01", to: undefined, actor: "12", entity: undefined, action: "LOGIN", q: undefined, page: 3 });
    expect(parseAuditParams({ actor: "drop table", page: "-4" })).toMatchObject({ actor: undefined, page: 1 });
    expect(parseAuditParams({ actor: "system", q: "" })).toMatchObject({ actor: "system", q: undefined });
  });

  it("swaps a reversed date range", () => {
    expect(parseAuditParams({ from: "2026-11-10", to: "2026-11-01" })).toMatchObject({ from: "2026-11-01", to: "2026-11-10" });
  });

  it("builds the export query string without the page", () => {
    expect(auditQueryString(parseAuditParams({ action: "LOGIN", q: "a b", page: "2" }))).toBe("action=LOGIN&q=a+b");
  });
});

describe("command palette", () => {
  const pages = navFor(NAV, { isSuperAdmin: true, permissions: PERMISSION_KEYS, hasEmployee: true, writesReports: true }).map((i) => ({ ...i, id: i.href, group: i.section }));

  it("filters NAV by permission", () => {
    const employee = navFor(NAV, { isSuperAdmin: false, permissions: [...SYSTEM_ROLES.EMPLOYEE.permissions] }).map((i) => i.href);
    expect(employee).toContain("/dashboard");
    expect(employee).not.toContain("/employees");
    expect(employee).not.toContain("/audit-log");
    const hr = navFor(NAV, { isSuperAdmin: false, permissions: [...SYSTEM_ROLES.HR.permissions] }).map((i) => i.href);
    expect(hr).toContain("/muster");
    expect(hr).not.toContain("/audit-log");
    expect(hr).not.toContain("/access");
    const lead = navFor(NAV, { isSuperAdmin: false, permissions: ["employees.view", "reports.view"] }).map((i) => i.href);
    expect(lead).toEqual(expect.arrayContaining(["/employees", "/reports"]));
    expect(lead).not.toContain("/muster");
    expect(navFor(NAV, { isSuperAdmin: true, permissions: [] }).map((i) => i.href)).toContain("/access");
    expect(navFor(NAV, null).every((i) => !i.perm)).toBe(true);
  });

  it("shows own pages only to people with an employee record, and Daily reports to writers or reviewers", () => {
    const base = { isSuperAdmin: false, permissions: [...SYSTEM_ROLES.EMPLOYEE.permissions] };
    const writer = navFor(NAV, { ...base, hasEmployee: true, writesReports: true }).map((i) => i.href);
    expect(writer).toEqual(expect.arrayContaining(["/attendance", "/requests", "/daily-reports"]));
    const noReports = navFor(NAV, { ...base, hasEmployee: true, writesReports: false }).map((i) => i.href);
    expect(noReports).toContain("/requests");
    expect(noReports).not.toContain("/daily-reports");
    // An owner sign-in without an employee record: approvals and team reports through permissions only.
    const owner = navFor(NAV, { isSuperAdmin: false, permissions: ["requests.approve", "dailyreports.review"], hasEmployee: false }).map((i) => i.href);
    expect(owner).toEqual(expect.arrayContaining(["/requests", "/daily-reports"]));
    expect(owner).not.toContain("/attendance");
  });

  it("matches labels first, then keywords", () => {
    expect(filterPalette(pages, "Muster")[0]!.href).toBe("/muster");
    expect(filterPalette(pages, "roll")[0]!.href).toBe("/muster");
    expect(filterPalette(pages, "payroll").map((p) => p.href)).toEqual(["/reports"]);
    expect(filterPalette(pages, "audit")[0]!.href).toBe("/audit-log");
    // "who" is a keyword of the audit log only
    expect(filterPalette(pages, "who").map((p) => p.href)).toEqual(["/audit-log"]);
  });

  it("requires every word and is case/space insensitive", () => {
    expect(filterPalette(pages, "  MY   attendance ")[0]!.href).toBe("/attendance");
    expect(filterPalette(pages, "muster zzz")).toEqual([]);
    expect(filterPalette(pages, "")).toEqual(pages);
  });

  it("ranks a label prefix above a keyword hit", () => {
    expect(paletteScore({ id: "a", label: "Holidays" }, "hol")).toBeGreaterThan(paletteScore({ id: "b", label: "Other", keywords: "holiday" }, "hol"));
  });
});

describe("breadcrumbs", () => {
  it("shows section › page for sidebar pages", () => {
    expect(breadcrumbsFor("/muster", NAV)).toEqual([{ label: "People" }, { label: "Muster roll" }]);
    expect(breadcrumbsFor("/audit-log/", NAV)).toEqual([{ label: "Admin" }, { label: "Audit log" }]);
  });

  it("shows list › Profile for detail pages", () => {
    expect(breadcrumbsFor("/employees/12", NAV)).toEqual([{ label: "Employees", href: "/employees" }, { label: "Profile" }]);
  });

  it("handles pages outside the sidebar", () => {
    expect(breadcrumbsFor("/notifications", NAV)).toEqual([{ label: "Notifications" }]);
    expect(breadcrumbsFor("/nope", NAV)).toEqual([]);
  });
});

describe("email template", () => {
  it("escapes content and includes a plain-text part", () => {
    const { html, text } = renderEmail({ company: "Acme & Co", title: "Hi <b>", body: "Line 1\nLine 2", url: "https://x.test/attendance" });
    expect(html).toContain("Acme &amp; Co");
    expect(html).toContain("Hi &lt;b&gt;");
    expect(html).toContain("Line 1<br>Line 2");
    expect(html).toContain('href="https://x.test/attendance"');
    expect(text).toContain("Line 1\nLine 2");
    expect(text).toContain("https://x.test/attendance");
  });

  it("drops non-http links", () => {
    const { html } = renderEmail({ company: "A", title: "t", body: "b", url: "javascript:alert(1)" });
    expect(html).not.toContain("javascript:");
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });
});
