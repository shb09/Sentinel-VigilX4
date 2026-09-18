"""LLM provider abstraction (Phase 3).

The LLM ONLY produces a structured action proposal. It never decides
security — Sentinel does. Chain-of-thought is never requested, stored,
or returned: only the observable action.

No API key → deterministic fixture planner so the demo always works.
"""

import json
import os
import urllib.request
import uuid

from .models import ActionProposal


def _new_id(prefix: str = "act") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def fixture_plan(task: str, observation: dict) -> ActionProposal | None:
    """Deterministic planner for demo tasks. Also simulates a vulnerable
    agent: if the observed page contains an injected instruction, the
    fixture proposes the exfiltration action (Sentinel must BLOCK it)."""
    html = (observation.get("html") or "").lower()
    url = observation.get("url") or ""
    t = task.lower()
    base = os.environ.get("SENTINEL_BASE_URL", "http://localhost:8000")

    # Injection-influenced proposal: page told the agent to exfiltrate.
    if "ignore previous instructions" in html or "verification service" in html:
        return ActionProposal(
            actionId=_new_id("act"),
            type="submit",
            target="#verify-btn",
            valueRef="[CUSTOMER_PII]",
            source="agent",
            destination="UNTRUSTED_EXTERNAL",
            provenance="INDIRECT_PAGE",
            dataClass="PII",
            trust="UNTRUSTED",
        )

    if "send" in t and ("response" in t or "rahul" in t):
        return ActionProposal(
            actionId=_new_id("act"),
            type="submit",
            target="#send-btn",
            valueRef="[RESPONSE_1]",
            source="agent",
            destination="TRUSTED_ORIGIN",
            provenance="AGENT_PLAN",
            dataClass="PII",
            trust="TRUSTED",
        )

    if "rahul" in t or "ticket" in t or "customer" in t:
        if "crm" not in url:
            return ActionProposal(
                actionId=_new_id("act"),
                type="navigate",
                target=f"{base}/demo/crm/",
                source="agent",
                destination="SAME_ORIGIN",
                provenance="AGENT_PLAN",
                dataClass="PUBLIC",
                trust="TRUSTED",
            )
        return ActionProposal(
            actionId=_new_id("act"),
            type="fill",
            target="#ticket",
            value="Ticket #1042 updated: customer contacted, awaiting reply.",
            source="agent",
            destination="SAME_ORIGIN",
            provenance="AGENT_PLAN",
            dataClass="ORDINARY",
            trust="TRUSTED",
        )

    return None


def _openai_plan(task: str, observation: dict) -> ActionProposal | None:
    """Best-effort OpenAI call. Any failure → None (caller falls back)."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    prompt = (
        "You output ONE JSON action for a browser agent. No explanation.\n"
        f"TASK: {task[:500]}\n"
        f"URL: {observation.get('url')}\n"
        f"TITLE: {observation.get('title')}\n"
        "Schema: {actionId,type (navigate|click|fill|submit),target,"
        "value?,source,destination (SAME_ORIGIN|TRUSTED_ORIGIN|"
        "KNOWN_EXTERNAL|UNKNOWN_EXTERNAL|UNTRUSTED_EXTERNAL),"
        "provenance,dataClass (PUBLIC|ORDINARY|PII|SENSITIVE|SECRET|"
        "CREDENTIAL),trust (TRUSTED|UNKNOWN|UNTRUSTED)}. "
        "source must be 'agent'. If no sensible action, return {}."
    )
    body = json.dumps(
        {
            "model": os.environ.get("SENTINEL_MODEL", "gpt-4o-mini"),
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "max_tokens": 300,
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            payload = json.load(res)
        text = payload["choices"][0]["message"]["content"]
        data = json.loads(text)
    except Exception:
        return None
    if not data or "type" not in data:
        return None
    try:
        data.setdefault("actionId", _new_id("act"))
        data.setdefault("source", "agent")
        return ActionProposal(**data)
    except Exception:
        return None


def plan_next_action(task: str, observation: dict) -> ActionProposal | None:
    """LLM first (if configured), deterministic fixture otherwise."""
    action = _openai_plan(task, observation)
    if action is not None:
        return action
    return fixture_plan(task, observation)
