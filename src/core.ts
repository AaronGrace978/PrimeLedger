export type Entry = {
  id: string;
  kind: "income" | "expense" | "w2";
  date: string;
  name: string;
  amount: number;
  category: string;
  contractId: string;
  note: string;
};
export type Contract = {
  id: string;
  client: string;
  title: string;
  value: number;
  due: string;
  status: "Active" | "Completed" | "Draft";
  note: string;
};
export type Document = {
  id: string;
  name: string;
  kind: string;
  contractId: string;
  date: string;
  note: string;
  fileName: string;
  mime: string;
  data: string;
};
export type Ledger = {
  version: 1;
  entries: Entry[];
  contracts: Contract[];
  documents: Document[];
};
export const emptyLedger = (): Ledger => ({
  version: 1,
  entries: [],
  contracts: [],
  documents: [],
});
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export function cents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw Error(
      "Enter a positive dollar amount with at most two decimal places.",
    );
  const n = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 1e12)
    throw Error("Amount must be between $0.01 and $10 billion.");
  return n;
}
export function totals(ledger: Ledger, year: number) {
  const e = ledger.entries.filter((e) => e.date.startsWith(String(year)));
  const sum = (kind: Entry["kind"]) =>
    e.filter((e) => e.kind === kind).reduce((a, e) => a + e.amount, 0);
  return {
    income: sum("income"),
    expenses: sum("expense"),
    w2: sum("w2"),
    profit: sum("income") - sum("expense"),
  };
}
export function reserve(
  profit: number,
  wages: number,
  federal: number,
  state: number,
  paid: number,
  wageBase: number,
) {
  const net = Math.max(0, profit) * 0.9235;
  const social = Math.min(net, Math.max(0, wageBase - wages)) * 0.124;
  const medicare = net * 0.029;
  const se = social + medicare;
  const taxable = Math.max(0, profit - se / 2);
  const income = (taxable * (federal + state)) / 100;
  const total = Math.round(se + income);
  return {
    se: Math.round(se),
    income: Math.round(income),
    total,
    remaining: Math.max(0, total - paid),
    quarter: Math.round(Math.max(0, total - paid) / 4),
  };
}
export function validateLedger(raw: unknown): Ledger {
  const x = raw as Ledger;
  if (
    !x ||
    x.version !== 1 ||
    !Array.isArray(x.entries) ||
    !Array.isArray(x.contracts) ||
    !Array.isArray(x.documents)
  )
    throw Error("Not a PrimeLedger v1 backup.");
  const str = (v: unknown, max = 10000) =>
    typeof v === "string" && v.length <= max;
  const date = (v: unknown) =>
    str(v, 10) &&
    /^\d{4}-\d{2}-\d{2}$/.test(v as string) &&
    !Number.isNaN(Date.parse(v as string)) &&
    new Date(v as string).toISOString().slice(0, 10) === v;
  const amount = (v: unknown) =>
    Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 1e12;
  const ids = new Set<string>();
  const id = (v: unknown) => {
    if (!str(v, 100) || !v || ids.has(v as string)) return false;
    ids.add(v as string);
    return true;
  };
  if (x.entries.length + x.contracts.length + x.documents.length > 50000)
    throw Error("Backup contains too many records.");
  if (
    !x.entries.every(
      (e) =>
        e &&
        id(e.id) &&
        ["income", "expense", "w2"].includes(e.kind) &&
        date(e.date) &&
        str(e.name, 200) &&
        amount(e.amount) &&
        str(e.category, 100) &&
        str(e.contractId, 100) &&
        str(e.note),
    )
  )
    throw Error("Invalid transaction records.");
  if (
    !x.contracts.every(
      (c) =>
        c &&
        id(c.id) &&
        str(c.client, 200) &&
        str(c.title, 200) &&
        amount(c.value) &&
        date(c.due) &&
        ["Active", "Completed", "Draft"].includes(c.status) &&
        str(c.note),
    )
  )
    throw Error("Invalid contract records.");
  if (
    !x.documents.every(
      (d) =>
        d &&
        id(d.id) &&
        str(d.name, 200) &&
        str(d.kind, 100) &&
        str(d.contractId, 100) &&
        date(d.date) &&
        str(d.note) &&
        str(d.fileName, 255) &&
        str(d.mime, 200) &&
        str(d.data, 15e6) &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(d.data),
    )
  )
    throw Error("Invalid document records.");
  return {
    version: 1,
    entries: x.entries,
    contracts: x.contracts,
    documents: x.documents,
  };
}
export function csv(entries: Entry[]) {
  return (
    "\ufeff" +
    [
      ["Date", "Type", "Description", "Category", "Amount USD", "Notes"],
      ...entries.map((e) => [
        e.date,
        e.kind,
        e.name,
        e.category,
        (e.amount / 100).toFixed(2),
        e.note,
      ]),
    ]
      .map((row) =>
        row
          .map(
            (s) =>
              '"' +
              (/^[=+\-@\t\r]/.test(s) ? "'" : "") +
              s.replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
