PrimeLedger 0.1.3 adds a posting harness for the assistant. Paste money you received or spent into the chat. The assistant proposes the ledger lines, assigns them to contract income, an expense category, or W-2 wages, and links a saved contract when the name matches. Sales tax on a receipt is recorded as part of the total you paid. You confirm before anything is saved. The assistant then shows the planning reserve: what to set aside for taxes and what is left to keep, using the same assumptions as the tax calculator.

- Track 1099 contract payments, business expenses, and W-2 gross income.
- Organize clients, contracts, deadlines, agreements, and receipt attachments.
- Estimate a tax reserve using transparent, adjustable assumptions.
- Chat with Ollama Cloud, OpenAI, Anthropic, Gemini, OpenRouter, Groq, or a custom OpenAI-compatible provider. Discover available models live or enter a model ID.
- Describe a payment or purchase in chat, review the appropriated lines, and add them to the ledger.
- Upload receipts/payment screenshots for vision-model extraction, including sales tax shown on the receipt. Review and edit the suggested fields, then save the transaction and source image.
- Listen to assistant replies with bundled offline eSpeak NG on desktop.
- Export CSV transactions and full JSON backups; restore records across devices manually.
- Windows Electron installer with opt-in GitHub-based update downloads.

This is an early release. Windows installers are not code-signed (SmartScreen may warn). Android-preview.apk is a debug-signed evaluation build; Android-unsigned.apk requires your release signing key before installation/distribution. Do not use the debug build as a permanent store for important records; later release signing may require uninstalling it. Export backups before changing builds. Android store distribution, production signing, and automatic device sync are not included.

AI needs your own provider API key and Internet access. Real provider calls require an account with model access. Financial records and backups are stored without app-level encryption. The tax calculator and the chat reserve are savings estimates, not tax filing or professional advice. Read README.md for limitations and backup instructions.
