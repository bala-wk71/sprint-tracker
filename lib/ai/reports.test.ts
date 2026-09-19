import { describe, expect, it } from "vitest";
import { proposalSchema, repairGlyphs, reportWordsSchema } from "./reports";

describe("repairGlyphs", () => {
  it("puts back dashes and rupee signs the model returned as line breaks", () => {
    expect(repairGlyphs("reached the 93\n93.5 kg checkpoint")).toBe("reached the 93–93.5 kg checkpoint");
    expect(repairGlyphs("up by \n13,000 to \n1.08 L")).toBe("up by ₹13,000 to ₹1.08 L");
    expect(repairGlyphs("first line\nsecond")).toBe("first line second");
    expect(repairGlyphs("89–90 kg, ₹1.1 L")).toBe("89–90 kg, ₹1.1 L");
  });

  it("runs on every text field", () => {
    const words = reportWordsSchema.parse({
      headline: "Weight 89\n90 kg",
      streams: [{ name: "Health", summary: "Profit \n1.1 L", nextFocus: "a\nb" }],
      nextFocus: "",
    });
    expect(words.headline).toBe("Weight 89–90 kg");
    expect(words.streams[0]).toEqual({ name: "Health", summary: "Profit ₹1.1 L", nextFocus: "a b" });
    const [item] = proposalSchema.parse([{ ref: "D1", title: "Q4 2026: weight to 91\n92 kg", projects: ["Visit \n5 dealers"] }]);
    expect(item.title).toBe("Q4 2026: weight to 91–92 kg");
    expect(item.why).toBe("");
  });
});
