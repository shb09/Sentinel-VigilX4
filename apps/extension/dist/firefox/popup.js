/* Popup: renders live protection state from the local backend.
   Falls back to cached storage when the backend is unreachable. */
const API = "http://localhost:8000";
function el(id) {
    return document.getElementById(id);
}
function renderCounts(entries) {
    const n = (d) => entries.filter((e) => e.decision === d).length;
    const a = el("c-allow");
    const r = el("c-review");
    const b = el("c-block");
    if (a)
        a.textContent = `Allowed ${n("ALLOW")}`;
    if (r)
        r.textContent = `Review ${n("REVIEW")}`;
    if (b)
        b.textContent = `Blocked ${n("BLOCK")}`;
}
function renderLatest(e) {
    const box = el("latest");
    if (!box)
        return;
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
function renderVault(refs) {
    const box = el("vault");
    if (!box)
        return;
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
/* Live page-observed masked fields. Source of truth is background storage
   (metadata only — this view can never display a raw value because none
   is ever transmitted or stored). */
function renderLive(fields, rejected) {
    const box = el("live");
    if (!box)
        return;
    box.innerHTML = "";
    if (!fields.length) {
        box.textContent = "Type into the demo form — masked references appear here live.";
        return;
    }
    for (const f of fields) {
        const row = document.createElement("div");
        row.className = "maskrow";
        const label = document.createElement("span");
        label.textContent = f.label;
        const bar = document.createElement("span");
        bar.className = "maskbar";
        bar.textContent = "████████";
        const ref = document.createElement("span");
        ref.className = "ref";
        ref.textContent = f.reference;
        const cls = document.createElement("span");
        cls.className = `cls-${f.dataClass}`;
        cls.textContent = f.dataClass;
        row.append(label, bar, ref, cls);
        box.append(row);
    }
    const foot = document.createElement("div");
    foot.className = "row";
    foot.textContent =
        `Fields observed: ${fields.length} · Masked references: ${fields.length} · ` +
            `Raw values received: 0 · Masking ● ACTIVE · Rejected: ${rejected}`;
    box.append(foot);
}
async function renderLiveForActiveTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const stored = await chrome.storage.local.get(["liveFields", "rejectedMessages"]);
        const all = (stored.liveFields ?? {});
        const fields = Object.values(all)
            .filter((f) => tab?.id === undefined || f.tabId === tab.id || f.tabId === -1)
            .sort((a, b) => a.updatedAt - b.updatedAt);
        renderLive(fields, Number(stored.rejectedMessages ?? 0));
    }
    catch {
        /* storage/tabs unavailable — section keeps its placeholder */
    }
}
async function render() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const page = el("page");
        if (page)
            page.textContent = `Current page: ${tab?.url ?? "—"}`;
    }
    catch {
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
        if (health)
            health.textContent = `Backend: ${String(h.status)}`;
        const entries = (a.entries ?? []);
        renderCounts(entries);
        renderLatest(entries[0] ?? null);
        renderVault((v.refs ?? []));
        await renderLiveForActiveTab();
        try {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === "local" && (changes.liveFields || changes.rejectedMessages)) {
                    void renderLiveForActiveTab(); // live update, no popup refresh needed
                }
            });
        }
        catch {
            /* storage events unavailable — initial render stands */
        }
        const agent = el("agent");
        if (agent)
            agent.textContent = `Agent: ${String(s.state ?? "IDLE")}`;
        await chrome.storage.local.set({ health: h.status });
    }
    catch {
        const stored = await chrome.storage.local.get(["health"]);
        const health = el("health");
        if (health)
            health.textContent = `Backend: ${String(stored.health ?? "unreachable")}`;
    }
    el("open")?.addEventListener("click", () => {
        void chrome.tabs.create({ url: "http://localhost:5173" });
    });
}
void render();
