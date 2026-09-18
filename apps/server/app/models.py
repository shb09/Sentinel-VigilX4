"""Shared Sentinel action/decision models (Phase 0 — schemas only, no policy yet)."""

from enum import Enum
from pydantic import BaseModel, Field


class DataClass(str, Enum):
    PUBLIC = "PUBLIC"
    ORDINARY = "ORDINARY"
    PII = "PII"
    SENSITIVE = "SENSITIVE"
    SECRET = "SECRET"
    CREDENTIAL = "CREDENTIAL"


class Trust(str, Enum):
    TRUSTED = "TRUSTED"
    UNKNOWN = "UNKNOWN"
    UNTRUSTED = "UNTRUSTED"


class Destination(str, Enum):
    SAME_ORIGIN = "SAME_ORIGIN"
    TRUSTED_ORIGIN = "TRUSTED_ORIGIN"
    KNOWN_EXTERNAL = "KNOWN_EXTERNAL"
    UNKNOWN_EXTERNAL = "UNKNOWN_EXTERNAL"
    UNTRUSTED_EXTERNAL = "UNTRUSTED_EXTERNAL"


class Decision(str, Enum):
    ALLOW = "ALLOW"
    REVIEW = "REVIEW"
    BLOCK = "BLOCK"


class ActionProposal(BaseModel):
    actionId: str = Field(..., description="Unique action identifier")
    type: str = Field(..., description="navigate | click | fill | submit | send")
    target: str = Field(..., description="CSS selector, URL, or element ref")
    value: str | None = Field(
        default=None,
        description="Literal value for fill (demo non-secret data only; never audited)",
    )
    valueRef: str | None = Field(default=None, description="Value reference, never raw secret")
    source: str = Field(..., description="Where the instruction originated")
    destination: Destination
    provenance: str = Field(..., description="USER | AGENT_PLAN | TRUSTED_PAGE | INDIRECT_PAGE ...")
    dataClass: DataClass
    trust: Trust


class SentinelDecision(BaseModel):
    actionId: str
    decision: Decision
    policyId: str
    reason: str
    dataClass: DataClass
    provenance: str
    trust: Trust
    destination: Destination
