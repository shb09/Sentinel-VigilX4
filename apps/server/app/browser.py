"""Playwright browser service (Phase 2).

Only four structured actions exist: navigate, click, fill, submit.
No page.evaluate, no arbitrary JS — selectors/URLs only.
The browser NEVER runs an action without an ALLOW from Sentinel.

All Playwright objects live on ONE dedicated event loop in a daemon
thread (Playwright async objects are loop-bound; fresh asyncio.run()
per call would break on the second call).
"""

import asyncio
import threading

from .models import ActionProposal

ALLOWED_TYPES = {"navigate", "click", "fill", "submit"}

_loop: asyncio.AbstractEventLoop | None = None
_thread: threading.Thread | None = None
_ready = threading.Event()
_page = None


def _thread_main() -> None:
    global _loop
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    _ready.set()
    _loop.run_forever()


def _ensure_loop() -> asyncio.AbstractEventLoop:
    global _thread
    if _thread is None:
        _thread = threading.Thread(target=_thread_main, daemon=True)
        _thread.start()
        _ready.wait(timeout=10)
    assert _loop is not None
    return _loop


def _submit(coro, timeout: float = 30.0):
    loop = _ensure_loop()
    fut = asyncio.run_coroutine_threadsafe(coro, loop)
    return fut.result(timeout=timeout)


async def _ensure_page():
    global _page
    if _page is not None:
        return _page
    from playwright.async_api import async_playwright

    pw = await async_playwright().start()
    browser = await pw.chromium.launch(headless=True)
    ctx = await browser.new_context()
    _page = await ctx.new_page()
    _page._pw = pw  # type: ignore[attr-defined]
    _page._browser = browser  # type: ignore[attr-defined]
    return _page


async def _do_execute(action: ActionProposal) -> dict:
    page = await _ensure_page()
    atype = action.type.lower().strip()
    if atype not in ALLOWED_TYPES:
        raise ValueError(f"Unsupported browser action: {action.type}")

    if atype == "navigate":
        await page.goto(action.target, wait_until="domcontentloaded", timeout=15000)
        return {"url": page.url, "title": await page.title()}
    if atype == "click":
        await page.click(action.target, timeout=8000)
        return {"url": page.url, "clicked": action.target}
    if atype == "fill":
        await page.fill(action.target, action.value or "", timeout=8000)
        return {"url": page.url, "filled": action.target}
    # submit
    await page.click(action.target, timeout=8000)
    await page.wait_for_timeout(500)
    try:
        status_text = await page.text_content("#status")
    except Exception:
        status_text = None
    return {"url": page.url, "submitted": action.target, "status": status_text}


def execute_authorized(action: ActionProposal) -> dict:
    """Run an already-authorized action. No policy checks here —
    the caller (POST /api/execute) must authorize first."""
    return _submit(_do_execute(action))


async def _do_observe():
    page = await _ensure_page()
    try:
        title = await page.title()
    except Exception:
        title = ""
    try:
        url = page.url
    except Exception:
        url = "about:blank"
    html = ""
    try:
        # Read-only snapshot, truncated. No JS evaluation of agent input.
        html = (await page.content())[:4000]
    except Exception:
        pass
    return {"url": url, "title": title, "html": html}


def observe() -> dict:
    return _submit(_do_observe())


def status() -> dict:
    if _page is None:
        return {"running": False, "url": "about:blank", "title": "", "html": ""}
    return {"running": True, **observe()}
