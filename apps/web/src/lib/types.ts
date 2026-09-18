/* Shared Sentinel action/decision types (mirrors backend Pydantic models). */

export type DataClass =
  | "PUBLIC"
  | "ORDINARY"
  | "PII"
  | "SENSITIVE"
  | "SECRET"
  | "CREDENTIAL";

export type Trust = "TRUSTED" | "UNKNOWN" | "UNTRUSTED";

export type Destination =
  | "SAME_ORIGIN"
  | "TRUSTED_ORIGIN"
  | "KNOWN_EXTERNAL"
  | "UNKNOWN_EXTERNAL"
  | "UNTRUSTED_EXTERNAL";

export type Decision = "ALLOW" | "REVIEW" | "BLOCK";

export interface ActionProposal {
  actionId: string;
  type: string;
  target: string;
  value?: string | null;
  valueRef?: string | null;
  source: string;
  destination: Destination;
  provenance: string;
  dataClass: DataClass;
  trust: Trust;
}

export interface SentinelDecision {
  actionId: string;
  decision: Decision;
  policyId: string;
  reason: string;
  dataClass: DataClass;
  provenance: string;
  trust: Trust;
  destination: Destination;
}

export interface Scenario {
  id: "safe" | "sensitive" | "attack";
  title: string;
  task: string;
  description: string;
  expected: Decision;
}

export interface TraceStep {
  state: string;
  actionId?: string;
  action?: ActionProposal;
  decision?: SentinelDecision;
  observation?: { url?: string; title?: string };
  executed?: boolean;
  result?: Record<string, unknown> | null;
  error?: string | null;
  reason?: string;
}

export interface AgentRun {
  task?: string;
  scenario?: string;
  state: string;
  trace: TraceStep[];
  pendingActionId?: string;
  pendingAction?: ActionProposal;
  pendingDecision?: SentinelDecision;
  blockedActionId?: string;
  navigation?: { decision: SentinelDecision; executed: boolean };
}

export interface AuditEntry {
  ts: string;
  actionId: string;
  decision: Decision;
  policyId: string;
  reason: string;
  dataClass: DataClass;
  provenance: string;
  trust: Trust;
  destination: Destination;
  executed: boolean;
}
