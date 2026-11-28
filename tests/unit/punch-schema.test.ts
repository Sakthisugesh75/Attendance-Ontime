import { describe, expect, it } from "vitest";
import { punchSchema } from "@/lib/validations/punch";

const location = { lat: 11.0168, lng: 76.9558, accuracy: 12 };

describe("punchSchema via", () => {
  it("defaults to a normal punch when via is missing", () => {
    const r = punchSchema.parse({ location, selfie: null });
    expect(r.via).toBeUndefined();
  });

  it("accepts an arrival-notification punch", () => {
    expect(punchSchema.parse({ location, selfie: null, via: "arrival" }).via).toBe("arrival");
  });

  it("rejects unknown sources", () => {
    expect(punchSchema.safeParse({ location, selfie: null, via: "import" }).success).toBe(false);
  });
});
