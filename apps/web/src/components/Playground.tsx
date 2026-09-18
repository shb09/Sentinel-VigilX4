import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { api } from "../lib/api";
import type { ActionProposal, AgentRun, Scenario, SentinelDecision } from "../lib/types";

/* Human-decision outcome, bound to the exact actionId that produced it.
   Rendered only when it matches the currently displayed run. */
interface Resolution {
  actionId: string;
  kind: "approved" | "blocked";
  decision: SentinelDecision;
  executed: boolean;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

type Tone = "allow" | "review" | "block";

function toneCard(tone: Tone) {
  return tone === "allow"
    ? "border-emerald-300/30 bg-emerald-300/10"
    : tone === "review"
      ? "border-amber-300/30 bg-amber-300/10"
      : "border-red-300/30 bg-red-400/10";
}

function toneTitle(tone: Tone) {
  return tone === "allow"
    ? "text-emerald-200"
    : tone === "review"
      ? "text-amber-200"
      : "text-red-200";
}

/* Live demo page per scenario — the REAL page the agent acts on,
   served by the backend and embedded here so judges see cause + effect. */
const SCENARIO_PAGES: Record<string, { url: string; label: string }> = {
  safe: { url: "/demo/crm/", label: "Acme CRM — customer record" },
  sensitive: { url: "/demo/crm/", label: "Acme CRM — support response" },
  attack: { url: "/demo/malicious-page/", label: "Mirrored help article (untrusted)" },
};

/* One consistent Sentinel result card for every scenario outcome. */
function ResultCard({
  tone,
  badge,
  title,
  subtitle,
  policyId,
  reason,
  execStatus,
  executed,
  children,
}: {
  tone: Tone;
  badge: SentinelDecision["decision"];
  title: string;
  subtitle?: string;
  policyId: string;
  reason?: string;
  execStatus: string;
  executed: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 text-xs ${toneCard(tone)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <DecisionBadge d={badge} />
        <strong className={`tracking-widest ${toneTitle(tone)}`}>{title}</strong>
        {subtitle && <span className={toneTitle(tone)}>{subtitle}</span>}
      </div>
      <p className="mt-2 tracking-widest text-slate-400">SENTINEL DECISION</p>
      <p className="font-mono text-slate-200">
        {policyId}
        {reason ? ` — ${reason}` : ""}
      </p>
      <p className="mt-2 tracking-widest text-slate-400">EXECUTION</p>
      <p className="font-mono text-slate-200">
        {execStatus} · executed: {String(executed)}
      </p>
      {children}
    </div>
  );
}

/* Compact readable lines from a real backend execution result. Never faked:
   only keys actually present in the result are shown. */
function describeResult(result: Record<string, unknown> | null | undefined): string[] {
  if (!result) return [];
  const lines: string[] = [];
  if (typeof result.url === "string") lines.push(`URL: ${result.url}`);
  if (typeof result.filled === "string") lines.push(`Action: filled ${result.filled}`);
  else if (typeof result.submitted === "string")
    lines.push(`Action: submitted ${result.submitted}`);
  else if (typeof result.clicked === "string") lines.push(`Action: clicked ${result.clicked}`);
  else if (typeof result.title === "string") lines.push(`Action: navigated · ${result.title}`);
  if (typeof result.status === "string" && result.status) lines.push(`Page: ${result.status}`);
  return lines;
}

function destLabel(d: string): string {
  switch (d) {
    case "UNTRUSTED_EXTERNAL":
      return "untrusted external destination";
    case "UNKNOWN_EXTERNAL":
      return "unknown external destination";
    case "KNOWN_EXTERNAL":
      return "known external destination";
    case "TRUSTED_ORIGIN":
      return "trusted destination";
    default:
      return "same origin";
  }
}

/* Concise explanation derived from the actual backend decision. */
function explainDecision(d: SentinelDecision): string {
  return `${d.dataClass} + ${d.trust.toLowerCase()} source + ${destLabel(d.destination)}`;
}

function DecisionBadge({ d }: { d: SentinelDecision["decision"] }) {
  const cls =
    d === "ALLOW"
      ? "bg-emerald-400/15 text-emerald-300 border-emerald-300/30"
      : d === "REVIEW"
        ? "bg-amber-400/15 text-amber-300 border-amber-300/30"
        : "bg-red-400/15 text-red-300 border-red-300/30";
  const Icon = d === "ALLOW" ? ShieldCheck : d === "REVIEW" ? ShieldAlert : ShieldX;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold tracking-widest ${cls}`}
    >
      <Icon size={14} />
      {d}
    </span>
  );
}

export default function Playground({
  onActivity,
}: {
  onActivity: () => void;
}) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<string>("safe");
  const [run, setRun] = useState<AgentRun | null>(null);
  const [running, setRunning] = useState(false);
  const [browserUrl, setBrowserUrl] = useState("about:blank");
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [denying, setDenying] = useState(false);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [pageRefresh, setPageRefresh] = useState(0);
  // Challenge Sentinel: judge-crafted action, real /api/decide verdict.
  const [chType, setChType] = useState("submit");
  const [chData, setChData] = useState("PII");
  const [chTrust, setChTrust] = useState("UNTRUSTED");
  const [chDest, setChDest] = useState("UNTRUSTED_EXTERNAL");
  const [chProv, setChProv] = useState("INDIRECT_PAGE");
  const [chTarget, setChTarget] = useState("#verify-btn");
  const [chVerdict, setChVerdict] = useState<SentinelDecision | null>(null);
  const [chJudging, setChJudging] = useState(false);
  const busyRef = useRef(false);
  const resolved = resolution !== null;

  useEffect(() => {
    api
      .scenarios()
      .then(setScenarios)
      .catch(() => setError("Backend unreachable. Start it: uvicorn app.main:app --app-dir apps/server --port 8000"));
    api.browserStatus().then((s) => setBrowserUrl(s.url)).catch(() => {});
  }, []);

  const refreshBrowser = useCallback(() => {
    api.browserStatus().then((s) => setBrowserUrl(s.url)).catch(() => {});
  }, []);

  const handleRun = async () => {
    if (busyRef.current) return;
    setRunning(true);
    setError(null);
    setRun(null);
    setResolution(null);
    try {
      const r = await api.runScenario(selected);
      setRun(r);
      onActivity();
    } catch (e) {
      setError(e instanceof Error ? e.message : "run failed");
    } finally {
      setRunning(false);
      setPageRefresh((n) => n + 1);
      refreshBrowser();
    }
  };

  const handleApprove = async () => {
    if (!run?.pendingAction || busyRef.current) return;
    busyRef.current = true;
    setApproving(true);
    const action = run.pendingAction;
    const actionId = run.pendingActionId!;
    try {
      await api.approve(actionId);
      const out = await api.execute(action);
      // Real backend outcome only — never invented here.
      setResolution({
        actionId,
        kind: "approved",
        decision: out.decision,
        executed: out.executed,
        result: out.result,
        error: out.error,
      });
      onActivity();
    } catch (e) {
      setResolution({
        actionId,
        kind: "approved",
        decision: run.pendingDecision!,
        executed: false,
        result: null,
        error: e instanceof Error ? e.message : "approval failed",
      });
    } finally {
      setApproving(false);
      busyRef.current = false;
      setPageRefresh((n) => n + 1);
      refreshBrowser();
    }
  };

  const handleBlock = async () => {
    if (!run?.pendingAction || busyRef.current) return;
    busyRef.current = true;
    setDenying(true);
    const action = run.pendingAction;
    const actionId = run.pendingActionId!;
    try {
      const out = await api.deny(action);
      // Block never carries a browser result — enforced by construction:
      // only decision + executed:false are stored.
      setResolution({
        actionId,
        kind: "blocked",
        decision: out.decision,
        executed: false,
        result: null,
      });
      onActivity();
    } catch (e) {
      setResolution({
        actionId,
        kind: "blocked",
        decision: run.pendingDecision!,
        executed: false,
        result: null,
        error: e instanceof Error ? e.message : "block failed",
      });
    } finally {
      setDenying(false);
      busyRef.current = false;
      setPageRefresh((n) => n + 1);
      refreshBrowser();
    }
  };

  const handleReset = async () => {
    await api.reset().catch(() => {});
    setRun(null);
    setResolution(null);
    setChVerdict(null);
    setBrowserUrl("about:blank");
    onActivity();
  };

  const handleChallenge = async () => {
    setChJudging(true);
    setChVerdict(null);
    try {
      const action = {
        actionId: `challenge-${crypto.randomUUID().slice(0, 8)}`,
        type: chType,
        target: chTarget || "#verify-btn",
        source: "challenge",
        destination: chDest as ActionProposal["destination"],
        provenance: chProv,
        dataClass: chData as ActionProposal["dataClass"],
        trust: chTrust as ActionProposal["trust"],
      };
      setChVerdict(await api.decide(action));
      onActivity();
    } catch (e) {
      setError(e instanceof Error ? e.message : "challenge failed");
    } finally {
      setChJudging(false);
    }
  };

  const current = scenarios.find((s) => s.id === selected);
  const lastDecision: SentinelDecision | undefined = run?.trace
    .filter((t) => t.decision)
    .map((t) => t.decision!)[0];
  const proposed = run?.trace.find((t) => t.action)?.action;
  // Only the outcome belonging to the currently displayed pending action
  // may render — stale results from previous runs can never appear.
  const activeResolution =
    resolution && run && resolution.actionId === run.pendingActionId
      ? resolution
      : null;
  const terminalSteps = run?.trace.filter((t) => t.executed !== undefined) ?? [];
  const finalStep = terminalSteps[terminalSteps.length - 1];
  const blockedStep = run?.trace.find(
    (t) => t.decision?.decision === "BLOCK" && t.executed === false
  );
  const errorStep = run?.trace.find((t) => t.state === "ERROR");

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400/70" />
        <span className="h-3 w-3 rounded-full bg-amber-400/70" />
        <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
        <div className="ml-3 flex-1 truncate rounded-lg bg-black/40 px-3 py-1.5 font-mono text-xs text-slate-300">
          {browserUrl}
        </div>
        <button
          onClick={handleReset}
          className="ml-2 inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      <div className="grid gap-0 md:grid-cols-[280px_1fr]">
        {/* scenario picker */}
        <div className="border-b border-white/10 p-4 md:border-b-0 md:border-r">
          <p className="text-xs font-semibold tracking-widest text-slate-400">SCENARIOS</p>
          <div className="mt-3 space-y-2">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selected === s.id
                    ? "accent-ring"
                    : "border-white/10 bg-black/20 hover:border-white/25"
                }`}
              >
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="mt-1 text-xs text-slate-400">expects {s.expected}</div>
              </button>
            ))}
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {running ? "Agent running…" : "Run scenario"}
          </button>
          {current && (
            <p className="mt-3 text-xs leading-relaxed text-slate-400">{current.description}</p>
          )}
          {current && (
            <p className="mt-2 font-mono text-xs text-slate-500">task: “{current.task}”</p>
          )}
        </div>

        {/* live trace */}
        <div className="min-h-[320px] p-4">
          {error && <p className="text-sm text-red-300">{error}</p>}
          {!run && !running && !error && (
            <p className="text-sm text-slate-500">
              Pick a scenario and press <strong>Run scenario</strong>. The agent will
              observe a real page, propose a structured action, and Sentinel will
              authorize it — every card below is real backend state.
            </p>
          )}
          {running && (
            <p className="inline-flex items-center gap-2 text-sm text-slate-300">
              <Loader2 size={16} className="animate-spin" /> Agent observing → planning →
              proposing → Sentinel deciding → browser executing…
            </p>
          )}
          <AnimatePresence>
            {run && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-white/10 px-3 py-1 font-mono">
                    agent: {run.state}
                  </span>
                  {run.scenario && (
                    <span className="rounded-full bg-white/10 px-3 py-1 font-mono">
                      scenario: {run.scenario}
                    </span>
                  )}
                  {lastDecision && <DecisionBadge d={lastDecision.decision} />}
                </div>

                {run.navigation && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs">
                    <span className="text-slate-400">setup navigate → </span>
                    <strong>{run.navigation.decision.decision}</strong>
                    <span className="text-slate-400">
                      {" "}· executed: {String(run.navigation.executed)}
                    </span>
                  </div>
                )}

                {proposed && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-xs tracking-widest text-slate-400">ACTION PROPOSAL</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                      <span className="text-slate-500">actionId</span>
                      <span className="truncate text-slate-200">{proposed.actionId}</span>
                      <span className="text-slate-500">type → target</span>
                      <span className="text-slate-200">{proposed.type} → {proposed.target}</span>
                      <span className="text-slate-500">dataClass</span>
                      <span className="text-slate-200">{proposed.dataClass}</span>
                      <span className="text-slate-500">provenance</span>
                      <span className="text-slate-200">{proposed.provenance}</span>
                      <span className="text-slate-500">trust → destination</span>
                      <span className="text-slate-200">{proposed.trust} → {proposed.destination}</span>
                    </div>
                  </div>
                )}

                {/* Consistent terminal result cards — one structure for every
                    scenario, all values from real backend state. */}
                {run.state === "COMPLETED" &&
                  finalStep?.executed &&
                  finalStep.decision && (
                    <ResultCard
                      tone="allow"
                      badge="ALLOW"
                      title="AUTHORIZED"
                      policyId={finalStep.decision.policyId}
                      reason={finalStep.decision.reason}
                      execStatus="COMPLETED"
                      executed
                    >
                      <p className="mt-1 text-emerald-200">✓ Browser action executed</p>
                      {describeResult(finalStep.result).map((line) => (
                        <p key={line} className="font-mono text-slate-300">
                          {line}
                        </p>
                      ))}
                    </ResultCard>
                  )}

                {run.state === "WAITING_FOR_APPROVAL" && run.pendingDecision && (
                  <ResultCard
                    tone="review"
                    badge="REVIEW"
                    title="ACTION REQUIRES APPROVAL"
                    policyId={run.pendingDecision.policyId}
                    reason={run.pendingDecision.reason}
                    execStatus="WAITING_FOR_APPROVAL"
                    executed={false}
                  >
                    <p className="mt-1 text-amber-200">
                      Approval required for{" "}
                      <span className="font-mono">{run.pendingActionId}</span> (single-use).
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={handleApprove}
                        disabled={approving || denying || resolved}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-300 px-3 py-1.5 font-bold text-black hover:bg-amber-200 disabled:opacity-50"
                      >
                        {approving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Approve & execute
                      </button>
                      <button
                        onClick={handleBlock}
                        disabled={approving || denying || resolved}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300/50 px-3 py-1.5 font-bold text-red-200 hover:bg-red-400/15 disabled:opacity-50"
                      >
                        {denying ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                        Block
                      </button>
                    </div>
                  </ResultCard>
                )}
                {activeResolution?.kind === "approved" && (
                  <ResultCard
                    tone="allow"
                    badge={activeResolution.decision.decision}
                    title={activeResolution.executed ? "APPROVED" : "NOT EXECUTED"}
                    policyId={activeResolution.decision.policyId}
                    reason={activeResolution.decision.reason}
                    execStatus={activeResolution.executed ? "COMPLETED" : "NOT EXECUTED"}
                    executed={activeResolution.executed}
                  >
                    {activeResolution.executed && activeResolution.result ? (
                      <>
                        <p className="mt-1 text-emerald-200">✓ Executed after approval</p>
                        {describeResult(activeResolution.result).map((line) => (
                          <p key={line} className="font-mono text-slate-300">
                            {line}
                          </p>
                        ))}
                      </>
                    ) : (
                      <p className="mt-1 text-amber-200">
                        Not executed ({activeResolution.decision.decision}
                        {activeResolution.error ? ` — ${activeResolution.error}` : ""}).
                      </p>
                    )}
                  </ResultCard>
                )}
                {activeResolution?.kind === "blocked" && (
                  <ResultCard
                    tone="block"
                    badge="BLOCK"
                    title="BLOCKED"
                    subtitle="HUMAN DENIED"
                    policyId={`HUMAN-BLOCKED (${activeResolution.decision.policyId})`}
                    execStatus="BLOCKED"
                    executed={false}
                  >
                    <p className="mt-1 text-red-200">
                      ✕ Browser execution prevented
                      {activeResolution.error && ` — ${activeResolution.error}`}
                    </p>
                    <p className="text-slate-400">
                      Human approval was denied. The browser did not execute this action.
                    </p>
                  </ResultCard>
                )}
                {run.state === "BLOCKED" && blockedStep?.decision && (
                  <ResultCard
                    tone="block"
                    badge="BLOCK"
                    title="BLOCKED"
                    policyId={blockedStep.decision.policyId}
                    reason={blockedStep.decision.reason}
                    execStatus="BLOCKED"
                    executed={false}
                  >
                    <p className="mt-1 text-red-200">✕ Browser execution prevented</p>
                    <p className="font-mono text-slate-300">
                      {explainDecision(blockedStep.decision)}
                    </p>
                  </ResultCard>
                )}
                {run.state === "ERROR" && (
                  <ResultCard
                    tone="block"
                    badge="BLOCK"
                    title="ERROR"
                    policyId="AGENT-ERROR"
                    reason={errorStep?.error ?? "Agent run failed."}
                    execStatus="ERROR"
                    executed={false}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {(() => {
            const page = SCENARIO_PAGES[selected] ?? SCENARIO_PAGES.safe;
            return (
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                <div className="flex items-center gap-2 bg-black/30 px-3 py-2 font-mono text-[11px] text-slate-400">
                  <span className="tracking-widest">LIVE DEMO PAGE</span>
                  <span className="truncate">
                    {page.label} · {page.url}
                  </span>
                </div>
                <iframe
                  key={`${page.url}?live=${pageRefresh}`}
                  title="Live demo page"
                  src={`${page.url}?live=${pageRefresh}`}
                  className="h-80 w-full bg-white"
                />
                <p className="bg-black/30 px-3 py-1.5 text-[11px] text-slate-500">
                  The real page the agent acts on — watch it change as Sentinel
                  allows execution.
                </p>
              </div>
            );
          })()}
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-bold tracking-widest text-slate-200">
              CHALLENGE SENTINEL — YOU BE THE ATTACKER
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Craft any action. The real policy engine judges it — nothing executes.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-3">
              {(
                [
                  ["type", chType, setChType, ["navigate", "click", "fill", "submit"]],
                  ["data", chData, setChData, ["PUBLIC", "ORDINARY", "PII", "SENSITIVE", "SECRET", "CREDENTIAL"]],
                  ["trust", chTrust, setChTrust, ["TRUSTED", "UNKNOWN", "UNTRUSTED"]],
                  ["dest", chDest, setChDest, ["SAME_ORIGIN", "TRUSTED_ORIGIN", "KNOWN_EXTERNAL", "UNKNOWN_EXTERNAL", "UNTRUSTED_EXTERNAL"]],
                  ["provenance", chProv, setChProv, ["USER", "AGENT_PLAN", "TRUSTED_PAGE", "INDIRECT_PAGE"]],
                ] as [string, string, (v: string) => void, string[]][]
              ).map(([label, val, set, opts]) => (
                <label key={label} className="block">
                  <span className="text-slate-500">{label}</span>
                  <select
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-slate-200"
                  >
                    {opts.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="block">
                <span className="text-slate-500">target</span>
                <input
                  value={chTarget}
                  onChange={(e) => setChTarget(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-slate-200"
                />
              </label>
            </div>
            <button
              onClick={handleChallenge}
              disabled={chJudging}
              className="btn-primary mt-2 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs disabled:opacity-50"
            >
              {chJudging ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              Judge this action
            </button>
            {chVerdict && (
              <div className="mt-2">
                <ResultCard
                  tone={chVerdict.decision === "ALLOW" ? "allow" : chVerdict.decision === "REVIEW" ? "review" : "block"}
                  badge={chVerdict.decision}
                  title={chVerdict.decision}
                  policyId={chVerdict.policyId}
                  reason={chVerdict.reason}
                  execStatus="NOT EXECUTED (verdict only)"
                  executed={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
