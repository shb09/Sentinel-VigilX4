/* Background worker: polls the local Sentinel backend and caches
   protection status for the popup + badge. No security logic here. */

const API = "http://localhost:8000";

interface AuditEntry {
  decision: "ALLOW" | "REVIEW" | "BLOCK";
  dataClass: string;
  provenance: string;
  destination: string;
  policyId: string;
  executed: boolean;
}

async function refresh(): Promise<void> {
  const fallback = {
    health: "unreachable",
    latest: null as AuditEntry | null,
    counts: { ALLOW: 0, REVIEW: 0, BLOCK: 0 },
  };
  try {
    const [h, a] = await Promise.all([
      fetch(`${API}/api/health`).then((r) => r.json()),
      fetch(`${API}/api/audit?limit=100`).then((r) => r.json()),
    ]);
    const entries = (a.entries ?? []) as AuditEntry[];
    const status = {
      health: h.status ?? "unknown",
      latest: entries[0] ?? null,
      counts: {
        ALLOW: entries.filter((e) => e.decision === "ALLOW").length,
        REVIEW: entries.filter((e) => e.decision === "REVIEW").length,
        BLOCK: entries.filter((e) => e.decision === "BLOCK").length,
      },
    };
    await chrome.storage.local.set(status);
    try {
      const blocked = status.latest?.decision === "BLOCK";
      await chrome.action.setBadgeText({ text: blocked ? "!" : "" });
      if (blocked) await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    } catch {
      /* badges unsupported — ignore */
    }
  } catch {
    await chrome.storage.local.set(fallback);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void refresh();
  try {
    chrome.alarms.create("sentinel-poll", { periodInMinutes: 0.5 });
  } catch {
    /* alarms unavailable — ignore */
  }
});

try {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "sentinel-poll") void refresh();
  });
} catch {
  /* ignore */
}

export {};
