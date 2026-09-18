"""Phase 1 acceptance tests: deterministic policy engine."""

from datetime import timedelta

from app.models import ActionProposal
from app.policy import _now, evaluate


def make_action(**overrides) -> ActionProposal:
    base = {
        "actionId": "act-1",
        "type": "fill",
        "target": "#ticket",
        "valueRef": None,
        "source": "agent",
        "destination": "SAME_ORIGIN",
        "provenance": "USER",
        "dataClass": "ORDINARY",
        "trust": "TRUSTED",
    }
    base.update(overrides)
    return ActionProposal(**base)


def test_safe_action_allow():
    action = make_action()
    d = evaluate(action)
    assert d.decision.value == "ALLOW"
    assert d.policyId == "POL-ALLOW-TRUSTED-ORDINARY"
    assert d.actionId == "act-1"


def test_sensitive_submission_review():
    action = make_action(
        actionId="act-2",
        type="submit",
        dataClass="PII",
        provenance="AGENT_PLAN",
        destination="TRUSTED_ORIGIN",
    )
    d = evaluate(action)
    assert d.decision.value == "REVIEW"
    assert d.policyId == "POL-REVIEW-SENSITIVE-SUBMIT"


def test_secret_external_block():
    action = make_action(
        actionId="act-3",
        type="send",
        target="https://evil.example.com/collect",
        dataClass="SECRET",
        trust="UNTRUSTED",
        destination="UNTRUSTED_EXTERNAL",
        provenance="INDIRECT_PAGE",
    )
    d = evaluate(action)
    assert d.decision.value == "BLOCK"
    assert d.policyId == "POL-BLOCK-SECRET-EXFIL"


def test_stale_authorization_block():
    action = make_action(actionId="act-4", type="submit", dataClass="PII")
    stale = {"actionId": "act-4", "approvedAt": (_now() - timedelta(minutes=30)).isoformat()}
    d = evaluate(action, authorization=stale)
    assert d.decision.value == "BLOCK"
    assert d.policyId == "POL-BLOCK-AUTH"


def test_mismatched_authorization_block():
    action = make_action(actionId="act-5")
    other = {"actionId": "act-other", "approvedAt": _now().isoformat()}
    d = evaluate(action, authorization=other)
    assert d.decision.value == "BLOCK"


def test_valid_approval_allows_review_action():
    action = make_action(actionId="act-6", type="send", dataClass="SENSITIVE")
    auth = {"actionId": "act-6", "approvedAt": _now().isoformat()}
    d = evaluate(action, authorization=auth)
    assert d.decision.value == "ALLOW"
    assert d.policyId == "POL-APPROVED"


def test_block_beats_approval():
    action = make_action(
        actionId="act-7", type="send", dataClass="CREDENTIAL",
        destination="UNTRUSTED_EXTERNAL", trust="UNTRUSTED",
    )
    auth = {"actionId": "act-7", "approvedAt": _now().isoformat()}
    d = evaluate(action, authorization=auth)
    assert d.decision.value == "BLOCK"


def test_pii_untrusted_external_block():
    action = make_action(
        actionId="act-8", type="submit", dataClass="PII",
        destination="UNTRUSTED_EXTERNAL", provenance="INDIRECT_PAGE",
    )
    d = evaluate(action)
    assert d.decision.value == "BLOCK"
