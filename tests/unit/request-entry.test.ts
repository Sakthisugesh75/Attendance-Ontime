import { describe, expect, it } from "vitest";
import { checkPermission, enteredNoticeTitle, speakAbout } from "@/lib/validations/requests";

describe("speakAbout: rule messages reworded when HR enters a request", () => {
  it("talks about the employee instead of 'you'", () => {
    expect(speakAbout("You joined on 12 Feb 2024. Pick a date from then on.", "Anitha Raman")).toBe("Anitha Raman joined on 12 Feb 2024. Pick a date from then on.");
    expect(speakAbout("Your last working day is 30 Nov 2026.", "Anitha Raman")).toBe("Anitha Raman's last working day is 30 Nov 2026.");
    expect(speakAbout("Clashes with your leave request for 10 Nov 2026 (approved).", "Anitha Raman")).toBe("Clashes with Anitha Raman's leave request for 10 Nov 2026 (approved).");
  });

  it("rewords the monthly permission cap message", () => {
    const msg = checkPermission("16:00", "17:00", 2, { permissionPerMonth: 2, permissionMaxMinutes: 120 })!;
    expect(speakAbout(msg, "Anitha Raman")).toBe("Anitha Raman has already used 2 permissions this month (the monthly limit).");
  });

  it("leaves messages without 'you' alone and doesn't touch words containing it", () => {
    expect(speakAbout("A permission can be at most 2h.", "Anitha")).toBe("A permission can be at most 2h.");
    expect(speakAbout("Those dates are all weekly offs or holidays.", "Anitha")).toBe("Those dates are all weekly offs or holidays.");
    expect(speakAbout("Layout yours youth", "Anitha")).toBe("Layout yours youth");
  });
});

describe("enteredNoticeTitle", () => {
  it("says what HR recorded, and whether it is approved", () => {
    expect(enteredNoticeTitle("PERMISSION", true)).toBe("HR recorded a permission for you");
    expect(enteredNoticeTitle("LEAVE", true)).toBe("HR recorded leave for you");
    expect(enteredNoticeTitle("REGULARIZATION", true)).toBe("HR recorded a punch fix for you");
    expect(enteredNoticeTitle("WFH", false)).toBe("HR raised a work from home request for you");
  });
});
