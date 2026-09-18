"""Minimal in-memory state + JSONL audit (no database)."""

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from .models import SentinelDecision
from .policy import APPROVAL_TTL, _now

AUDIT_PATH = Path(__file__).resolve().parent.parent / "audit.jsonl"


class ApprovalStore:
    """Single-use, actionId-specific, expiring approvals."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._approvals: dict[str, dict] = {}

    def approve(self, action_id: str) -> dict:
        now = _now()
        record = {
            "actionId": action_id,
            "approvedAt": now.isoformat(),
            "expiresAt": (now + APPROVAL_TTL).isoformat(),
            "consumed": False,
        }
        with self._lock:
            self._approvals[action_id] = record
        return record

    def claim(self, action_id: str) -> dict | None:
        """Return a fresh, unconsumed approval claim, or None."""
        with self._lock:
            rec = self._approvals.get(action_id)
            if not rec or rec["consumed"]:
                return None
            exp = datetime.fromisoformat(rec["expiresAt"])
            if _now() > exp:
                return None
            return {"actionId": action_id, "approvedAt": rec["approvedAt"]}

    def consume(self, action_id: str) -> None:
        with self._lock:
            rec = self._approvals.get(action_id)
            if rec:
                rec["consumed"] = True

    def reset(self) -> None:
        with self._lock:
            self._approvals.clear()


approvals = ApprovalStore()


class DenialStore:
    """Per-actionId human denials. Not a policy change and not global:
    denying action X only blocks X. Checked before approvals, so a denied
    action can never be resurrected by a later approval."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._denied: set[str] = set()

    def deny(self, action_id: str) -> None:
        with self._lock:
            self._denied.add(action_id)

    def is_denied(self, action_id: str) -> bool:
        with self._lock:
            return action_id in self._denied

    def reset(self) -> None:
        with self._lock:
            self._denied.clear()


denials = DenialStore()

_audit_lock = Lock()


def append_audit(
    decision: SentinelDecision,
    executed: bool = False,
    value_ref: str | None = None,
) -> None:
    """Audit log contains references only — never raw secret values."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "actionId": decision.actionId,
        "decision": decision.decision.value,
        "policyId": decision.policyId,
        "reason": decision.reason,
        "dataClass": decision.dataClass.value,
        "provenance": decision.provenance,
        "trust": decision.trust.value,
        "destination": decision.destination.value,
        "valueRef": value_ref,
        "executed": executed,
    }
    with _audit_lock:
        with open(AUDIT_PATH, "a") as f:
            f.write(json.dumps(entry) + "\n")


def read_audit(limit: int = 100) -> list[dict]:
    if not AUDIT_PATH.exists():
        return []
    with _audit_lock:
        lines = AUDIT_PATH.read_text().splitlines()
    entries = [json.loads(line) for line in lines if line.strip()]
    return entries[-limit:][::-1]


def reset_all() -> None:
    approvals.reset()
    denials.reset()
    with _audit_lock:
        if AUDIT_PATH.exists():
            AUDIT_PATH.unlink()
