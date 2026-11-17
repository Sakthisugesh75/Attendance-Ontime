import { describe, expect, it } from "vitest";
import { planBalance, quotaFor, type BalanceFigures, type QuotaRule } from "@/lib/leave-allocation";

const EL = { id: 3, yearlyQuota: 12, carryForward: true, maxCarryForward: 10 };
const CL = { id: 1, yearlyQuota: 12, carryForward: false, maxCarryForward: 0 };
const dev = { id: 7, designationId: 2, joiningYear: 2024 };
const rules: QuotaRule[] = [
  { leaveTypeId: 3, designationId: 2, employeeId: null, yearlyQuota: 15 }, // designation: 15 EL
  { leaveTypeId: 3, designationId: null, employeeId: 9, yearlyQuota: 20 }, // one person: 20 EL
];
const none = () => undefined;
const rows = (byYear: Record<number, BalanceFigures>) => (y: number) => byYear[y];

describe("quotaFor", () => {
  it("person beats designation beats the leave type", () => {
    expect(quotaFor(EL, { id: 9, designationId: 2 }, rules)).toEqual({ quota: 20, source: "person" });
    expect(quotaFor(EL, { id: 7, designationId: 2 }, rules)).toEqual({ quota: 15, source: "designation" });
    expect(quotaFor(EL, { id: 8, designationId: 5 }, rules)).toEqual({ quota: 12, source: "default" });
    expect(quotaFor(EL, { id: 8, designationId: null }, rules)).toEqual({ quota: 12, source: "default" });
  });
  it("only rules for the same leave type count", () => {
    expect(quotaFor(CL, { id: 9, designationId: 2 }, rules)).toEqual({ quota: 12, source: "default" });
  });
});

describe("planBalance: carry forward", () => {
  it("nothing carries in the joining year", () => {
    expect(planBalance(EL, dev, rules, 2024, none)).toEqual({ allotted: 15, carriedForward: 0 });
  });

  it("carries last year's unused days from the stored balance", () => {
    const r = rows({ 2025: { allotted: 15, carriedForward: 0, used: 9 } });
    expect(planBalance(EL, dev, rules, 2026, r)).toEqual({ allotted: 15, carriedForward: 6 });
  });

  it("caps the carry at the type's maximum", () => {
    const r = rows({ 2025: { allotted: 15, carriedForward: 10, used: 2 } });
    expect(planBalance(EL, dev, rules, 2026, r).carriedForward).toBe(10);
  });

  it("a year with no stored balance counts as untouched (all unused), even if nobody allocated it", () => {
    // 2024: 15 allotted, none used → 2025 carries 10 (cap) → 2026: 15 + 10 unused → carries 10.
    expect(planBalance(EL, dev, rules, 2025, none)).toEqual({ allotted: 15, carriedForward: 10 });
    expect(planBalance(EL, dev, rules, 2026, none)).toEqual({ allotted: 15, carriedForward: 10 });
  });

  it("over-used years carry nothing (never negative)", () => {
    const r = rows({ 2025: { allotted: 12, carriedForward: 0, used: 14 } });
    expect(planBalance(EL, { ...dev, designationId: null }, [], 2026, r).carriedForward).toBe(0);
  });

  it("types without carry forward never carry", () => {
    const r = rows({ 2025: { allotted: 12, carriedForward: 0, used: 1 } });
    expect(planBalance(CL, dev, rules, 2026, r)).toEqual({ allotted: 12, carriedForward: 0 });
  });

  it("half days carry exactly", () => {
    const r = rows({ 2025: { allotted: 12, carriedForward: 0, used: 8.5 } });
    expect(planBalance(EL, { ...dev, designationId: null }, [], 2026, r).carriedForward).toBe(3.5);
  });

  it("a long untouched history stays bounded and still carries the cap", () => {
    const old = { ...dev, joiningYear: 1990 };
    expect(planBalance(EL, old, rules, 2026, none)).toEqual({ allotted: 15, carriedForward: 10 });
  });
});
