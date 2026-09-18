"""Deterministic Sentinel authorization engine (Phase 1).

Precedence: BLOCK > REVIEW > ALLOW.
No LLM, no heuristics — pure rules over action + authorization.
"""

from datetime import datetime, timedelta, timezone

from .models import (
    ActionProposal,
    DataClass,
    Decision,
    Destination,
    SentinelDecision,
    Trust,
)

APPROVAL_TTL = timedelta(minutes=5)

# Low-risk action types that can ever be ALLOW.
LOW_RISK_TYPES = {"navigate", "click", "fill"}
# Consequential types that trigger REVIEW with PII/SENSITIVE.
CONSEQUENTIAL_TYPES = {"submit", "send"}

EXTERNAL_DESTINATIONS = {
    Destination.KNOWN_EXTERNAL,
    Destination.UNKNOWN_EXTERNAL,
    Destination.UNTRUSTED_EXTERNAL,
}

TRUSTED_DESTINATIONS = {
    Destination.SAME_ORIGIN,
    Destination.TRUSTED_ORIGIN,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_time(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _block(action: ActionProposal, policy_id: str, reason: str) -> SentinelDecision:
    return SentinelDecision(
        actionId=action.actionId,
        decision=Decision.BLOCK,
        policyId=policy_id,
        reason=reason,
        dataClass=action.dataClass,
        provenance=action.provenance,
        trust=action.trust,
        destination=action.destination,
    )


def evaluate(
    action: ActionProposal,
    authorization: dict | None = None,
    now: datetime | None = None,
) -> SentinelDecision:
    """Authorize a single action. `authorization` is an optional approval claim:
    {"actionId": str, "approvedAt": iso-timestamp}. If present it must match
    the action and be fresh, otherwise BLOCK (rule 4)."""
    now = now or _now()
    atype = action.type.lower().strip()

    # ---- Rule 4: missing/stale/mismatched authorization → BLOCK ----
    if authorization is not None:
        claimed_id = authorization.get("actionId")
        approved_at = _parse_time(authorization.get("approvedAt"))
        if not claimed_id or approved_at is None:
            return _block(
                action, "POL-BLOCK-AUTH",
                "Missing or malformed authorization claim.",
            )
        if claimed_id != action.actionId:
            return _block(
                action, "POL-BLOCK-AUTH",
                f"Authorization mismatch: claim for {claimed_id} "
                f"does not match action {action.actionId}.",
            )
        if now - approved_at > APPROVAL_TTL:
            return _block(
                action, "POL-BLOCK-AUTH",
                "Stale authorization: approval expired.",
            )

    # ---- Rule 3: SECRET/CREDENTIAL → external/untrusted → BLOCK ----
    if action.dataClass in (DataClass.SECRET, DataClass.CREDENTIAL):
        if action.destination in EXTERNAL_DESTINATIONS or action.trust == Trust.UNTRUSTED:
            return _block(
                action, "POL-BLOCK-SECRET-EXFIL",
                f"{action.dataClass.value} data to "
                f"{action.destination.value} with trust {action.trust.value} "
                "is never allowed.",
            )

    # ---- Escalation: PII/SENSITIVE → untrusted external → BLOCK ----
    # (Supports the Phase 4 attack scenario: customer PII exfiltrated to an
    # attacker-controlled destination. Not heuristic prompt-injection
    # detection — just independent authorization of data + destination.)
    if action.dataClass in (DataClass.PII, DataClass.SENSITIVE):
        if action.destination == Destination.UNTRUSTED_EXTERNAL:
            return _block(
                action, "POL-BLOCK-UNTRUSTED-EXFIL",
                f"{action.dataClass.value} data to UNTRUSTED_EXTERNAL "
                "destination is blocked.",
            )
        if (
            action.destination == Destination.UNKNOWN_EXTERNAL
            and action.provenance in ("INDIRECT_PAGE", "UNTRUSTED_PAGE")
            and atype in CONSEQUENTIAL_TYPES
        ):
            return _block(
                action, "POL-BLOCK-UNTRUSTED-EXFIL",
                f"{action.dataClass.value} submission from untrusted page "
                "provenance to unknown external destination is blocked.",
            )

    # ---- Rule 2: PII/SENSITIVE + consequential SUBMIT/SEND → REVIEW ----
    if (
        action.dataClass in (DataClass.PII, DataClass.SENSITIVE)
        and atype in CONSEQUENTIAL_TYPES
    ):
        if authorization is not None:
            # Valid (fresh, matching) approval presented → ALLOW, single use
            # enforced by the store layer consuming it.
            return SentinelDecision(
                actionId=action.actionId,
                decision=Decision.ALLOW,
                policyId="POL-APPROVED",
                reason="Human approval verified for this actionId.",
                dataClass=action.dataClass,
                provenance=action.provenance,
                trust=action.trust,
                destination=action.destination,
            )
        return SentinelDecision(
            actionId=action.actionId,
            decision=Decision.REVIEW,
            policyId="POL-REVIEW-SENSITIVE-SUBMIT",
            reason=(
                f"{action.dataClass.value} {atype.upper()} requires "
                "human approval."
            ),
            dataClass=action.dataClass,
            provenance=action.provenance,
            trust=action.trust,
            destination=action.destination,
        )

    # ---- Rule 1: ordinary + low-risk + trusted context → ALLOW ----
    if (
        action.dataClass in (DataClass.PUBLIC, DataClass.ORDINARY)
        and atype in LOW_RISK_TYPES
        and action.trust == Trust.TRUSTED
        and action.destination in TRUSTED_DESTINATIONS
    ):
        return SentinelDecision(
            actionId=action.actionId,
            decision=Decision.ALLOW,
            policyId="POL-ALLOW-TRUSTED-ORDINARY",
            reason="Ordinary low-risk action in trusted context.",
            dataClass=action.dataClass,
            provenance=action.provenance,
            trust=action.trust,
            destination=action.destination,
        )

    # ---- Default: anything not explicitly allowed needs review ----
    return SentinelDecision(
        actionId=action.actionId,
        decision=Decision.REVIEW,
        policyId="POL-DEFAULT-REVIEW",
        reason="No allow rule matched; human review required.",
        dataClass=action.dataClass,
        provenance=action.provenance,
        trust=action.trust,
        destination=action.destination,
    )
