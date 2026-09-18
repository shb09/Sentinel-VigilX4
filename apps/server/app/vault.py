"""Demo User Data Vault (Phase 7).

In-memory ONLY — explicitly not production credential storage.
Sensitive values are classified locally and referenced ([EMAIL_1],
[PHONE_1], [SECRET_1]) so raw secrets never reach prompts, the UI,
or the audit log. Resolution happens server-side at execution time.
"""

import re

from .models import DataClass

# Seed demo user. Values live only in this process.
_SEED: list[tuple[str, str, str, DataClass]] = [
    ("NAME_1", "name", "Rahul Sharma", DataClass.PII),
    ("EMAIL_1", "email", "rahul@example.com", DataClass.PII),
    ("PHONE_1", "phone", "+1-555-0142", DataClass.PII),
    ("ADDRESS_1", "address", "14 Marina Road, Springfield", DataClass.SENSITIVE),
    ("USERNAME_1", "username", "rahul.s", DataClass.ORDINARY),
    ("PASSWORD_1", "password", "demo-only-password", DataClass.CREDENTIAL),
    ("SECRET_1", "api key", "demo-only-api-key", DataClass.SECRET),
]

_ref_to_value: dict[str, str] = {f"[{ref}]": value for ref, _, value, _ in _SEED}
_ref_to_meta: dict[str, dict] = {
    f"[{ref}]": {"ref": f"[{ref}]", "label": label, "dataClass": dc.value}
    for ref, label, _, dc in _SEED
}

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE = re.compile(r"^\+?[\d][\d\s\-().]{6,}$")
_SECRET_HINT = re.compile(r"(api[_-]?key|secret|password|token)", re.IGNORECASE)


def list_refs() -> list[dict]:
    """Public listing: references + labels + classes. Never values."""
    return list(_ref_to_meta.values())


def resolve(value_ref: str | None) -> str | None:
    """Resolve a reference to its value for execution only."""
    if not value_ref:
        return None
    return _ref_to_value.get(value_ref)


def classify(field: str, text: str) -> dict:
    """Local deterministic classification → {dataClass, ref?}."""
    f = field.lower()
    t = text.strip()
    if _SECRET_HINT.search(f) or _SECRET_HINT.search(t):
        dc = DataClass.CREDENTIAL if "pass" in f else DataClass.SECRET
    elif _EMAIL.match(t) or f in ("email", "e-mail"):
        dc = DataClass.PII
    elif _PHONE.match(t) or f in ("phone", "tel"):
        dc = DataClass.PII
    elif f in ("address", "location", "ssn"):
        dc = DataClass.SENSITIVE
    elif f in ("name",):
        dc = DataClass.PII
    elif t == "":
        dc = DataClass.PUBLIC
    else:
        dc = DataClass.ORDINARY
    # Map to an existing demo ref when the value matches the seed.
    ref = next((r for r, v in _ref_to_value.items() if v == text), None)
    return {"dataClass": dc.value, "ref": ref}
