import { reserve, totals, type Ledger } from "./core";
export type Assumptions = {
  federal: number;
  state: number;
  paid: number;
  wageBase: number;
};
export type Snapshot = {
  income: number;
  expenses: number;
  w2: number;
  profit: number;
  se: number;
  incomeTax: number;
  total: number;
  remaining: number;
  quarter: number;
  keep: number;
};
const key = "primeledger.tax";
export function wageBaseFor(year: number): number {
  const dollars: Record<number, number> = {
    2024: 168600,
    2025: 176100,
    2026: 184500,
  };
  return (dollars[year] || 0) * 100;
}
export function defaultAssumptions(): Assumptions {
  return { federal: 22, state: 5, paid: 0, wageBase: 0 };
}
export function readAssumptions(): Assumptions {
  const fallback = defaultAssumptions();
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const x = JSON.parse(raw) as Assumptions;
    if (
      !x ||
      typeof x.federal !== "number" ||
      x.federal < 0 ||
      x.federal > 50 ||
      typeof x.state !== "number" ||
      x.state < 0 ||
      x.state > 30 ||
      !Number.isSafeInteger(x.paid) ||
      x.paid < 0 ||
      !Number.isSafeInteger(x.wageBase) ||
      x.wageBase < 0
    )
      return fallback;
    return {
      federal: x.federal,
      state: x.state,
      paid: x.paid,
      wageBase: x.wageBase,
    };
  } catch {
    return fallback;
  }
}
export function writeAssumptions(value: Assumptions) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the calculator still works for this session */
  }
}
export function snapshot(
  ledger: Ledger,
  year: number,
  assumptions: Assumptions,
): Snapshot | null {
  const base = assumptions.wageBase || wageBaseFor(year);
  if (!base) return null;
  const t = totals(ledger, year);
  const r = reserve(
    t.profit,
    t.w2,
    assumptions.federal,
    assumptions.state,
    assumptions.paid,
    base,
  );
  return {
    income: t.income,
    expenses: t.expenses,
    w2: t.w2,
    profit: t.profit,
    se: r.se,
    incomeTax: r.income,
    total: r.total,
    remaining: r.remaining,
    quarter: r.quarter,
    keep: Math.max(0, t.profit - r.remaining),
  };
}
