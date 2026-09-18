/* Background worker: polls the local Sentinel backend and caches
   protection status for the popup + badge. No security logic here.
 *
 * LIVE-MASKING RECEIVER (page → background boundary):
 * Accepts ONLY {kind, fieldKey, label, dataClass, reference, present}
 * metadata from the content script. There is NO code path here that reads,
 * requests, logs, stores, or forwards a raw field value — validation below
 * allowlists the exact key set and drops anything else. Raw values received
 * by this worker across its lifetime: 0, by construction.
 */

const API = "http://localhost:8000";

const FIELD_CLASSES = ["EMAIL", "PHONE", "SECRET", "NAME", "TEXT"];

interface LiveField {
  fieldKey: string;
  label: string;
  dataClass: string;
  reference: string;
  tabId: number;
  updatedAt: number;
}

const liveFields: Record<string, LiveField> = {};
let rejectedMessages = 0;

async function persistLive(): Promise<void> {
  try {
    await chrome.storage.local.set({ liveFields, rejectedMessages });
  } catch {
    /* storage unavailable — popup falls back */
  }
}

function isFieldMessage(msg: unknown): msg is Record<string, unknown> {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.kind === "sentinel-field" &&
    typeof m.fieldKey === "string" &&
    typeof m.label === "string" &&
    typeof m.dataClass === "string" &&
    FIELD_CLASSES.includes(m.dataClass) &&
    typeof m.reference === "string" &&
    typeof m.present === "boolean" &&
    // present entries must carry a well-formed reference; removals carry none
    (m.present ? /^\[(EMAIL|PHONE|SECRET|NAME|TEXT)_\d+\]$/.test(m.reference) : m.reference === "")
  );
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!isFieldMessage(msg)) {
    rejectedMessages += 1; // malformed: never stored, never forwarded
    void persistLive();
    return;
  }
  const tabId = sender.tab?.id ?? -1;
  const key = `${tabId}::${msg.fieldKey}`;
  if (msg.present) {
    liveFields[key] = {
      fieldKey: msg.fieldKey as string,
      label: (msg.label as string).slice(0, 40),
      dataClass: msg.dataClass as string,
      reference: msg.reference as string,
      tabId,
      updatedAt: Date.now(),
    };
  } else {
    delete liveFields[key];
  }
  void persistLive();
});

try {
  chrome.tabs.onRemoved.addListener((tabId) => {
    for (const key of Object.keys(liveFields)) {
      if (key.startsWith(`${tabId}::`)) delete liveFields[key];
    }
    void persistLive();
  });
} catch {
  /* tabs events unavailable — ignore */
}

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
