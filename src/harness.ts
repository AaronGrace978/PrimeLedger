import {
  cents,
  emptyLedger,
  includedTax,
  isIsoDate,
  money,
  validateLedger,
  type Contract,
  type Entry,
  type Ledger,
} from "./core";
import { snapshot, type Assumptions, type Snapshot } from "./tax";
export const categories = [
  "Contract work",
  "Salary / wages",
  "Software",
  "Equipment",
  "Supplies",
  "Travel",
  "Meals",
  "Insurance",
  "Professional services",
  "Office",
  "Other",
] as const;
const expenseCategories = new Set<string>([
  "Software",
  "Equipment",
  "Supplies",
  "Travel",
  "Meals",
  "Insurance",
  "Professional services",
  "Office",
  "Other",
]);
const aliases: Record<string, string> = {
  contract: "Contract work",
  "contract work": "Contract work",
  "1099": "Contract work",
  consulting: "Contract work",
  salary: "Salary / wages",
  wages: "Salary / wages",
  "salary / wages": "Salary / wages",
  "w-2": "Salary / wages",
  w2: "Salary / wages",
  software: "Software",
  saas: "Software",
  equipment: "Equipment",
  supplies: "Supplies",
  "office supplies": "Supplies",
  travel: "Travel",
  meals: "Meals",
  meal: "Meals",
  insurance: "Insurance",
  "professional services": "Professional services",
  legal: "Professional services",
  accounting: "Professional services",
  office: "Office",
  rent: "Office",
  other: "Other",
};
export type PostedLine = Omit<Entry, "id">;
export type Proposal = {
  summary: string;
  lines: PostedLine[];
  warnings: string[];
};
export const postingGuide = `When the user tells you about money they received or spent, append ONE fenced block after a short explanation:

\`\`\`primeledger-postings
{"summary":"how the money was appropriated","lines":[{"kind":"income","date":"YYYY-MM-DD","name":"short description","amount":"0.00","category":"Contract work","contract":"","salesTax":null,"note":""}]}
\`\`\`

Appropriation rules:
- Record only amounts, dates, and parties the user stated in the conversation. If the amount or the purpose is missing, ask a question and omit the block.
- kind "income" is 1099 or contract money received. kind "expense" is a purchase or other business cost. kind "w2" is wages. Keep wages out of contract income.
- Split one story into multiple lines when the user divides the money across purposes or clients.
- category must be one of: ${categories.join(", ")}.
- Income uses Contract work, or Other when it is not contract work. Expenses use an expense category. W-2 uses Salary / wages, with an empty contract and salesTax null.
- contract is empty, the client's name, or "Client · Title" when the user named a saved contract. Leave it empty when they did not name one.
- amount is the positive USD total. For a purchase, amount is the total paid, and sales tax the user mentioned is included in that total. salesTax is that included portion as a USD decimal string, or null when they did not mention sales tax. Leave sales tax null on income and wages.
- Do not calculate income tax, self-employment tax, or what they should keep. The app shows the reserve from the ledger. Do not say the records are already saved.
- When the user is not describing new money, omit the block.`;
function norm(value: string) {
  return value
    .toLowerCase()
    .replace(/[·•|/,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function resolveContract(
  kind: Entry["kind"],
  raw: unknown,
  contracts: Contract[],
  loose: boolean,
) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (kind === "w2") {
    if (text && !loose) throw Error("W-2 wages stay off contracts.");
    return "";
  }
  if (!text) return "";
  if (contracts.some((c) => c.id === text)) return text;
  const n = norm(text);
  const hits = contracts.filter(
    (c) =>
      norm(`${c.client} ${c.title}`) === n ||
      norm(c.client) === n ||
      norm(c.title) === n,
  );
  if (hits.length === 1) return hits[0].id;
  if (loose) return "";
  if (hits.length > 1)
    throw Error(
      `“${text}” matches more than one contract. Use Client · Title.`,
    );
  throw Error(
    `No saved contract matches “${text}”. Add the contract first, or leave it unlinked.`,
  );
}
function categoryFor(
  kind: Entry["kind"],
  raw: unknown,
  strict: boolean,
  name: string,
  warnings: string[],
) {
  const text = typeof raw === "string" ? raw.trim() : "";
  const mapped =
    aliases[text.toLowerCase()] ||
    (categories.includes(text as (typeof categories)[number]) ? text : "");
  const fix = (category: string, message: string) => {
    if (strict) throw Error(message);
    if (text) warnings.push(`${name}: ${message}`);
    return category;
  };
  if (kind === "w2") {
    if (mapped === "Salary / wages") return "Salary / wages";
    return fix("Salary / wages", "W-2 wages use Salary / wages.");
  }
  if (kind === "income") {
    if (mapped === "Contract work" || mapped === "Other") return mapped;
    return fix("Contract work", "Contract income uses Contract work or Other.");
  }
  if (mapped && expenseCategories.has(mapped)) return mapped;
  return fix("Other", "Choose an expense category.");
}
function moneyInput(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const text = value.toFixed(2);
    if (Math.abs(value - Number(text)) > 0.001)
      throw Error(
        "Use a positive dollar amount with at most two decimal places.",
      );
    return text;
  }
  return String(value ?? "");
}
export function appropriate(
  raw: unknown,
  ledger: Ledger,
  today: string,
  mode: "model" | "receipt" | "strict",
): { line: PostedLine; warnings: string[] } {
  const x = raw as Record<string, unknown>;
  const warnings: string[] = [];
  if (
    !x ||
    typeof x !== "object" ||
    !["income", "expense", "w2"].includes(String(x.kind))
  )
    throw Error("Each record needs a type of income, expense, or w2.");
  const kind = x.kind as Entry["kind"];
  let date = x.date;
  let note = typeof x.note === "string" ? x.note.trim() : "";
  if (date === null || date === undefined || date === "") {
    if (mode === "receipt") {
      date = today;
      note =
        `${note}\nDate not visible in screenshot; today selected. Please verify.`.trim();
    } else throw Error("Each record needs a date in YYYY-MM-DD form.");
  }
  if (!isIsoDate(date))
    throw Error("Use a real calendar date in YYYY-MM-DD form.");
  const name = typeof x.name === "string" ? x.name.trim() : "";
  if (!name) throw Error("Each record needs a description.");
  if (name.length > 200) throw Error("The description is too long.");
  if (x.amount === null || x.amount === undefined || x.amount === "")
    throw Error("The amount is missing, so nothing was added.");
  const amount = cents(moneyInput(x.amount));
  const category = categoryFor(
    kind,
    x.category,
    mode === "strict",
    name,
    warnings,
  );
  const contractText =
    typeof (x.contract ?? x.contractId) === "string"
      ? String(x.contract ?? x.contractId).trim()
      : "";
  const contractId = resolveContract(
    kind,
    contractText,
    ledger.contracts,
    mode === "receipt",
  );
  if (mode === "receipt" && contractText && !contractId && kind !== "w2")
    note =
      `${note}\n“${contractText}” was not linked. Choose a contract before saving.`.trim();
  let salesTax: number | undefined;
  if (x.salesTax !== null && x.salesTax !== undefined && x.salesTax !== "") {
    const tax = includedTax(moneyInput(x.salesTax));
    if (tax > 0 && kind !== "expense")
      throw Error(
        "Sales tax is recorded on a purchase, as part of the total paid.",
      );
    if (tax > amount)
      throw Error(
        "Sales tax is included in the total paid, so it cannot be larger than that total.",
      );
    if (tax > 0) salesTax = tax;
  }
  const line: PostedLine = {
    kind,
    date,
    name,
    amount,
    category,
    contractId,
    note: note.slice(0, 10000),
    ...(salesTax ? { salesTax } : {}),
  };
  validateLedger({ ...emptyLedger(), entries: [{ ...line, id: "check" }] });
  return { line, warnings };
}
function contractWarnings(ledger: Ledger, lines: PostedLine[]) {
  const warnings: string[] = [];
  for (const c of ledger.contracts) {
    const already = ledger.entries
      .filter((e) => e.contractId === c.id && e.kind === "income")
      .reduce((a, e) => a + e.amount, 0);
    const adding = lines
      .filter((e) => e.contractId === c.id && e.kind === "income")
      .reduce((a, e) => a + e.amount, 0);
    if (adding > 0 && already + adding > c.value)
      warnings.push(
        `${c.client} · ${c.title} would show ${money(already + adding)} against an agreed value of ${money(c.value)}.`,
      );
  }
  return warnings;
}
export function extractPosting(text: string) {
  const tagged = [
    ...text.matchAll(/```primeledger-postings\s*([\s\S]*?)```/gi),
  ];
  if (tagged.length > 1)
    throw Error("The reply included more than one posting block.");
  if (tagged.length === 1)
    return {
      prose: text.replace(/```primeledger-postings\s*[\s\S]*?```/gi, "").trim(),
      raw: tagged[0][1],
    };
  const hits = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].filter((m) => {
    try {
      const value = JSON.parse(m[1]) as { lines?: unknown };
      return Array.isArray(value?.lines);
    } catch {
      return false;
    }
  });
  if (hits.length > 1)
    throw Error("The reply included more than one posting block.");
  if (hits.length === 1)
    return { prose: text.replace(hits[0][0], "").trim(), raw: hits[0][1] };
  return { prose: text.trim(), raw: null as string | null };
}
export function propose(
  text: string,
  ledger: Ledger,
  today: string,
): Proposal | null {
  const extracted = extractPosting(text);
  if (!extracted.raw) return null;
  let data: { summary?: unknown; lines?: unknown; total?: unknown };
  try {
    data = JSON.parse(extracted.raw.trim());
  } catch {
    throw Error("The posting block was not valid JSON, so nothing was added.");
  }
  if (!data || !Array.isArray(data.lines) || data.lines.length === 0)
    throw Error("Name the amounts to add.");
  if (data.lines.length > 12)
    throw Error("Split this into 12 records or fewer.");
  const parsed = data.lines.map((line) =>
    appropriate(line, ledger, today, "model"),
  );
  const lines = parsed.map((p) => p.line);
  const warnings = parsed.flatMap((p) => p.warnings);
  if (data.total !== null && data.total !== undefined && data.total !== "") {
    const total = cents(moneyInput(data.total));
    const sum = lines.reduce((a, e) => a + e.amount, 0);
    if (sum !== total)
      throw Error("The split amounts do not add up to the total you stated.");
  }
  for (const line of lines) {
    const duplicate = ledger.entries.some(
      (e) =>
        e.kind === line.kind &&
        e.date === line.date &&
        e.amount === line.amount &&
        e.name.trim().toLowerCase() === line.name.trim().toLowerCase(),
    );
    if (duplicate)
      warnings.push(
        `${line.name} on ${line.date} for ${money(line.amount)} is already in the ledger.`,
      );
  }
  warnings.push(...contractWarnings(ledger, lines));
  const summary =
    typeof data.summary === "string" && data.summary.trim()
      ? data.summary.trim().slice(0, 500)
      : "Review these records before adding them.";
  return { summary, lines, warnings };
}
export function withPostings(
  ledger: Ledger,
  lines: PostedLine[],
  ids: string[],
): Ledger {
  if (lines.length !== ids.length || new Set(ids).size !== ids.length)
    throw Error("Could not assign records.");
  return validateLedger({
    ...ledger,
    entries: [
      ...ledger.entries,
      ...lines.map((line, i) => ({ ...line, id: ids[i] })),
    ],
  });
}
export function reserveChange(
  ledger: Ledger,
  year: number,
  assumptions: Assumptions,
  lines: PostedLine[],
): { before: Snapshot; after: Snapshot } | null {
  const before = snapshot(ledger, year, assumptions);
  const used = new Set(ledger.entries.map((e) => e.id));
  const ids = lines.map((_, i) => {
    let id = `preview-${i}`;
    while (used.has(id)) id = `preview-${id}`;
    used.add(id);
    return id;
  });
  const after = snapshot(withPostings(ledger, lines, ids), year, assumptions);
  if (!before || !after) return null;
  return { before, after };
}
