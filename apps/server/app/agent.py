"""Minimal real agent loop (Phase 3).

USER TASK → OBSERVE → PLAN → STRUCTURED ACTION → SENTINEL → WAIT →
EXECUTE IF AUTHORIZED → OBSERVE AGAIN → COMPLETE.

The agent never touches the browser directly and never decides security.
Every step goes through service.execute_if_allowed (Sentinel decides).
"""

from . import browser
from .llm import plan_next_action
from .models import ActionProposal
from .service import execute_if_allowed

STATES = (
    "IDLE,OBSERVING,PLANNING,ACTION_PROPOSED,WAITING_FOR_SENTINEL,"
    "WAITING_FOR_APPROVAL,EXECUTING,COMPLETED,BLOCKED,ERROR"
).split(",")

_last_run: dict = {"state": "IDLE", "trace": []}


def run_task(
    task: str,
    max_steps: int = 3,
    _observe=None,
    _execute=None,
) -> dict:
    """Run the loop synchronously. _observe/_execute are injectable for
    tests; production defaults use the real browser + Sentinel gate."""
    observe = _observe or browser.observe
    execute = _execute or execute_if_allowed
    trace: list[dict] = []

    for _ in range(max_steps):
        trace.append({"state": "OBSERVING"})
        try:
            observation = observe()
        except Exception as e:
            trace.append({"state": "ERROR", "error": str(e)[:200]})
            _store(task, "ERROR", trace)
            return {"task": task, "state": "ERROR", "trace": trace}
        obs_summary = {
            "url": observation.get("url"),
            "title": observation.get("title"),
        }

        trace.append({"state": "PLANNING", "observation": obs_summary})
        try:
            action: ActionProposal | None = plan_next_action(task, observation)
        except Exception as e:
            trace.append({"state": "ERROR", "error": str(e)[:200]})
            _store(task, "ERROR", trace)
            return {"task": task, "state": "ERROR", "trace": trace}

        if action is None:
            trace.append({"state": "COMPLETED", "reason": "No further action planned."})
            _store(task, "COMPLETED", trace)
            return {"task": task, "state": "COMPLETED", "trace": trace}

        trace.append(
            {
                "state": "ACTION_PROPOSED",
                "action": action.model_dump(),
            }
        )
        trace.append({"state": "WAITING_FOR_SENTINEL", "actionId": action.actionId})
        outcome = execute(action)
        decision = outcome["decision"]
        d = decision.model_dump() if hasattr(decision, "model_dump") else decision
        trace.append(
            {
                "state": "EXECUTING"
                if outcome["executed"]
                else ("WAITING_FOR_APPROVAL" if d["decision"] == "REVIEW" else "BLOCKED"),
                "actionId": action.actionId,
                "decision": d,
                "executed": outcome["executed"],
                "result": outcome.get("result"),
                "error": outcome.get("error"),
            }
        )
        if d["decision"] == "BLOCK":
            _store(task, "BLOCKED", trace)
            return {
                "task": task,
                "state": "BLOCKED",
                "trace": trace,
                "blockedActionId": action.actionId,
            }
        if d["decision"] == "REVIEW":
            _store(task, "WAITING_FOR_APPROVAL", trace)
            return {
                "task": task,
                "state": "WAITING_FOR_APPROVAL",
                "trace": trace,
                "pendingActionId": action.actionId,
                "pendingAction": action.model_dump(),
                "pendingDecision": d,
            }
        # ALLOW + executed → observe again (loop continues)

    trace.append({"state": "COMPLETED", "reason": "Max steps reached."})
    _store(task, "COMPLETED", trace)
    return {"task": task, "state": "COMPLETED", "trace": trace}


def _store(task: str, state: str, trace: list[dict]) -> None:
    global _last_run
    _last_run = {"task": task, "state": state, "trace": trace}


def last_run() -> dict:
    return _last_run
