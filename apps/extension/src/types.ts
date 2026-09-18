/* Shared Sentinel types (mirrors backend Pydantic models). Keep in sync. */
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
