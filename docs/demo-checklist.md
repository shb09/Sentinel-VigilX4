# Sentinel — Live Demo Checklist

> Every step below is real: real Playwright browser, real policy decisions,
> real audit trail. Nothing is simulated.

## Pre-demo (in order)

1. **Start backend:** `uvicorn app.main:app --app-dir apps/server --port 8000`
2. **Start frontend:** `npm run dev --prefix apps/web` → `http://localhost:5173`
3. **Build extension:** `npm run build --prefix apps/extension`
4. **Load extension:** `chrome://extensions` → Load unpacked →
   `apps/extension/dist/chrome` (Firefox: `about:debugging` →
   `apps/extension/dist/firefox/manifest.json`)
5. **Verify service worker:** extension page shows no worker errors;
   popup shows `Backend: ok`
6. **Open Sentinel:** `http://localhost:5173` → TRY THE DEMO
7. **Verify backend health:** `curl -s http://localhost:8000/api/health`
8. **Reset state:** press **Reset** in the playground (clears approvals + audit)

## Demo

| Step | Action | Expected |
|---|---|---|
| SAFE | Run “Safe — update a support ticket” | `ALLOW` (`POL-ALLOW-TRUSTED-ORDINARY`) → `COMPLETED · executed: true`, ticket filled in real CRM |
| SENSITIVE | Run “Sensitive — send a support response” | `REVIEW` → `WAITING_FOR_APPROVAL · executed: false`, Approve/Block buttons |
| APPROVE | Click **Approve & Execute** | `POL-APPROVED` → `COMPLETED · executed: true`, page confirms the send |
| BLOCK | Re-run Sensitive, click **Block** | `HUMAN-BLOCKED` → `BLOCKED · executed: false`, nothing executes |
| ATTACK | Run “Attack — indirect prompt injection” | `BLOCK` (`POL-BLOCK-UNTRUSTED-EXFIL`) → `executed: false`, never executes |
| EXTENSION | Open the popup | Live counts, latest decision, `Backend: ok` |

## If something looks wrong

- **Stuck approvals:** press **Reset** (approvals are single-use by design).
- **Wrong page behind a scenario:** each scenario navigates to its own
  starting page through the Sentinel gate; re-run the scenario.
- **Backend was restarted:** the Playwright browser resets too — just re-run.
- **Extension shows unreachable:** backend must run on port 8000 first;
  the popup falls back to cached status, it never fakes success.
