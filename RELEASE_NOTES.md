PrimeLedger's initial release series (0.1.2 fixes desktop logo navigation and preserves secure speech/AI access after in-page navigation): a local-first workspace for independent contractors.

- Track 1099 contract payments, business expenses, and W-2 gross income.
- Organize clients, contracts, deadlines, agreements, and receipt attachments.
- Estimate a tax reserve using transparent, adjustable assumptions.
- Chat with Ollama Cloud, OpenAI, Anthropic, Gemini, OpenRouter, Groq, or a custom OpenAI-compatible provider. Discover available models live or enter a model ID.
- Upload receipts/payment screenshots for vision-model extraction, review/edit the suggested fields, then save the transaction and source image.
- Listen to assistant replies with bundled offline eSpeak NG on desktop.
- Export CSV transactions and full JSON backups; restore records across devices manually.
- Windows Electron installer with opt-in GitHub-based update downloads.

This is an early release. Windows installers are not code-signed (SmartScreen may warn). Android-preview.apk is a debug-signed evaluation build; Android-unsigned.apk requires your release signing key before installation/distribution. Do not use the debug build as a permanent store for important records; later release signing may require uninstalling it. Export backups before changing builds. Android store distribution, production signing, and automatic device sync are not included.

AI needs your own provider API key and Internet access. Real provider calls require an account with model access. Financial records and backups are stored without app-level encryption. The tax calculator is a savings estimate, not tax filing or professional advice. Read README.md for limitations and backup instructions.
