"""Human Block (deny) for pending REVIEW actions + approve-once behavior.

Uses a fake browser (call counter) so no Chromium launches; the real
policy engine, approval store, denial store, and audit path are exercised.
"""

from fastapi.testclient import TestClient

from app import browser as browser_mod
from app.main import app

client = TestClient(app)


def sensitive_action(action_id: str) -> dict:
    return {
        "actionId": action_id,
        "type": "submit",
        "target": "#send-btn",
        "valueRef": "[RESPONSE_1]",
        "source": "agent",
        "destination": "TRUSTED_ORIGIN",
        "provenance": "AGENT_PLAN",
        "dataClass": "PII",
        "trust": "TRUSTED",
    }


def safe_action(action_id: str) -> dict:
    return {
        "actionId": action_id,
        "type": "fill",
        "target": "#ticket",
        "value": "Ticket update.",
        "source": "agent",
        "destination": "SAME_ORIGIN",
        "provenance": "AGENT_PLAN",
        "dataClass": "ORDINARY",
        "trust": "TRUSTED",
    }


class FakeBrowser:
    def __init__(self):
        self.calls: list = []

    def __call__(self, action):
        self.calls.append(action)
        return {"url": "http://localhost:8000/demo/crm/", "submitted": action.target}


def test_sensitive_reaches_review():
    r = client.post("/api/decide", json={"action": sensitive_action("deny-rev-1")})
    assert r.json()["decision"] == "REVIEW"


def test_approve_executes_exactly_once(monkeypatch):
    fake = FakeBrowser()
    monkeypatch.setattr(browser_mod, "execute_authorized", fake)
    action = sensitive_action("deny-appr-1")
    client.post("/api/approve", json={"actionId": "deny-appr-1"})
    out = client.post("/api/execute", json={"action": action}).json()
    assert out["decision"]["decision"] == "ALLOW"
    assert out["executed"] is True
    assert len(fake.calls) == 1
    # Reuse: REVIEW again, no second execution.
    out2 = client.post("/api/execute", json={"action": action}).json()
    assert out2["decision"]["decision"] == "REVIEW"
    assert out2["executed"] is False
    assert len(fake.calls) == 1


def test_block_results_in_blocked_not_executed(monkeypatch):
    fake = FakeBrowser()
    monkeypatch.setattr(browser_mod, "execute_authorized", fake)
    action = sensitive_action("deny-block-1")
    assert client.post("/api/decide", json={"action": action}).json()["decision"] == "REVIEW"
    denied = client.post("/api/deny", json={"action": action}).json()
    assert denied["decision"]["decision"] == "BLOCK"
    assert denied["decision"]["policyId"] == "POL-DENIED-BY-HUMAN"
    assert denied["executed"] is False
    assert len(fake.calls) == 0


def test_blocked_action_cannot_be_approved_afterwards(monkeypatch):
    fake = FakeBrowser()
    monkeypatch.setattr(browser_mod, "execute_authorized", fake)
    action = sensitive_action("deny-block-2")
    client.post("/api/deny", json={"action": action})
    # Late approval must not resurrect it.
    client.post("/api/approve", json={"actionId": "deny-block-2"})
    out = client.post("/api/execute", json={"action": action}).json()
    assert out["decision"]["decision"] == "BLOCK"
    assert out["decision"]["policyId"] == "POL-DENIED-BY-HUMAN"
    assert out["executed"] is False
    assert len(fake.calls) == 0
    # /api/decide agrees (no executable state left).
    assert client.post("/api/decide", json={"action": action}).json()["decision"] == "BLOCK"


def test_denial_is_recorded_in_audit_without_secrets():
    entries = client.get("/api/audit?limit=100").json()["entries"]
    denied = [e for e in entries if e["policyId"] == "POL-DENIED-BY-HUMAN"]
    assert len(denied) >= 2
    assert all(e["decision"] == "BLOCK" and e["executed"] is False for e in denied)
    import json as _json

    blob = _json.dumps(denied)
    assert "demo-only" not in blob


def test_safe_still_allow_and_executes(monkeypatch):
    fake = FakeBrowser()
    monkeypatch.setattr(browser_mod, "execute_authorized", fake)
    out = client.post("/api/execute", json={"action": safe_action("deny-safe-1")}).json()
    assert out["decision"]["decision"] == "ALLOW"
    assert out["executed"] is True
    assert len(fake.calls) == 1


def test_attack_proposal_still_blocked():
    evil = {
        "actionId": "deny-atk-1",
        "type": "submit",
        "target": "#verify-btn",
        "valueRef": "[CUSTOMER_PII]",
        "source": "agent",
        "destination": "UNTRUSTED_EXTERNAL",
        "provenance": "INDIRECT_PAGE",
        "dataClass": "PII",
        "trust": "UNTRUSTED",
    }
    out = client.post("/api/execute", json={"action": evil}).json()
    assert out["decision"]["decision"] == "BLOCK"
    assert out["executed"] is False
