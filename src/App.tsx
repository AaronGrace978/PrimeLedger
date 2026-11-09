import {
  visionSpec,
  parseExtraction,
  readScreenshot,
  type Screenshot,
} from "./extraction";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Files,
  Calculator,
  MessageSquare,
  Settings,
  Plus,
  Search,
  ArrowRight,
  Download,
  Trash2,
  X,
  Check,
  ShieldCheck,
  Volume2,
  Send,
  Leaf,
  Menu,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  cents,
  csv,
  emptyLedger,
  money,
  reserve,
  totals,
  validateLedger,
  type Ledger,
  type Entry,
  type Contract,
  type Document,
} from "./core";
import { load, save } from "./storage";
import {
  providers,
  spec,
  request,
  discover,
  answer,
  type Provider,
  type Message,
} from "./ai";
const today = () => new Date().toLocaleDateString("en-CA");
const pages = [
  ["Overview", LayoutDashboard],
  ["Transactions", ArrowDownLeft],
  ["Contracts", BriefcaseBusiness],
  ["Documents", Files],
  ["Tax calculator", Calculator],
  ["AI assistant", MessageSquare],
  ["Settings", Settings],
] as const;
const id = () => crypto.randomUUID();
async function download(
  name: string,
  content: Blob | string,
  mime = "application/json",
) {
  const blob =
    typeof content === "string" ? new Blob([content], { type: mime }) : content;
  if (Capacitor.isNativePlatform()) {
    const b64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const file = await Filesystem.writeFile({
      path: name.replace(/[^a-zA-Z0-9._-]/g, "_"),
      data: b64,
      directory: Directory.Cache,
    });
    await Share.share({ title: name, url: file.uri });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Leaf size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export default function App() {
  const [ledger, setLedger] = useState<Ledger>(emptyLedger),
    [ready, setReady] = useState(false),
    [fatal, setFatal] = useState(""),
    [page, setPage] = useState("Overview"),
    [year, setYear] = useState(new Date().getFullYear()),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState<"entry" | "contract" | "document" | null>(
      null,
    ),
    [editing, setEditing] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [nav, setNav] = useState(false);
  const [pendingImage, setPendingImage] = useState<Screenshot | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setModal(null);
      if (event.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll<HTMLElement>(
            ".modal button:not(:disabled),.modal input,.modal select,.modal textarea",
          ),
        ];
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [modal, saving]);

  useEffect(() => {
    load()
      .then((x) => {
        setLedger(x);
        setReady(true);
      })
      .catch(() =>
        setFatal(
          "Your workspace could not be opened. Reload the app or restore storage access. Existing data has not been overwritten.",
        ),
      );
  }, []);
  const t = totals(ledger, year),
    entries = ledger.entries
      .filter(
        (e) =>
          e.date.startsWith(String(year)) &&
          `${e.name} ${e.category} ${e.note}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  async function commit(next: Ledger) {
    if (lock.current) throw Error("A save is already in progress.");
    lock.current = true;
    try {
      await save(next);
      setLedger(next);
    } finally {
      lock.current = false;
    }
  }
  async function remove(
    kind: "entries" | "contracts" | "documents",
    key: string,
  ) {
    if (!confirm("Delete this record? This cannot be undone.")) return;
    try {
      await commit({
        ...ledger,
        [kind]: ledger[kind].filter((e) => e.id !== key),
      });
    } catch (e) {
      setNotice(String(e));
    }
  }
  const open = (kind: typeof modal, item: any = null) => {
    setPendingImage(null);
    setEditing(item);
    setError("");
    setModal(kind);
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const f = new FormData(event.currentTarget);
    const s = (key: string) => String(f.get(key) || "").trim();
    try {
      if (modal === "entry") {
        const entry: Entry = {
          id: editing?.id || id(),
          kind: s("kind") as Entry["kind"],
          date: s("date"),
          name: s("name"),
          amount: cents(s("amount")),
          category: s("category"),
          contractId: s("contractId"),
          note: s("note"),
        };
        await commit({
          ...ledger,
          entries: [...ledger.entries.filter((e) => e.id !== entry.id), entry],
          documents: pendingImage
            ? [
                ...ledger.documents,
                {
                  id: id(),
                  name: (entry.name + " · screenshot").slice(0, 200),
                  kind: "Receipt",
                  contractId: entry.contractId,
                  date: entry.date,
                  note: "Source screenshot for transaction " + entry.id,
                  fileName: pendingImage.name,
                  mime: pendingImage.mime,
                  data: pendingImage.data,
                },
              ]
            : ledger.documents,
        });
      }
      if (modal === "contract") {
        const c: Contract = {
          id: editing?.id || id(),
          client: s("client"),
          title: s("title"),
          value: cents(s("amount")),
          due: s("date"),
          status: s("status") as Contract["status"],
          note: s("note"),
        };
        await commit({
          ...ledger,
          contracts: [...ledger.contracts.filter((e) => e.id !== c.id), c],
        });
      }
      if (modal === "document") {
        const file = f.get("file") as File;
        let data = editing?.data || "",
          fileName = editing?.fileName || "",
          mime = editing?.mime || "";
        if (file?.size) {
          if (file.size > 10 * 1024 * 1024)
            throw Error("Choose a file under 10 MB.");
          data = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result).split(",")[1]);
            r.onerror = () => rej(Error("File could not be read."));
            r.readAsDataURL(file);
          });
          fileName = file.name;
          mime = file.type;
        }
        const d: Document = {
          id: editing?.id || id(),
          name: s("name"),
          kind: s("kind"),
          contractId: s("contractId"),
          date: s("date"),
          note: s("note"),
          data,
          fileName,
          mime,
        };
        await commit({
          ...ledger,
          documents: [...ledger.documents.filter((e) => e.id !== d.id), d],
        });
      }
      setModal(null);
      setNotice("Saved to your device.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }
  async function restore(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) throw Error("Backup exceeds 100 MB.");
      const next = validateLedger(JSON.parse(await file.text()));
      if (
        confirm(
          "Replace this workspace with the backup? Export your current workspace first.",
        )
      ) {
        await commit(next);
        setNotice("Workspace restored.");
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not restore backup.");
    }
  }
  const go = (p: string) => {
    setPage(p);
    setNav(false);
    setSearch("");
  };
  const contractSelect = (
    <select name="contractId" defaultValue={editing?.contractId || ""}>
      <option value="">No linked contract</option>
      {ledger.contracts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.client} · {c.title}
        </option>
      ))}
    </select>
  );
  if (fatal)
    return (
      <main className="fatal">
        <h1>Workspace unavailable</h1>
        <p>{fatal}</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    );
  if (!ready) return <main className="fatal">Opening your workspace…</main>;
  return (
    <div className="app">
      <aside className={nav ? "sidebar visible" : "sidebar"}>
        <a className="brand" href="#" onClick={() => go("Overview")}>
          <span className="brandmark">
            <Leaf size={22} />
          </span>
          PrimeLedger<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav>
          {pages.map(([p, Icon]) => (
            <button
              key={p}
              aria-label={p}
              className={p === page ? "nav active" : "nav"}
              onClick={() => go(p)}
            >
              <Icon size={19} />
              {p}
              {p === "AI assistant" && <span className="new">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={21} />
            <strong>Yours, by default.</strong>
            <p>
              Your records live on this device. Back up regularly to keep them
              safe.
            </p>
          </div>
          <div className="profile">
            <span>PL</span>
            <div>
              <strong>My workspace</strong>
              <small>Independent professional</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="icon mobile"
            aria-label="Open navigation"
            onClick={() => setNav(!nav)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="top-right">
            <span className="local-status">
              <i /> Local workspace
            </span>
            <span className="avatar">PL</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR WORK. YOUR MONEY. IN ORDER.</div>
              <h1>{page === "Overview" ? "A clearer picture." : page}</h1>
              <p>
                {
                  (
                    {
                      Overview:
                        "Make room for the work you love. We’ll help organize the rest.",
                      Transactions:
                        "Every payment and purchase, with a place to belong.",
                      Contracts:
                        "Keep the details of every working relationship close.",
                      Documents:
                        "Agreements, receipts, and important paperwork. Together.",
                      "Tax calculator":
                        "Plan ahead with a transparent tax-reserve estimate.",
                      "AI assistant":
                        "A thoughtful second set of eyes for your independent business.",
                      Settings: "Make this workspace work for you.",
                    } as Record<string, string>
                  )[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {["Overview", "Transactions", "Tax calculator"].includes(
                page,
              ) && (
                <select
                  aria-label="Tax year"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {Array.from(
                    new Set([
                      new Date().getFullYear(),
                      year,
                      ...ledger.entries.map((e) => Number(e.date.slice(0, 4))),
                    ]),
                  )
                    .sort((a, b) => b - a)
                    .map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                </select>
              )}
              {["Overview", "Transactions", "Contracts", "Documents"].includes(
                page,
              ) && (
                <button
                  className="primary"
                  onClick={() =>
                    open(
                      page === "Contracts"
                        ? "contract"
                        : page === "Documents"
                          ? "document"
                          : "entry",
                    )
                  }
                >
                  <Plus size={17} />
                  {page === "Contracts"
                    ? "Add contract"
                    : page === "Documents"
                      ? "Add document"
                      : "Add transaction"}
                </button>
              )}
            </div>
          </div>
          {notice && (
            <div role="status" className="notice">
              <Check size={17} />
              {notice}
              <button
                className="icon"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <section className="hero">
                <div>
                  <span className="hero-tag">
                    <i /> YOUR {year} AT A GLANCE
                  </span>
                  <h2>
                    Good work deserves
                    <br />a little peace of mind.
                  </h2>
                  <p>
                    Track what comes in. Know what goes out.
                    <br />
                    Keep your next chapter in focus.
                  </p>
                  <button onClick={() => go("Tax calculator")}>
                    Plan your tax reserve <ArrowRight size={16} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit one" />
                  <div className="orbit two" />
                  <div className="art-card">
                    <Leaf size={26} />
                    <span>ROOM TO GROW</span>
                    <div className="bars">
                      {[28, 45, 37, 64, 56, 81, 100].map((n, i) => (
                        <i key={i} style={{ height: n }} />
                      ))}
                    </div>
                    <strong>A more organized you.</strong>
                  </div>
                  <span className="art-badge">
                    <Check size={16} /> All in one place
                  </span>
                </div>
              </section>
              <div className="stats">
                <Stat
                  label="CONTRACT INCOME"
                  value={money(t.income)}
                  icon={<ArrowDownLeft />}
                  detail="Payments received this year"
                />
                <Stat
                  label="BUSINESS EXPENSES"
                  value={money(t.expenses)}
                  icon={<ArrowUpRight />}
                  detail="Track receipts for your records"
                />
                <Stat
                  label="NET CONTRACT INCOME"
                  value={money(t.profit)}
                  icon={<BriefcaseBusiness />}
                  detail="Income less recorded expenses"
                />
                <Stat
                  label="W-2 INCOME"
                  value={money(t.w2)}
                  icon={<Files />}
                  detail="Keep employed income organized"
                />
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Recent activity</h2>
                      <p>The latest in your ledger</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("Transactions")}
                    >
                      View all <ArrowRight size={15} />
                    </button>
                  </div>
                  {entries.length ? (
                    <EntryTable
                      entries={entries.slice(0, 5)}
                      onEdit={(e) => open("entry", e)}
                    />
                  ) : (
                    <Empty
                      title="Your next chapter starts here"
                      text="Add your first payment or expense to bring your financial picture into focus."
                      action={
                        <button
                          className="secondary"
                          onClick={() => open("entry")}
                        >
                          <Plus size={16} /> Add your first transaction
                        </button>
                      }
                    />
                  )}
                </section>
                <section className="panel next">
                  <div className="section-heading">
                    <div>
                      <h2>On your radar</h2>
                      <p>A little preparation goes a long way</p>
                    </div>
                    <span className="soft-icon">
                      <BriefcaseBusiness size={18} />
                    </span>
                  </div>
                  {ledger.contracts.filter((c) => c.status === "Active")
                    .length ? (
                    ledger.contracts
                      .filter((c) => c.status === "Active")
                      .sort((a, b) => a.due.localeCompare(b.due))
                      .slice(0, 3)
                      .map((c) => (
                        <button
                          className="radar"
                          key={c.id}
                          onClick={() => {
                            go("Contracts");
                            open("contract", c);
                          }}
                        >
                          <strong>{c.title}</strong>
                          <span>
                            {c.client} · Due {c.due}
                          </span>
                        </button>
                      ))
                  ) : (
                    <div className="radar-empty">
                      <span className="soft-icon">
                        <Check size={22} />
                      </span>
                      <h3>A fresh start.</h3>
                      <p>
                        Active contracts and their deadlines will show up here.
                      </p>
                    </div>
                  )}
                  <button
                    className="text-button"
                    onClick={() => go("Contracts")}
                  >
                    Manage contracts <ArrowRight size={15} />
                  </button>
                </section>
              </div>
              <div className="footnote">
                <ShieldCheck size={15} /> Built for independent work. Organized
                for everyday life.
              </div>
            </>
          )}
          {page === "Transactions" && (
            <section className="panel">
              <div className="section-heading">
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search transactions"
                    placeholder="Search transactions…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      `primeledger-${year}.csv`,
                      csv(entries),
                      "text/csv",
                    ).catch((e) => setNotice(String(e)))
                  }
                >
                  <Download size={16} /> Export CSV
                </button>
              </div>
              {entries.length ? (
                <EntryTable
                  entries={entries}
                  onEdit={(e) => open("entry", e)}
                  onDelete={(e) => remove("entries", e.id)}
                />
              ) : (
                <Empty
                  title="A clean slate"
                  text="Record contract payments, business expenses, and W-2 gross income."
                />
              )}
            </section>
          )}
          {page === "Contracts" && (
            <div className="card-grid">
              {ledger.contracts.length ? (
                ledger.contracts.map((c) => (
                  <article className="panel contract-card" key={c.id}>
                    <div className="card-top">
                      <span className={"badge " + c.status.toLowerCase()}>
                        {c.status}
                      </span>
                      <button
                        className="icon danger"
                        aria-label={"Delete " + c.title}
                        onClick={() => remove("contracts", c.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <small>{c.client}</small>
                    <h2>{c.title}</h2>
                    <strong className="contract-value">{money(c.value)}</strong>
                    <p>
                      Received{" "}
                      {money(
                        ledger.entries
                          .filter(
                            (e) => e.kind === "income" && e.contractId === c.id,
                          )
                          .reduce((a, e) => a + e.amount, 0),
                      )}
                    </p>
                    <p>Due {c.due}</p>
                    <p className="note-text">{c.note}</p>
                    <button
                      className="secondary"
                      onClick={() => open("contract", c)}
                    >
                      Edit contract <ArrowRight size={15} />
                    </button>
                  </article>
                ))
              ) : (
                <section className="panel full">
                  <Empty
                    title="Give every project a home"
                    text="Keep client details, agreed amounts, deadlines, and project notes together."
                    action={
                      <button
                        className="secondary"
                        onClick={() => open("contract")}
                      >
                        Create a contract record
                      </button>
                    }
                  />
                </section>
              )}
            </div>
          )}
          {page === "Documents" && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Your document cabinet</h2>
                  <p>Files stay on this device. Up to 10 MB per attachment.</p>
                </div>
                <span className="badge">
                  {ledger.documents.length} documents
                </span>
              </div>
              {ledger.documents.length ? (
                <div className="document-list">
                  {ledger.documents.map((d) => (
                    <article key={d.id} className="document-row">
                      <span className="doc-icon">
                        <Files size={23} />
                      </span>
                      <div>
                        <button
                          className="text-button"
                          onClick={() => open("document", d)}
                        >
                          {d.name}
                        </button>
                        <p>
                          {d.kind} · {d.date} ·{" "}
                          {ledger.contracts.find((c) => c.id === d.contractId)
                            ?.client || "Unlinked"}
                        </p>
                        <small>{d.fileName || "Notes only"}</small>
                      </div>
                      {d.data && (
                        <button
                          className="icon"
                          aria-label={"Download " + d.name}
                          onClick={() => {
                            const bytes = Uint8Array.from(atob(d.data), (c) =>
                              c.charCodeAt(0),
                            );
                            download(
                              d.fileName,
                              new Blob([bytes], {
                                type: "application/octet-stream",
                              }),
                            ).catch((e) => setNotice(String(e)));
                          }}
                        >
                          <Download size={18} />
                        </button>
                      )}
                      <button
                        className="icon danger"
                        aria-label={"Delete " + d.name}
                        onClick={() => remove("documents", d.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Less searching. More certainty."
                  text="Store signed agreements, receipts, 1099s, W-2s, and project notes in one place."
                />
              )}
            </section>
          )}
          {page === "Tax calculator" && (
            <TaxCalculator profit={t.profit} wages={t.w2} year={year} />
          )}
          {page === "AI assistant" && (
            <Chat
              ledger={ledger}
              year={year}
              onExtract={(draft, image) => {
                open("entry", draft);
                setPendingImage(image);
              }}
            />
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="panel padded">
                <ShieldCheck className="green" />
                <h2>Your workspace, your responsibility</h2>
                <p>
                  Records and attachments are stored locally in this app’s
                  device storage. They are not encrypted by PrimeLedger. Use
                  device encryption and a screen lock. Uninstalling the app or
                  clearing its storage can remove your records.
                </p>
                <p>
                  Windows and Android have separate workspaces. Use a backup to
                  transfer records. There is no automatic sync.
                </p>
                <div className="button-row">
                  <button
                    className="primary"
                    onClick={() =>
                      download(
                        `primeledger-backup-${today()}.json`,
                        JSON.stringify(ledger),
                      )
                        .then(() =>
                          setNotice(
                            "Backup exported. Keep it somewhere secure.",
                          ),
                        )
                        .catch((e) => setNotice(String(e)))
                    }
                  >
                    <Download size={16} /> Export full backup
                  </button>
                  <label className="secondary file-button">
                    Restore backup
                    <input
                      aria-label="Restore backup"
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => {
                        restore(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <small>
                  Backups include attachments and financial records. They
                  exclude API keys and chat history, and are not encrypted.
                </small>
              </section>
              <section className="panel padded">
                <h2>Desktop updates</h2>
                <p>
                  PrimeLedger 0.1.1 · Windows installers receive updates from
                  GitHub Releases. You choose when to download and restart.
                  Android updates are installed manually.
                </p>
                <button
                  className="secondary"
                  disabled={!window.desktop}
                  onClick={() =>
                    window.desktop
                      ?.update("check")
                      .then(setNotice)
                      .catch((e) => setNotice(String(e)))
                  }
                >
                  Check for updates
                </button>
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={!window.desktop}
                    onClick={() =>
                      window.desktop
                        ?.update("download")
                        .then(setNotice)
                        .catch((e) => setNotice(String(e)))
                    }
                  >
                    Download update
                  </button>
                  <button
                    className="secondary"
                    disabled={!window.desktop}
                    onClick={() => {
                      if (confirm("Restart to install the downloaded update?"))
                        window.desktop
                          ?.update("install")
                          .then(setNotice)
                          .catch((e) => setNotice(String(e)));
                    }}
                  >
                    Restart & install
                  </button>
                </div>
                <h3>Open-source acknowledgments</h3>
                <p>
                  eSpeak NG is bundled for offline desktop speech through the
                  Echogarden Emscripten port. PrimeLedger and the bundled eSpeak
                  port are distributed under GPL-3.0-or-later / GPL-3.0. Source
                  and notices are included in the repository.
                </p>
              </section>
            </div>
          )}
        </main>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="modal"
          >
            <div className="section-heading">
              <h2 id="dialog-title">
                {editing ? "Edit" : "New"}{" "}
                {modal === "entry" ? "transaction" : modal}
              </h2>
              <button
                className="icon"
                aria-label="Close dialog"
                disabled={saving}
                onClick={() => setModal(null)}
              >
                <X />
              </button>
            </div>
            <form onSubmit={submit}>
              {modal === "entry" && (
                <>
                  {pendingImage && (
                    <div className="notice">
                      AI suggestion: verify every field. {pendingImage.name}{" "}
                      will be saved to Documents only when you save this
                      transaction.
                    </div>
                  )}
                  <Field label="Transaction type">
                    <select
                      name="kind"
                      defaultValue={editing?.kind || "income"}
                    >
                      <option value="income">Contract payment · 1099</option>
                      <option value="expense">Business expense</option>
                      <option value="w2">W-2 gross income</option>
                    </select>
                  </Field>
                  <Field label="Description">
                    <input
                      autoFocus
                      required
                      maxLength={200}
                      name="name"
                      defaultValue={editing?.name}
                      placeholder="e.g. Website project · final payment"
                    />
                  </Field>
                  <div className="form-row">
                    <Field label="Amount (USD)">
                      <input
                        name="amount"
                        required
                        inputMode="decimal"
                        defaultValue={
                          editing ? String(editing.amount / 100) : ""
                        }
                        placeholder="0.00"
                      />
                    </Field>
                    <Field label="Date">
                      <input
                        name="date"
                        type="date"
                        required
                        defaultValue={editing?.date || today()}
                      />
                    </Field>
                  </div>
                  <Field label="Category">
                    <select
                      name="category"
                      defaultValue={editing?.category || "Contract work"}
                    >
                      {[
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
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Linked contract">{contractSelect}</Field>
                </>
              )}
              {modal === "contract" && (
                <>
                  <Field label="Project / agreement title">
                    <input
                      autoFocus
                      name="title"
                      required
                      maxLength={200}
                      defaultValue={editing?.title}
                      placeholder="Brand strategy engagement"
                    />
                  </Field>
                  <Field label="Client">
                    <input
                      name="client"
                      required
                      maxLength={200}
                      defaultValue={editing?.client}
                      placeholder="Client or organization"
                    />
                  </Field>
                  <div className="form-row">
                    <Field label="Agreed value (USD)">
                      <input
                        name="amount"
                        required
                        inputMode="decimal"
                        defaultValue={
                          editing ? String(editing.value / 100) : ""
                        }
                        placeholder="0.00"
                      />
                    </Field>
                    <Field label="Due date">
                      <input
                        name="date"
                        type="date"
                        required
                        defaultValue={editing?.due || today()}
                      />
                    </Field>
                  </div>
                  <Field label="Status">
                    <select
                      name="status"
                      defaultValue={editing?.status || "Active"}
                    >
                      <option>Active</option>
                      <option>Draft</option>
                      <option>Completed</option>
                    </select>
                  </Field>
                </>
              )}
              {modal === "document" && (
                <>
                  <Field label="Document title">
                    <input
                      autoFocus
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={editing?.name}
                      placeholder="Signed consulting agreement"
                    />
                  </Field>
                  <div className="form-row">
                    <Field label="Document type">
                      <select
                        name="kind"
                        defaultValue={editing?.kind || "Agreement"}
                      >
                        {[
                          "Agreement",
                          "Receipt",
                          "1099",
                          "W-2",
                          "Invoice",
                          "Other",
                        ].map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Document date">
                      <input
                        name="date"
                        type="date"
                        required
                        defaultValue={editing?.date || today()}
                      />
                    </Field>
                  </div>
                  <Field label="Linked contract">{contractSelect}</Field>
                  <Field label="Attachment · optional, up to 10 MB">
                    <input type="file" name="file" />
                    {editing?.fileName && (
                      <small>
                        Current: {editing.fileName}. Choose a file to replace
                        it.
                      </small>
                    )}
                  </Field>
                </>
              )}
              <Field label="Notes">
                <textarea
                  name="note"
                  rows={3}
                  maxLength={10000}
                  defaultValue={editing?.note}
                  placeholder="The details you’ll want to remember…"
                />
              </Field>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={saving}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="primary" disabled={saving}>
                  {saving ? "Saving…" : "Save record"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  detail: string;
}) {
  return (
    <section className="stat">
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}
function EntryTable({
  entries,
  onEdit,
  onDelete,
}: {
  entries: Entry[];
  onEdit: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>TRANSACTION</th>
            <th>DATE</th>
            <th>TYPE</th>
            <th className="amount">AMOUNT</th>
            {onDelete && (
              <th>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>
                <button className="transaction-name" onClick={() => onEdit(e)}>
                  <span className={"entry-icon " + e.kind}>
                    {e.kind === "expense" ? (
                      <ArrowUpRight size={18} />
                    ) : (
                      <ArrowDownLeft size={18} />
                    )}
                  </span>
                  <span>
                    <strong>{e.name}</strong>
                    <small>{e.category}</small>
                  </span>
                </button>
              </td>
              <td>{e.date}</td>
              <td>
                <span className={"badge " + e.kind}>
                  {e.kind === "w2"
                    ? "W-2"
                    : e.kind === "income"
                      ? "Income"
                      : "Expense"}
                </span>
              </td>
              <td className={"amount " + (e.kind === "expense" ? "" : "green")}>
                {e.kind === "expense" ? "−" : "+"}
                {money(e.amount)}
              </td>
              {onDelete && (
                <td>
                  <button
                    className="icon danger"
                    aria-label={"Delete " + e.name}
                    onClick={() => onDelete(e)}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function TaxCalculator({
  profit,
  wages,
  year,
}: {
  profit: number;
  wages: number;
  year: number;
}) {
  const [fed, setFed] = useState("22"),
    [state, setState] = useState("5"),
    [paid, setPaid] = useState("0"),
    [base, setBase] = useState("");
  const wageBase =
    base ||
    (
      { 2024: "168600", 2025: "176100", 2026: "184500" } as Record<
        number,
        string
      >
    )[year] ||
    "";
  const valid =
    wageBase !== "" &&
    [fed, state, paid, wageBase].every(
      (v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0,
    ) &&
    Number(fed) <= 50 &&
    Number(state) <= 30;
  const r = reserve(
    profit,
    wages,
    Number(fed),
    Number(state),
    Number(paid) * 100,
    Number(wageBase) * 100,
  );
  return (
    <div className="tax-layout">
      <section className="panel padded">
        <h2>Build your reserve</h2>
        <p>
          Uses {year} contract net income of <strong>{money(profit)}</strong>{" "}
          and recorded W-2 gross wages of <strong>{money(wages)}</strong>.
        </p>
        <div className="form-row">
          <Field label="Federal effective rate (%)">
            <input
              type="number"
              min="0"
              max="50"
              step="0.1"
              value={fed}
              onChange={(e) => setFed(e.target.value)}
            />
          </Field>
          <Field label="State / local effective rate (%)">
            <input
              type="number"
              min="0"
              max="30"
              step="0.1"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Social Security wage base (USD)">
          <input
            type="number"
            min="0"
            step="100"
            value={wageBase}
            onChange={(e) => setBase(e.target.value)}
          />
        </Field>
        <Field label="Payments already allocated to this reserve (USD)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
          />
        </Field>
        <p className="muted">
          Default rates are planning assumptions, not your personal tax
          brackets. Adjust for your situation.
        </p>
      </section>
      <section className="tax-result">
        <span className="eyebrow">ESTIMATED CONTRACT TAX RESERVE</span>
        <h2>{valid ? money(r.remaining) : "Enter valid inputs"}</h2>
        <p>Remaining amount to set aside</p>
        {valid && (
          <>
            <div>
              <span>Self-employment tax</span>
              <strong>{money(r.se)}</strong>
            </div>
            <div>
              <span>Federal + state income reserve</span>
              <strong>{money(r.income)}</strong>
            </div>
            <div>
              <span>Total before payments</span>
              <strong>{money(r.total)}</strong>
            </div>
            <div className="quarter">
              <span>Four equal savings installments</span>
              <strong>{money(r.quarter)}</strong>
            </div>
          </>
        )}
      </section>
      <section className="panel padded full">
        <h3>How this estimate works</h3>
        <p>
          Self-employment earnings = 92.35% of positive net profit. Social
          Security = 12.4% up to the wage base remaining after your W-2 wages.
          Medicare = 2.9% of those earnings. Income reserve applies your
          selected effective rates to profit less half the self-employment tax.
        </p>
        <p>
          This is a savings calculator, not a tax return or IRS
          estimated-payment schedule. It excludes Additional Medicare Tax,
          deductions, credits, QBI, filing status, progressive brackets,
          prior-year safe harbor, and W-2 withholding. Gross W-2 wages may
          differ from Social Security wages; verify your records. Expenses are
          treated as fully deductible for this estimate—review eligibility,
          meals, capital purchases, and business use with a tax professional. A
          negative profit produces no reserve. Known wage bases are provided for
          2024–2026; enter the applicable limit for other years.
        </p>
      </section>
    </div>
  );
}
function Chat({
  ledger,
  year,
  onExtract,
}: {
  ledger: Ledger;
  year: number;
  onExtract: (entry: Omit<Entry, "id">, image: Screenshot) => void;
}) {
  const [provider, setProvider] = useState<Provider>("ollama"),
    [base, setBase] = useState(providers.ollama.base as string),
    [key, setKey] = useState(""),
    [model, setModel] = useState(""),
    [list, setList] = useState<string[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [context, setContext] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [remember, setRemember] = useState(false);
  const [image, setImage] = useState<Screenshot | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  async function extract() {
    if (!image || busy) return;
    setBusy(true);
    setError("");
    try {
      if (!key.trim()) throw Error("Enter your provider API key first.");
      if (!model.trim()) throw Error("Choose a vision-capable model first.");
      const result = answer(
        await request(visionSpec(provider, base, key, model, image)),
      );
      const draft = parseExtraction(result, today());
      onExtract(draft, image);
      setImage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      if (!key.trim()) throw Error("Enter your provider API key first.");
      const result = await discover(provider, base, key);
      if (!result.length)
        throw Error("No models returned. Enter a model ID manually.");
      setList(result);
      setModel(result.includes(model) ? model : result[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    const next: Message[] = [
      ...messages,
      { role: "user", content: text.trim() },
    ];
    try {
      if (!key.trim()) throw Error("Enter an API key in the provider panel.");
      if (remember && window.desktop && base === providers[provider].base)
        await window.desktop.key(provider, key);
      const payload = context
        ? "User explicitly shared these records as JSON: " +
          JSON.stringify({
            year,
            totals: totals(ledger, year),
            contracts: ledger.contracts,
            documentNotes: ledger.documents.map(
              ({ data, fileName, mime, ...d }) => d,
            ),
          })
        : "No workspace records shared.";
      if (payload.length > 80000)
        throw Error(
          "Workspace context is too large. Turn off sharing and paste only the relevant details.",
        );
      const result = answer(
        await request(
          spec(provider, base, key, model, next.slice(-20), payload),
        ),
      );
      setMessages([...next, { role: "assistant", content: result }]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function speak(content: string) {
    try {
      if (!window.desktop)
        throw Error("Bundled eSpeak speech is available in the desktop app.");
      audio.current?.pause();
      const wav = await window.desktop.speak(content);
      audio.current = new Audio("data:audio/wav;base64," + wav);
      await audio.current.play();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="chat-layout">
      <section className="panel provider-panel">
        <h2>Connect your assistant</h2>
        <p>Bring your own API key. Provider usage may incur charges.</p>
        <Field label="AI provider">
          <select
            value={provider}
            disabled={busy}
            onChange={(e) => {
              const p = e.target.value as Provider;
              setProvider(p);
              setBase(providers[p].base);
              setKey("");
              setModel("");
              setList([]);
              setRemember(false);
              setMessages([]);
            }}
          >
            {Object.entries(providers).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="HTTPS API endpoint">
          <input
            type="url"
            value={base}
            disabled={busy}
            onChange={(e) => {
              setBase(e.target.value);
              setKey("");
              setList([]);
              setModel("");
            }}
          />
        </Field>
        <Field label="API key">
          <input
            type="password"
            autoComplete="off"
            value={key}
            disabled={busy}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Kept in this session by default"
          />
        </Field>
        {window.desktop && (
          <>
            <label className="check-field">
              <input
                type="checkbox"
                checked={remember}
                disabled={
                  base !== providers[provider].base || provider === "custom"
                }
                onChange={(e) => setRemember(e.target.checked)}
              />{" "}
              Save with Windows credential encryption
            </label>
            <div className="button-row">
              <button
                className="text-button"
                disabled={busy || base !== providers[provider].base}
                onClick={() =>
                  window.desktop
                    ?.key(provider)
                    .then(setKey)
                    .catch((e) => setError(String(e)))
                }
              >
                Load saved key
              </button>
              <button
                className="text-button"
                onClick={() =>
                  window.desktop
                    ?.key(provider, "")
                    .then(() => {
                      setKey("");
                      setRemember(false);
                      setError("Saved key removed.");
                    })
                    .catch((e) => setError(String(e)))
                }
              >
                Forget saved key
              </button>
            </div>
          </>
        )}
        <button className="secondary" disabled={busy} onClick={refresh}>
          {busy ? "Working…" : "Refresh available models"}
        </button>
        <Field label="Model ID">
          <input
            list="model-list"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Refresh or enter an exact model ID"
          />
          <datalist id="model-list">
            {list.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <small>
          Live discovery lists models available from your provider, including
          new releases. Not all models support text chat.
        </small>
        <section className="screenshot-panel">
          <h3>Read a screenshot</h3>
          <p>
            Choose a receipt or payment screenshot. Only Analyze sends it to
            your provider. Pick a vision-capable model.
          </p>
          <input
            aria-label="Upload screenshot"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                setImage(await readScreenshot(file));
                setError("");
              } catch (error) {
                setError(String(error));
              }
            }}
          />
          {image && (
            <>
              <img
                className="screenshot-preview"
                alt="Screenshot to analyze"
                src={"data:" + image.mime + ";base64," + image.data}
              />
              <small>{image.name} · Sent only when you choose Analyze.</small>
              <div className="button-row">
                <button className="primary" disabled={busy} onClick={extract}>
                  Analyze & review
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setImage(null)}
                >
                  Remove image
                </button>
              </div>
            </>
          )}
          <small>
            PNG, JPEG, WebP · 4 MB maximum. Review all fields before saving. AI
            may misread images. This sends the image even when workspace sharing
            is off.
          </small>
        </section>
        <label className="check-field context">
          <input
            type="checkbox"
            checked={context}
            onChange={(e) => setContext(e.target.checked)}
          />{" "}
          Share workspace context with this provider
        </label>
        <small>
          Shares yearly totals, contract details, and document titles/notes on
          each message. Attachment contents and individual transactions are
          excluded. Leave off to chat without records.
        </small>
      </section>
      <section className="panel chat-panel">
        <div className="section-heading">
          <div>
            <h2>
              <span className="ai-dot" /> PrimeLedger assistant
            </h2>
            <p>
              {context ? "Workspace sharing enabled" : "Workspace sharing off"}{" "}
              · Session-only conversation
            </p>
          </div>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setMessages([])}
          >
            Clear chat
          </button>
        </div>
        <div className="messages">
          {!messages.length && (
            <Empty
              title="Let’s make sense of it together."
              text="Ask about organizing receipts, preparing for a client conversation, or understanding your tax reserve."
              action={
                <div className="prompts">
                  {[
                    "What records should I keep as a contractor?",
                    "Help me review a contract before signing.",
                    "How should I organize quarterly tax payments?",
                  ].map((q) => (
                    <button key={q} onClick={() => setText(q)}>
                      {q} <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              }
            />
          )}{" "}
          {messages.map((m, i) => (
            <article key={i} className={"message " + m.role}>
              <small>{m.role === "user" ? "YOU" : "PRIMELEDGER"}</small>
              <div>{m.content}</div>
              {m.role === "assistant" && window.desktop && (
                <button
                  className="text-button"
                  onClick={() => speak(m.content)}
                >
                  <Volume2 size={15} /> Read with eSpeak
                </button>
              )}
            </article>
          ))}
          {busy && <p className="thinking">Connecting to your provider…</p>}
          <div ref={bottom} />
        </div>
        {error && (
          <div role="alert" className="error chat-error">
            {error}
          </div>
        )}
        <form className="chat-input" onSubmit={send}>
          <textarea
            aria-label="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={12000}
            placeholder="Ask your assistant…"
            rows={2}
          />
          <button
            className="primary"
            aria-label="Send message"
            disabled={busy || !text.trim()}
          >
            <Send size={18} />
          </button>
        </form>
        <div className="chat-footer">
          AI can make mistakes. Verify financial and legal guidance.
          {window.desktop && (
            <button
              className="text-button"
              onClick={() => audio.current?.pause()}
            >
              Stop speech
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
