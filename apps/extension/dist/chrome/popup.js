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
    if (e.decision === "BLOCK" && !e.executed) {
        const note = document.createElement("div");
        note.textContent = "Browser execution prevented.";
        box.append(note);
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
        const [h, a, s] = await Promise.all([
            fetch(`${API}/api/health`).then((r) => r.json()),
            fetch(`${API}/api/audit?limit=100`).then((r) => r.json()),
            fetch(`${API}/api/agent/state`).then((r) => r.json()),
        ]);
        const health = el("health");
        if (health)
            health.textContent = `Backend: ${String(h.status)}`;
        const entries = (a.entries ?? []);
        renderCounts(entries);
        renderLatest(entries[0] ?? null);
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
