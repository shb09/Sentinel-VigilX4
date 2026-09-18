/* Thin client for the real Sentinel backend. No security logic here —
   the frontend never decides; it only displays backend state. */

import type { ActionProposal, AgentRun, AuditEntry, Scenario } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<{ status: string; service: string }>("/api/health"),
  scenarios: () =>
    req<{ scenarios: Scenario[] }>("/api/scenarios").then((r) => r.scenarios),
  runScenario: (id: string) =>
    req<AgentRun>(`/api/scenarios/${id}/run`, { method: "POST", body: "{}" }),
  runTask: (task: string, maxSteps = 2) =>
    req<AgentRun>("/api/agent/run", {
      method: "POST",
      body: JSON.stringify({ task, maxSteps }),
    }),
  decide: (action: ActionProposal) =>
    req<import("./types").SentinelDecision>("/api/decide", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  approve: (actionId: string) =>
    req<{ actionId: string }>("/api/approve", {
      method: "POST",
      body: JSON.stringify({ actionId }),
    }),
  deny: (action: ActionProposal) =>
    req<{
      decision: import("./types").SentinelDecision;
      executed: boolean;
    }>("/api/deny", { method: "POST", body: JSON.stringify({ action }) }),
  execute: (action: ActionProposal) =>
    req<{
      decision: import("./types").SentinelDecision;
      executed: boolean;
      result: Record<string, unknown> | null;
      error?: string;
    }>("/api/execute", { method: "POST", body: JSON.stringify({ action }) }),
  audit: (limit = 50) =>
    req<{ entries: AuditEntry[] }>(`/api/audit?limit=${limit}`).then(
      (r) => r.entries
    ),
  browserStatus: () =>
    req<{ running: boolean; url: string; title: string }>("/api/browser/status"),
  reset: () => req<{ status: string }>("/api/reset", { method: "POST", body: "{}" }),
  vault: () =>
    req<{ refs: { ref: string; label: string; dataClass: string }[] }>("/api/vault").then(
      (r) => r.refs
    ),
};
