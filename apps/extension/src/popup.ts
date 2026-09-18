/* Popup: renders live protection state from the local backend.
   Falls back to cached storage when the backend is unreachable. */

const API = "http://localhost:8000";

interface AuditEntry {
  actionId: string;
  decision: "ALLOW" | "REVIEW" | "BLOCK";
  dataClass: string;
  provenance: string;
  destination: string;
  policyId: string;
  reason: string;
  executed: boolean;
  valueRef?: string | null;
}

interface VaultRef {
  ref: string;
  label: string;
  dataClass: string;
}

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function renderCounts(entries: AuditEntry[]): void {
  const n = (d: string) => entries.filter((e) => e.decision === d).length;
  const a = el("c-allow");
  const r = el("c-review");
  const b = el("c-block");
  if (a) a.textContent = `Allowed ${n("ALLOW")}`;
  if (r) r.textContent = `Review ${n("REVIEW")}`;
  if (b) b.textContent = `Blocked ${n("BLOCK")}`;
}

function renderLatest(e: AuditEntry | null): void {
  const box = el("latest");
  if (!box) return;
  if (!e) {
    box.textContent = "Latest decision: none yet";
    return;
  }
  box.innerHTML = "";
  const head = document.createElement("div");
  head.className = e.decision;
  head.textContent = e.decision === "BLOCK" ? "BLOCKED" : e.decision;
  const detail = document.createElement("div");
  detail.textContent = `${e.dataClass} · ${e.provenance} · ${e.destination} (${e.policyId})`;
  box.append(head, detail);
  if (e.valueRef) {
    const masked = document.createElement("div");
    masked.textContent = `Data seen: ${e.valueRef} (masked reference — value never leaves the server)`;
    box.append(masked);
  }
  if (e.decision === "BLOCK" && !e.executed) {
    const note = document.createElement("div");
    note.textContent = "Browser execution prevented.";
    box.append(note);
  }
}

function renderVault(refs: VaultRef[]): void {
  const box = el("vault");
  if (!box) return;
  box.innerHTML = "";
  if (!refs.length) {
    box.textContent = "Vault unreachable";
    return;
  }
  for (const r of refs) {
    const row = document.createElement("div");
    row.className = "maskrow";
    const label = document.createElement("span");
    label.textContent = r.label;
    const bar = document.createElement("span");
    bar.className = "maskbar";
    bar.textContent = "████████";
    const ref = document.createElement("span");
    ref.className = "ref";
    ref.textContent = r.ref;
    const cls = document.createElement("span");
    cls.className = `cls-${r.dataClass}`;
    cls.textContent = r.dataClass;
    row.append(label, bar, ref, cls);
    box.append(row);
  }
  const foot = document.createElement("div");
  foot.className = "row";
  foot.textContent = "Raw values received: 0 — masking enforced server-side.";
  box.append(foot);
}

async function render(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const page = el("page");
    if (page) page.textContent = `Current page: ${tab?.url ?? "—"}`;
  } catch {
    /* no tabs permission context */
  }

  try {
    const [h, a, s, v] = await Promise.all([
      fetch(`${API}/api/health`).then((r) => r.json()),
      fetch(`${API}/api/audit?limit=100`).then((r) => r.json()),
      fetch(`${API}/api/agent/state`).then((r) => r.json()),
      fetch(`${API}/api/vault`).then((r) => r.json()).catch(() => ({ refs: [] })),
    ]);
    const health = el("health");
    if (health) health.textContent = `Backend: ${String(h.status)}`;
    const entries = (a.entries ?? []) as AuditEntry[];
    renderCounts(entries);
    renderLatest(entries[0] ?? null);
    renderVault((v.refs ?? []) as VaultRef[]);
    const agent = el("agent");
    if (agent) agent.textContent = `Agent: ${String(s.state ?? "IDLE")}`;
    await chrome.storage.local.set({ health: h.status });
  } catch {
    const stored = await chrome.storage.local.get(["health"]);
    const health = el("health");
    if (health) health.textContent = `Backend: ${String(stored.health ?? "unreachable")}`;
  }

  el("open")?.addEventListener("click", () => {
    void chrome.tabs.create({ url: "http://localhost:5173" });
  });
}

void render();

export {};
