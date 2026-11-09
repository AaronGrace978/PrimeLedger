import { test, expect, type Page } from "@playwright/test";
async function go(page: Page, name: string) {
  await expect(page.locator(".app")).toBeVisible();
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
test("records, attachments, export, restoration, chat and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clearer picture." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Consulting payment");
  await page.getByLabel("Amount (USD)").fill("2400");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByText("Consulting payment", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Consulting payment", { exact: true }),
  ).toBeVisible();
  await go(page, "Contracts");
  await page.getByRole("button", { name: "Add contract" }).click();
  await page.getByLabel("Project / agreement title").fill("Research agreement");
  await page.getByLabel("Client", { exact: true }).fill("Northwind");
  await page.getByLabel("Agreed value (USD)").fill("5000");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("heading", { name: "Research agreement" }),
  ).toBeVisible();
  await go(page, "Documents");
  await page.getByRole("button", { name: "Add document" }).click();
  await page.getByLabel("Document title").fill("Signed scope");
  await page
    .getByLabel("Linked contract")
    .selectOption({ label: "Northwind · Research agreement" });
  await page.getByLabel("Attachment · optional, up to 10 MB").setInputFiles({
    name: "agreement.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Signed scope of work"),
  });
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("agreement.txt", { exact: true })).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Signed scope" }).click();
  expect((await dl).suggestedFilename()).toBe("agreement.txt");
  await go(page, "Tax calculator");
  await expect(
    page.getByText("$2,400.00", { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel("Federal effective rate (%)").fill("0");
  await go(page, "AI assistant");
  await page.route("https://ollama.com/api/tags", (r) =>
    r.fulfill({ json: { models: [{ name: "latest-test-model" }] } }),
  );
  await page.route("https://ollama.com/api/chat", async (r) => {
    const body = r.request().postDataJSON();
    expect(JSON.stringify(body)).not.toContain("Northwind");
    await r.fulfill({
      json: {
        message: { content: "Keep signed agreements and receipts together." },
      },
    });
  });
  await page.getByLabel("API key", { exact: true }).fill("test-session-key");
  await page.getByRole("button", { name: "Refresh available models" }).click();
  await expect(page.getByLabel("Model ID")).toHaveValue("latest-test-model");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("How do I organize receipts?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Keep signed agreements and receipts together."),
  ).toBeVisible();
  await go(page, "Settings");
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full backup" }).click();
  const download = await backup;
  const fs = await import("node:fs/promises");
  const path = await download.path();
  const data = JSON.parse(await fs.readFile(path!, "utf8"));
  expect(data.entries).toHaveLength(1);
  expect(data.documents[0].data).toBe(
    Buffer.from("Signed scope of work").toString("base64"),
  );
  expect(JSON.stringify(data)).not.toContain("test-session-key");
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Restore backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByText("Workspace restored.")).toBeVisible();
  await go(page, "Transactions");
  await page.getByRole("button", { name: /^Consulting payment/ }).click();
  await page.getByLabel("Amount (USD)").fill("2500");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("+$2,500.00", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete Consulting payment" }).click();
  await expect(
    page.getByRole("heading", { name: "A clean slate" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("overview visual and responsive layout", async ({ page }, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clearer picture." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/overview-${info.project.name}.png`,
    fullPage: true,
  });
});

test("screenshots require explicit analysis and review before saving", async ({
  page,
}) => {
  await page.goto("/");
  await go(page, "AI assistant");
  await page.getByLabel("API key", { exact: true }).fill("vision-test-key");
  await page.getByLabel("Model ID").fill("vision-test");
  let calls = 0;
  await page.route("https://ollama.com/api/chat", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.messages.at(-1).images).toHaveLength(1);
    await route.fulfill({
      json: {
        message: {
          content: JSON.stringify({
            kind: "expense",
            date: `${new Date().getFullYear()}-01-15`,
            name: "Office supplies receipt",
            amount: "18.25",
            category: "Supplies",
            note: "Please verify the total.",
          }),
        },
      },
    });
  });
  await page.getByLabel("Upload screenshot").setInputFiles("build/icon.png");
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Analyze & review" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Amount (USD)")).toHaveValue("18.25");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await go(page, "Documents");
  await expect(page.getByText("0 documents")).toBeVisible();
  await go(page, "AI assistant");
  await page.getByLabel("API key", { exact: true }).fill("vision-test-key");
  await page.getByLabel("Model ID").fill("vision-test");
  await page.getByLabel("Upload screenshot").setInputFiles("build/icon.png");
  await page.getByRole("button", { name: "Analyze & review" }).click();
  await page.getByLabel("Amount (USD)").fill("19.50");
  await page.getByRole("button", { name: "Save record" }).click();
  await go(page, "Transactions");
  await expect(page.getByText("−$19.50", { exact: true })).toBeVisible();
  await go(page, "Documents");
  await expect(
    page.getByText("Office supplies receipt · screenshot", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(2);
});
