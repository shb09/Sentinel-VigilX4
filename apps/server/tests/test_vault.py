"""Phase 7 tests: vault classification, references, no secret leakage."""

import json

from app import vault


def test_list_refs_exposes_no_values():
    refs = vault.list_refs()
    assert len(refs) == 7
    blob = json.dumps(refs)
    assert "rahul@example.com" not in blob
    assert "demo-only" not in blob
    assert any(r["ref"] == "[EMAIL_1]" for r in refs)


def test_classify_email_phone_secret():
    assert vault.classify("email", "rahul@example.com")["dataClass"] == "PII"
    assert vault.classify("phone", "+1-555-0142")["dataClass"] == "PII"
    assert vault.classify("password", "x")["dataClass"] == "CREDENTIAL"
    assert vault.classify("api_key", "x")["dataClass"] == "SECRET"
    assert vault.classify("notes", "hello")["dataClass"] == "ORDINARY"


def test_resolve_known_and_unknown():
    assert vault.resolve("[EMAIL_1]") == "rahul@example.com"
    assert vault.resolve("[NOPE]") is None
    assert vault.resolve(None) is None


def test_audit_never_contains_secrets(tmp_path, monkeypatch):
    """Decide + audit a fill carrying a resolved value; audit file must
    not contain the value or any seed secret."""
    from fastapi.testclient import TestClient

    import app.store as store_mod
    from app.main import app

    monkeypatch.setattr(store_mod, "AUDIT_PATH", tmp_path / "audit.jsonl")
    client = TestClient(app)
    action = {
        "actionId": "vault-audit-1",
        "type": "fill",
        "target": "#ticket",
        "value": "rahul@example.com",
        "valueRef": "[EMAIL_1]",
        "source": "agent",
        "destination": "SAME_ORIGIN",
        "provenance": "USER",
        "dataClass": "ORDINARY",
        "trust": "TRUSTED",
    }
    assert client.post("/api/decide", json={"action": action}).status_code == 200
    content = (tmp_path / "audit.jsonl").read_text()
    assert "rahul@example.com" not in content
    assert "demo-only" not in content
    assert "vault-audit-1" in content
