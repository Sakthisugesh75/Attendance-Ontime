import type { AttendanceStatus } from "@prisma/client";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseWorkbook } from "@/lib/excel/parse-workbook";
import { buildMusterWorkbook, dottedDate, dottedTime, musterMonths, sheetName } from "@/lib/reports/muster-xlsx";
import type { DayFacts, EmployeeDays } from "@/lib/reports/types";
import { addDays, weekdayOf } from "@/lib/time";

function day(date: string, status: AttendanceStatus | null, extra: Partial<DayFacts> = {}): DayFacts {
  return {
    date,
    status,
    flags: [],
    workedMinutes: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    inMin: null,
    outMin: null,
    holiday: null,
    weeklyOff: false,
    future: false,
    leave: null,
    remarks: null,
    shiftStart: 570,
    hasRecord: true,
    source: "WEB",
    overridden: false,
    ...extra,
  };
}

const HOLIDAYS: Record<string, string> = { "2026-10-02": "Gandhi Jayanti", "2026-10-20": "Ayudha Puja" };

/**
 * Two people over 30 Sep – 3 Nov 2026 (three sheets). Lakshmi has every kind of day;
 * Divya joins on 12 Oct, so she is "not joined" before that.
 */
function fixture(): EmployeeDays[] {
  const dates: string[] = [];
  for (let d = "2026-09-30"; d <= "2026-11-03"; d = addDays(d, 1)) dates.push(d);
  const off = (d: string) => (HOLIDAYS[d] ? day(d, "HOLIDAY", { holiday: HOLIDAYS[d] }) : weekdayOf(d) === 0 ? day(d, "WEEKLY_OFF", { weeklyOff: true }) : null);

  const lakshmi = dates.map((d, i) => {
    const o = off(d);
    if (o) return o;
    if (d === "2026-10-06") return day(d, "LEAVE");
    if (d === "2026-10-07") return day(d, "WFH", { inMin: 560, outMin: 1100 });
    if (d === "2026-10-08") return day(d, "ON_DUTY");
    if (d === "2026-10-09") return day(d, "HALF_DAY", { inMin: 570, outMin: 840 });
    if (d === "2026-10-13") return day(d, "PERMISSION", { inMin: 660, outMin: 1110 });
    if (d === "2026-10-14") return day(d, "ABSENT");
    if (d === "2026-10-15") return day(d, "MISSING_PUNCH_OUT", { inMin: 575 });
    if (d === "2026-10-16") return day(d, "PRESENT", { inMin: 570, outMin: 1110, remarks: "Client meeting at 5" });
    if (d === "2026-11-03") return day(d, null, { future: true });
    return day(d, i % 3 ? "PRESENT" : "LATE", { inMin: 555 + (i % 40), outMin: 1100 + (i % 25) });
  });
  const divya = dates.map((d, i) => {
    if (d < "2026-10-12") return day(d, "NOT_JOINED", { hasRecord: false });
    const o = off(d);
    if (o) return o;
    if (d === "2026-11-03") return day(d, null, { future: true });
    return day(d, "PRESENT", { inMin: 565 + (i % 20), outMin: 1110 + (i % 30) });
  });
  // Divya worked on the Sunday 25 Oct, so that row isn't an off day for everyone.
  const sunday = divya.findIndex((x) => x.date === "2026-10-25");
  divya[sunday] = day("2026-10-25", "PRESENT", { weeklyOff: true, inMin: 600, outMin: 840 });

  return [
    { employee: { id: 1, code: "EMP001", name: "Lakshmi Narayanan", department: "HR" }, days: lakshmi },
    { employee: { id: 6, code: "EMP006", name: "Divya Sundar", department: "Operations" }, days: divya },
  ];
}

async function roundTrip(wb: ExcelJS.Workbook) {
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf as ArrayBuffer);
  return { back, parsed: parseWorkbook(back) };
}

describe("muster export (familiar layout)", () => {
  it("formats dates, times and sheet names like the old sheet", () => {
    expect(sheetName("2026-10")).toBe("Oct 26");
    expect(dottedDate("2026-10-04")).toBe("04.10.2026");
    expect(dottedTime(585)).toBe("09.45AM");
    expect(dottedTime(1112)).toBe("06.32PM");
    expect(dottedTime(725)).toBe("12.05PM");
  });

  it("lays out names, headers and merged off days", async () => {
    const months = musterMonths(fixture(), "2026-10-01", "2026-10-31");
    const { back } = await roundTrip(buildMusterWorkbook(months, "Test Co"));
    const ws = back.getWorksheet("Oct 26")!;
    expect(ws.getCell("B1").value).toBe("Lakshmi Narayanan");
    expect(ws.getCell("E1").value).toBe("Divya Sundar");
    expect(ws.getCell("B1").isMerged && ws.getCell("D1").isMerged).toBe(true);
    expect([1, 2, 3, 4, 5, 6, 7].map((c) => ws.getRow(2).getCell(c).value)).toEqual(["Date", "In", "Out", "Remarks", "In", "Out", "Remarks"]);
    expect(ws.getCell("A3").value).toBe("01.10.2026");
    // 2 Oct: holiday merged across the row; 4 Oct: Sunday
    expect(ws.getCell("B4").value).toBe("Gandhi Jayanti");
    expect(ws.getCell("G4").isMerged).toBe(true);
    expect(ws.getCell("B6").value).toBe("Sunday");
    // 7 Oct: WFH with times
    expect([ws.getCell("B9").value, ws.getCell("C9").value, ws.getCell("D9").value]).toEqual(["09.20AM", "06.20PM", "WFH"]);
  });

  it("round-trips through the importer: same days, times and statuses", async () => {
    const list = fixture();
    const months = musterMonths(list, "2026-09-30", "2026-11-03");
    expect(months.map((m) => sheetName(m.month))).toEqual(["Sep 26", "Oct 26", "Nov 26"]);
    const { parsed } = await roundTrip(buildMusterWorkbook(months));

    expect(parsed.sheets.map((s) => [s.name, s.skipped])).toEqual([
      ["Sep 26", false],
      ["Oct 26", false],
      ["Nov 26", false],
    ]);
    expect(parsed.issues.filter((i) => i.kind !== "MISSING_OUT")).toEqual([]);
    expect(parsed.firstDate).toBe("2026-09-30");

    // Off days for everyone come back as off days with their labels.
    const offs = Object.fromEntries(parsed.offDays.map((o) => [o.date, [o.kind, o.label]]));
    expect(offs["2026-10-02"]).toEqual(["HOLIDAY", "Gandhi Jayanti"]);
    expect(offs["2026-10-20"]).toEqual(["HOLIDAY", "Ayudha Puja"]);
    expect(offs["2026-10-04"]).toEqual(["WEEKLY_OFF", "Sunday"]);
    expect(offs["2026-11-01"]).toEqual(["WEEKLY_OFF", "Sunday"]);
    expect(offs["2026-10-25"]).toBeUndefined(); // Divya worked that Sunday

    // Every person-day with data matches what was exported.
    for (const { employee, days } of list) {
      const person = parsed.people.find((p) => p.names.includes(employee.name));
      expect(person, employee.name).toBeDefined();
      const got = new Map(parsed.entries.filter((e) => e.person === person!.key).map((e) => [e.date, e]));
      for (const d of days) {
        if (d.future || d.status === "NOT_JOINED" || offs[d.date]) {
          expect(got.has(d.date), `${employee.name} ${d.date}`).toBe(false);
          continue;
        }
        const expectedStatus = d.status && ["LEAVE", "WFH", "ON_DUTY", "PERMISSION", "HALF_DAY"].includes(d.status) ? d.status : null;
        if (d.inMin === null && d.outMin === null && !expectedStatus && !d.remarks) {
          expect(got.has(d.date), `${employee.name} ${d.date} (absent / off)`).toBe(false);
          continue;
        }
        const e = got.get(d.date);
        expect(e, `${employee.name} ${d.date}`).toBeDefined();
        expect([e!.in, e!.out, e!.status], `${employee.name} ${d.date}`).toEqual([d.inMin, d.outMin, expectedStatus]);
        if (d.remarks) expect(e!.remark).toBe(d.remarks);
      }
    }
    // Lakshmi's missing punch-out is the only flagged row.
    expect(parsed.issues.map((i) => [i.kind, i.date])).toEqual([["MISSING_OUT", "2026-10-15"]]);
  });
});
