import { describe, expect, it } from "vitest";
import { parseCashewCsv, toIsoDate } from "./cashewCsv";
import { monthRange, shiftMonth, summariseMonth, TOTAL_BUDGET } from "./summary";

const HEADER =
  "account,amount,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective";

describe("parseCashewCsv", () => {
  it("reads expenses as positive amounts and flags income", () => {
    const csv = [
      HEADER,
      'Bank,-250.5,INR,"Lunch, canteen",,2026-10-03 13:45:00.000,false,null,Dining,,,,,,',
      "Bank,50000,INR,Salary,,2026-10-01 09:00:00.000,true,null,Income,,,,,,",
    ].join("\n");
    const { txns, skipped } = parseCashewCsv(csv);
    expect(skipped).toBe(0);
    expect(txns).toHaveLength(2);
    expect(txns[0]).toMatchObject({
      txn_date: "2026-10-03",
      amount: 250.5,
      is_income: false,
      category: "Dining",
      title: "Lunch, canteen",
      currency: "INR",
    });
    expect(txns[1].is_income).toBe(true);
  });

  it("gives the same row the same key every time, and twins different keys", () => {
    const row = "Bank,-40,INR,Tea,,2026-10-03 10:00:00.000,false,null,Dining,,,,,,";
    const once = parseCashewCsv([HEADER, row].join("\n")).txns;
    const twice = parseCashewCsv([HEADER, row, row].join("\n")).txns;
    expect(twice[0].external_key).toBe(once[0].external_key);
    expect(twice[1].external_key).not.toBe(twice[0].external_key);
  });

  it("skips zero amounts, bad dates and balance corrections", () => {
    const csv = [
      HEADER,
      "Bank,0,INR,Nothing,,2026-10-03 10:00:00.000,false,null,Dining,,,,,,",
      "Bank,-10,INR,Bad,,someday,false,null,Dining,,,,,,",
      "Bank,-900,INR,Fix,,2026-10-03 10:00:00.000,false,null,Balance Correction,,,,,,",
    ].join("\n");
    const { txns, skipped } = parseCashewCsv(csv);
    expect(txns).toHaveLength(0);
    expect(skipped).toBe(3);
  });

  it("rejects a file that is not a Cashew export", () => {
    expect(parseCashewCsv("name,weight\nme,70").error).toBeTruthy();
  });

  it("reads several date shapes", () => {
    expect(toIsoDate("2026-10-03T10:00:00Z")).toBe("2026-10-03");
    expect(toIsoDate("3/10/2026")).toBe("2026-10-03");
    expect(toIsoDate("nope")).toBeNull();
  });
});

describe("summariseMonth", () => {
  const txns = [
    { amount: 300, is_income: false, category: "Dining" },
    { amount: 900, is_income: false, category: "Dining" },
    { amount: 400, is_income: false, category: "Travel" },
    { amount: 5000, is_income: true, category: "Income" },
  ];

  it("totals spending and income separately", () => {
    const s = summariseMonth(txns, []);
    expect(s.spent).toBe(1600);
    expect(s.income).toBe(5000);
    expect(s.limit).toBeNull();
    expect(s.left).toBeNull();
  });

  it("flags a category that went over and sums category limits", () => {
    const s = summariseMonth(txns, [
      { category: "Dining", monthly_limit: 1000 },
      { category: "Travel", monthly_limit: 2000 },
    ]);
    expect(s.limit).toBe(3000);
    expect(s.left).toBe(1400);
    expect(s.overCount).toBe(1);
    expect(s.categories[0]).toMatchObject({ category: "Dining", over: true, pct: 100 });
  });

  it("lets the whole-month budget override the sum", () => {
    const s = summariseMonth(txns, [
      { category: TOTAL_BUDGET, monthly_limit: 2000 },
      { category: "Dining", monthly_limit: 1000 },
    ]);
    expect(s.limit).toBe(2000);
    expect(s.pct).toBe(80);
    expect(s.categories.some((c) => c.category === TOTAL_BUDGET)).toBe(false);
  });
});

describe("month helpers", () => {
  it("finds the last day of a month", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("steps across a year boundary", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
