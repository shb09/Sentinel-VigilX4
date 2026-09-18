import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ArrowDown, Puzzle } from "lucide-react";
import { api } from "../lib/api";
import type { AuditEntry } from "../lib/types";

export function Hero() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-20 text-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="accent-text flex items-center justify-center gap-2">
          <ShieldCheck size={22} />
          <span className="text-xs font-semibold tracking-[0.3em]">SENTINEL</span>
        </div>
        <h1 className="mt-4 text-5xl font-bold leading-tight">
          AI agents can act.
          <br />
          Who authorizes them?
        </h1>
        <p className="mt-4 text-lg text-slate-400">
          Sentinel is an authorization and privacy layer between AI agents and the web.
        </p>
        <a
          href="#operate"
          className="btn-primary mt-8 inline-block rounded-xl px-8 py-3"
        >
          TRY THE DEMO
        </a>
      </motion.div>
    </div>
  );
}

const FLOW = ["AGENT", "SENTINEL", "ALLOW / REVIEW / BLOCK", "BROWSER"];

export function Architecture() {
  return (
    <div className="mx-auto mt-16 max-w-2xl px-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
        {FLOW.map((s, i) => (
          <div key={s} className="flex flex-col items-center">
            <div
              className={`rounded-lg border px-4 py-2 font-mono text-sm ${
                s === "SENTINEL"
                  ? "accent-ring text-slate-100"
                  : "border-white/10 bg-black/30 text-slate-200"
              }`}
            >
              {s}
            </div>
            {i < FLOW.length - 1 && <ArrowDown size={16} className="my-2 text-slate-500" />}
          </div>
        ))}
        <p className="mt-4 text-center text-xs text-slate-500">
          The agent proposes actions. Sentinel independently authorizes them. Only
          authorized actions reach the browser.
        </p>
      </div>
    </div>
  );
}

const RULES = [
  ["POL-ALLOW-TRUSTED-ORDINARY", "ALLOW", "Ordinary low-risk action in a trusted context."],
  ["POL-REVIEW-SENSITIVE-SUBMIT", "REVIEW", "PII / Sensitive + consequential submit or send."],
  ["POL-BLOCK-SECRET-EXFIL", "BLOCK", "Secret / credential to an external or untrusted destination."],
  ["POL-BLOCK-UNTRUSTED-EXFIL", "BLOCK", "PII / Sensitive to an untrusted external destination."],
  ["POL-BLOCK-AUTH", "BLOCK", "Missing, stale, or mismatched authorization."],
  ["POL-APPROVED", "ALLOW", "Valid single-use human approval for this actionId."],
];

export function Security() {
  const [refs, setRefs] = useState<{ ref: string; label: string; dataClass: string }[]>([]);
  useEffect(() => {
    api.vault().then(setRefs).catch(() => {});
  }, []);
  return (
    <div className="mx-auto mt-20 max-w-3xl px-6">
      <h2 className="text-2xl font-bold">Security</h2>
      <p className="mt-2 text-sm text-slate-400">
        Deterministic policy engine. Precedence: BLOCK &gt; REVIEW &gt; ALLOW. The LLM
        never decides; the frontend never decides — Sentinel owns authorization.
      </p>
      <div className="mt-4 space-y-2">
        {RULES.map(([id, d, reason]) => (
          <div key={id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
            <span
              className={`mt-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                d === "ALLOW" ? "bg-emerald-400/15 text-emerald-300" : d === "REVIEW" ? "bg-amber-400/15 text-amber-300" : "bg-red-400/15 text-red-300"
              }`}
            >
              {d}
            </span>
            <div>
              <span className="font-mono text-xs text-slate-200">{id}</span>
              <p className="text-xs text-slate-400">{reason}</p>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-8 text-lg font-bold">User Data Vault (demo)</h3>
      <p className="mt-1 text-sm text-slate-400">
        Sensitive values are classified before unnecessary exposure and represented
        by references where possible.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(refs.length ? refs : [
          { ref: "[NAME_1]", label: "name", dataClass: "PII" },
          { ref: "[EMAIL_1]", label: "email", dataClass: "PII" },
          { ref: "[PHONE_1]", label: "phone", dataClass: "PII" },
          { ref: "[ADDRESS_1]", label: "address", dataClass: "SENSITIVE" },
          { ref: "[USERNAME_1]", label: "username", dataClass: "ORDINARY" },
          { ref: "[PASSWORD_1]", label: "password", dataClass: "CREDENTIAL" },
          { ref: "[SECRET_1]", label: "api key", dataClass: "SECRET" },
        ]).map((r) => (
          <div key={r.ref} className="rounded-xl border border-white/10 bg-black/30 p-2.5 font-mono text-xs">
            <div className="text-slate-100">{r.ref}</div>
            <div className="text-slate-500">{r.label} · {r.dataClass}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        In-memory demo storage only — not production credential storage. Values never
        appear in prompts, the UI, or the audit log.
      </p>
    </div>
  );
}

export function Provenance({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  useEffect(() => {
    api.audit(5).then(setEntries).catch(() => {});
  }, [refreshKey]);
  const latest = entries[0];
  return (
    <div className="mx-auto mt-20 max-w-3xl px-6">
      <h2 className="text-2xl font-bold">Provenance</h2>
      <p className="mt-2 text-sm text-slate-400">
        Where every authorized action came from — live from the audit log.
      </p>
      {!latest && <p className="mt-4 text-sm text-slate-500">No actions yet. Run a scenario above.</p>}
      {latest && (
        <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-xs">
          {[
            `provenance: ${latest.provenance}`,
            `data: ${latest.dataClass}`,
            `trust: ${latest.trust}`,
            `destination: ${latest.destination}`,
            `${latest.decision} (${latest.policyId})`,
            `executed: ${String(latest.executed)}`,
          ].map((chip) => (
            <span key={chip} className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-slate-200">
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function AuditView({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  useEffect(() => {
    api.audit(50).then(setEntries).catch(() => {});
  }, [refreshKey]);
  return (
    <div className="mx-auto mt-20 max-w-4xl px-6">
      <h2 className="text-2xl font-bold">Audit</h2>
      <p className="mt-2 text-sm text-slate-400">
        Every decision Sentinel made. References only — raw secrets are never logged.
      </p>
      {entries.length === 0 && <p className="mt-4 text-sm text-slate-500">Empty. Run a scenario to populate it.</p>}
      <div className="mt-4 space-y-2">
        {entries.map((e) => (
          <div key={`${e.ts}-${e.actionId}`} className="grid gap-1 rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs md:grid-cols-[170px_90px_1fr]">
            <span className="text-slate-500">{e.ts.slice(11, 19)} · {e.actionId}</span>
            <span className={e.decision === "ALLOW" ? "text-emerald-300" : e.decision === "REVIEW" ? "text-amber-300" : "text-red-300"}>
              {e.decision}
            </span>
            <span className="text-slate-400">
              {e.policyId} · {e.dataClass} · {e.provenance} · {e.destination} · exec:{String(e.executed)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExtensionView({ refreshKey }: { refreshKey: number }) {
  const [health, setHealth] = useState("checking…");
  const [counts, setCounts] = useState({ ALLOW: 0, REVIEW: 0, BLOCK: 0 });
  const [latest, setLatest] = useState<AuditEntry | null>(null);
  useEffect(() => {
    api.health().then((h) => setHealth(h.status)).catch(() => setHealth("unreachable"));
    api.audit(50).then((entries) => {
      setCounts({
        ALLOW: entries.filter((e) => e.decision === "ALLOW").length,
        REVIEW: entries.filter((e) => e.decision === "REVIEW").length,
        BLOCK: entries.filter((e) => e.decision === "BLOCK").length,
      });
      setLatest(entries[0] ?? null);
    }).catch(() => {});
  }, [refreshKey]);
  return (
    <div className="mx-auto mt-20 max-w-3xl px-6 pb-24">
      <h2 className="flex items-center gap-2 text-2xl font-bold">
        <Puzzle size={22} /> Extension
      </h2>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
        <p className="font-mono text-sm">SENTINEL · Protection: ON</p>
        <p className="mt-1 font-mono text-xs text-slate-400">Backend: {health}</p>
        <div className="mt-3 flex gap-4 font-mono text-xs">
          <span className="text-emerald-300">Allowed {counts.ALLOW}</span>
          <span className="text-amber-300">Review {counts.REVIEW}</span>
          <span className="text-red-300">Blocked {counts.BLOCK}</span>
        </div>
        <p className="mt-3 text-xs text-slate-300">
          Latest: {latest ? `${latest.decision} — ${latest.dataClass} · ${latest.provenance} · ${latest.destination} (${latest.policyId})` : "none yet"}
        </p>
        {latest?.decision === "BLOCK" && (
          <p className="mt-1 text-xs text-red-300">Browser execution prevented.</p>
        )}
        <p className="mt-4 text-xs text-slate-400">
          Load it: <span className="font-mono">apps/extension/dist/chrome</span> (Chrome →
          chrome://extensions → Load unpacked) or{" "}
          <span className="font-mono">dist/firefox</span> (Firefox → about:debugging →
          Load Temporary Add-on). It reads live status from this backend.
        </p>
        <a href="#operate" className="mt-3 inline-block rounded-lg border border-white/15 px-4 py-2 text-xs hover:bg-white/10">
          OPEN SENTINEL
        </a>
      </div>
    </div>
  );
}
