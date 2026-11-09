import { describe, it, expect } from "vitest";
import {
  cents,
  emptyLedger,
  reserve,
  totals,
  validateLedger,
  csv,
} from "../src/core";
import { spec, models, answer } from "../src/ai";
describe("money and reserves", () => {
  it("uses integer cents and rejects malformed or negative money", () => {
    expect(cents("1200.29")).toBe(120029);
    for (const x of ["-2", "0", "1.001", "NaN", "1e5", ""])
      expect(() => cents(x)).toThrow();
  });
  it("isolates years and W-2 income from contract profit", () => {
    const l = emptyLedger();
    l.entries = [
      {
        id: "1",
        kind: "income",
        amount: 10000,
        date: "2026-01-01",
        name: "Payment",
        note: "",
        category: "Work",
        contractId: "",
      },
      {
        id: "2",
        kind: "expense",
        amount: 1000,
        date: "2026-01-02",
        name: "Tools",
        note: "",
        category: "Work",
        contractId: "",
      },
      {
        id: "3",
        kind: "w2",
        amount: 50000,
        date: "2026-01-03",
        name: "Wages",
        note: "",
        category: "Salary",
        contractId: "",
      },
      {
        id: "4",
        kind: "income",
        amount: 3000,
        date: "2025-01-01",
        name: "Prior",
        note: "",
        category: "Work",
        contractId: "",
      },
    ];
    expect(totals(l, 2026)).toEqual({
      income: 10000,
      expenses: 1000,
      w2: 50000,
      profit: 9000,
    });
  });
  it("calculates SE tax and half-SE adjustment without W-2 income tax", () => {
    const r = reserve(10000000, 0, 22, 5, 0, 18450000);
    expect(r.se).toBe(1412955);
    expect(r.income).toBe(2509251);
    expect(r.total).toBe(3922206);
  });
  it("caps Social Security after W-2 wages and clamps losses and overpayments", () => {
    expect(reserve(10000000, 18450000, 0, 0, 0, 18450000).se).toBe(267815);
    expect(reserve(-50000, 0, 22, 5, 0, 18450000).total).toBe(0);
    expect(reserve(100000, 0, 22, 5, 999999, 18450000).remaining).toBe(0);
  });
});
describe("backups and export", () => {
  it("validates full structure, rejects duplicate IDs and malformed amounts", () => {
    const l = emptyLedger();
    expect(validateLedger(JSON.parse(JSON.stringify(l)))).toEqual(l);
    expect(() => validateLedger({ version: 2 })).toThrow();
    expect(() => validateLedger({ ...l, entries: [{ id: "bad" }] })).toThrow();
  });
  it("escapes quotes and guards spreadsheet formulas", () => {
    const text = csv([
      {
        id: "x",
        kind: "income",
        date: "2026-01-01",
        name: '=HYPERLINK("bad")',
        amount: 100,
        category: "Other",
        note: "line\nnext",
        contractId: "",
      },
    ]);
    expect(text).toContain('"\'=HYPERLINK(""bad"")"');
    expect(text).toContain('"1.00"');
  });
});
describe("provider protocols", () => {
  it("uses Ollama native cloud endpoints and disables streaming", () => {
    const list = spec("ollama", "https://ollama.com", "secret");
    expect(list.url).toBe("https://ollama.com/api/tags");
    const chat = spec("ollama", "https://ollama.com", "secret", "model", [
      { role: "user", content: "hi" },
    ]);
    expect(chat.url).toBe("https://ollama.com/api/chat");
    expect(chat.body).toMatchObject({ stream: false, model: "model" });
  });
  it("supports Anthropic and Gemini instead of assuming OpenAI format", () => {
    const a = spec(
      "anthropic",
      "https://api.anthropic.com/v1",
      "key",
      "claude",
      [{ role: "user", content: "Hello" }],
    );
    expect(a.headers["x-api-key"]).toBe("key");
    expect(a.body).toMatchObject({ max_tokens: 2048 });
    const g = spec(
      "google",
      "https://generativelanguage.googleapis.com/v1beta",
      "key",
      "models/gemini",
      [{ role: "assistant", content: "hi" }],
    );
    expect(g.url).toContain("/models/gemini:generateContent");
    expect(g.body).toMatchObject({ contents: [{ role: "model" }] });
  });
  it("normalizes discovered models and provider answers", () => {
    expect(
      models({ models: [{ name: "b" }, { name: "a" }, { name: "b" }] }),
    ).toEqual(["a", "b"]);
    expect(answer({ content: [{ type: "text", text: "hello" }] })).toBe(
      "hello",
    );
    expect(() => answer({})).toThrow();
    expect(() => spec("custom", "http://example.com", "key")).toThrow();
  });
});

describe("screenshot extraction", () => {
  it("builds native vision payloads for all supported protocols", async () => {
    const { visionSpec } = await import("../src/extraction");
    const image = { data: "YWJj", mime: "image/png", name: "receipt.png" };
    const o = visionSpec("ollama", "https://ollama.com", "key", "vision", image)
      .body as any;
    expect(o.messages.at(-1).images).toEqual(["YWJj"]);
    const a = visionSpec(
      "anthropic",
      "https://api.anthropic.com/v1",
      "key",
      "vision",
      image,
    ).body as any;
    expect(a.messages[0].content[0].source.media_type).toBe("image/png");
    const g = visionSpec(
      "google",
      "https://generativelanguage.googleapis.com/v1beta",
      "key",
      "vision",
      image,
    ).body as any;
    expect(g.contents[0].parts[0].inlineData.data).toBe("YWJj");
    const p = visionSpec(
      "openai",
      "https://api.openai.com/v1",
      "key",
      "vision",
      image,
    ).body as any;
    expect(p.messages.at(-1).content[1].image_url.url).toBe(
      "data:image/png;base64,YWJj",
    );
  });
  it("validates model output and marks an inferred date for review", async () => {
    const { parseExtraction } = await import("../src/extraction");
    const data = {
      kind: "expense",
      date: null,
      name: "Office supplies",
      amount: "42.99",
      category: "Supplies",
      note: "",
    };
    const draft = parseExtraction(JSON.stringify(data), "2026-11-09");
    expect(draft.amount).toBe(4299);
    expect(draft.date).toBe("2026-11-09");
    expect(draft.note).toContain("Date not visible");
    expect(draft).not.toHaveProperty("id");
    for (const patch of [
      { amount: null },
      { amount: "-20" },
      { date: "2026-02-31" },
      { kind: "transfer" },
    ])
      expect(() =>
        parseExtraction(JSON.stringify({ ...data, ...patch }), "2026-11-09"),
      ).toThrow();
    expect(() => parseExtraction("not json", "2026-11-09")).toThrow();
  });
});
