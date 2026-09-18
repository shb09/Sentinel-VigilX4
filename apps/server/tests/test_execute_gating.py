"""Phase 2 gating tests: BLOCK/REVIEW/unknown actions never reach Playwright."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def base_action(**overrides):
    base = {
        "actionId": "g-1",
        "type": "submit",
        "target": "#verify-btn",
        "source": "agent",
        "destination": "UNTRUSTED_EXTERNAL",
        "provenance": "INDIRECT_PAGE",
        "dataClass": "SECRET",
        "trust": "UNTRUSTED",
    }
    base.update(overrides)
    return base


def test_block_never_executes():
    r = client.post("/api/execute", json={"action": base_action()})
    assert r.status_code == 200
    body = r.json()
    assert body["decision"]["decision"] == "BLOCK"
    assert body["executed"] is False


def test_review_never_executes_without_approval():
    action = base_action(
        actionId="g-2",
        type="submit",
        target="#send-btn",
        dataClass="PII",
        destination="TRUSTED_ORIGIN",
        provenance="AGENT_PLAN",
        trust="TRUSTED",
    )
    r = client.post("/api/execute", json={"action": action})
    body = r.json()
    assert body["decision"]["decision"] == "REVIEW"
    assert body["executed"] is False


def test_unknown_action_type_blocked():
    action = base_action(actionId="g-3", type="screenshot")
    r = client.post("/api/execute", json={"action": action})
    body = r.json()
    assert body["decision"]["decision"] == "BLOCK"
    assert body["executed"] is False
