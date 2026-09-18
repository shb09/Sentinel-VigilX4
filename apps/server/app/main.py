"""Sentinel backend — Phase 3: policy engine + gated browser + agent loop."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import agent, browser, policy, scenarios, vault
from .models import ActionProposal
from .service import denial_decision
from .service import deny as record_denial
from .service import execute_if_allowed
from .store import append_audit, approvals, read_audit, reset_all

app = FastAPI(title="Sentinel", version="0.7.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_DIR = Path(__file__).resolve().parent.parent.parent.parent / "demo-sites"
if DEMO_DIR.exists():
    app.mount("/demo", StaticFiles(directory=str(DEMO_DIR), html=True), name="demo")


class DecideRequest(BaseModel):
    action: ActionProposal
    authorization: dict | None = None


class ApproveRequest(BaseModel):
    actionId: str


class AgentRunRequest(BaseModel):
    task: str
    maxSteps: int = 3


class ClassifyRequest(BaseModel):
    field: str
    text: str


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "sentinel"}


@app.post("/api/decide")
def decide(req: DecideRequest):
    denied = denial_decision(req.action)
    if denied is not None:
        append_audit(denied, value_ref=req.action.valueRef)
        return denied
    auth = req.authorization
    claimed_from_store = False
    if auth is None:
        stored = approvals.claim(req.action.actionId)
        if stored is not None:
            auth = stored
            claimed_from_store = True
    decision = policy.evaluate(req.action, authorization=auth)
    if decision.policyId == "POL-APPROVED" and (
        claimed_from_store or auth is not None
    ):
        approvals.consume(req.action.actionId)
    append_audit(decision, value_ref=req.action.valueRef)
    return decision


@app.post("/api/approve")
def approve(req: ApproveRequest):
    return approvals.approve(req.actionId)


@app.post("/api/deny")
def deny(req: DecideRequest):
    """Human Block for one pending action. Enforced backend-side via the
    denial store; the action can never execute afterwards, even if an
    approval for the same actionId is created later."""
    decision = record_denial(req.action)
    return {"decision": decision, "executed": False}


@app.get("/api/audit")
def audit(limit: int = 100):
    return {"entries": read_audit(limit)}


@app.post("/api/reset")
def reset():
    reset_all()
    return {"status": "ok"}


@app.get("/api/browser/status")
def browser_status():
    return browser.status()


@app.post("/api/execute")
def execute(req: DecideRequest):
    """Authorize-then-execute via the single choke point."""
    return execute_if_allowed(req.action)


@app.post("/api/agent/run")
def agent_run(req: AgentRunRequest):
    return agent.run_task(req.task, max_steps=max(1, min(req.maxSteps, 5)))


@app.get("/api/agent/state")
def agent_state():
    return agent.last_run()


@app.get("/api/scenarios")
def get_scenarios():
    return {"scenarios": scenarios.list_scenarios()}


@app.post("/api/scenarios/{scenario_id}/run")
def run_scenario(scenario_id: str):
    if scenario_id not in ("safe", "sensitive", "attack"):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="unknown scenario")
    return scenarios.run_scenario(scenario_id)


@app.get("/api/vault")
def get_vault():
    """Reference listing only — values never leave the server."""
    return {"refs": vault.list_refs()}


@app.post("/api/vault/classify")
def classify_value(req: ClassifyRequest):
    return vault.classify(req.field, req.text)
