"""Single choke point: authorize-then-execute. Both /api/execute and the
agent loop go through here. Nothing else may call browser.execute_authorized."""

from . import browser, policy
from .models import ActionProposal, SentinelDecision
from .store import append_audit, approvals, denials
from .vault import resolve as resolve_ref


def denial_decision(action: ActionProposal) -> SentinelDecision | None:
    """Human denial for this exact actionId, if one exists. Checked before
    approvals: denial wins and can never be overridden by a later approval."""
    if denials.is_denied(action.actionId):
        return SentinelDecision(
            actionId=action.actionId,
            decision=policy.Decision.BLOCK,
            policyId="POL-DENIED-BY-HUMAN",
            reason="Blocked by human approval decision.",
            dataClass=action.dataClass,
            provenance=action.provenance,
            trust=action.trust,
            destination=action.destination,
        )
    return None


def deny(action: ActionProposal) -> SentinelDecision:
    """Record a human denial: invalidate any outstanding approval for this
    actionId, mark it denied, audit the BLOCK. Never executes."""
    approvals.consume(action.actionId)
    denials.deny(action.actionId)
    decision = denial_decision(action)
    assert decision is not None
    append_audit(decision, executed=False)
    return decision


def authorize(action: ActionProposal) -> SentinelDecision:
    denied = denial_decision(action)
    if denied is not None:
        return denied
    stored = approvals.claim(action.actionId)
    decision = policy.evaluate(action, authorization=stored)
    if decision.policyId == "POL-APPROVED":
        approvals.consume(action.actionId)
    return decision


def execute_if_allowed(action: ActionProposal) -> dict:
    """Returns {decision, executed, result?, error?}. BLOCK/REVIEW never
    touch the browser. Unknown types BLOCK."""
    atype = action.type.lower().strip()
    if atype not in browser.ALLOWED_TYPES:
        decision = SentinelDecision(
            actionId=action.actionId,
            decision=policy.Decision.BLOCK,
            policyId="POL-BLOCK-UNKNOWN-ACTION",
            reason=f"Unknown browser action: {action.type}",
            dataClass=action.dataClass,
            provenance=action.provenance,
            trust=action.trust,
            destination=action.destination,
        )
        append_audit(decision, executed=False)
        return {"decision": decision, "executed": False, "result": None}

    decision = authorize(action)
    if decision.decision != policy.Decision.ALLOW:
        append_audit(decision, executed=False)
        return {"decision": decision, "executed": False, "result": None}

    try:
        # Resolve value references server-side at execution time only.
        # The resolved value never enters the audit log.
        to_run = action
        if action.value is None and action.valueRef:
            resolved = resolve_ref(action.valueRef)
            if resolved is not None:
                to_run = action.model_copy(update={"value": resolved})
        result = browser.execute_authorized(to_run)
    except Exception as e:  # never fake success
        append_audit(decision, executed=False)
        return {
            "decision": decision,
            "executed": False,
            "result": None,
            "error": str(e)[:300],
        }
    append_audit(decision, executed=True)
    return {"decision": decision, "executed": True, "result": result}
