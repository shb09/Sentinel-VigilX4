/* Live-masking pipeline tests (real built files, no browser needed).
 *
 * Loads dist/tmp/classify.js + content.js and dist/chrome/background.js
 * into sandboxes, simulates typing on the customer-form fields, routes the
 * resulting messages into the real background validator, and asserts:
 *  - deterministic references ([EMAIL_1], [PHONE_1], …)
 *  - reference stability for the same field
 *  - NO raw value appears in any message, stored state, or audit-shaped JSON
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(dir, "..", p), "utf8");

const DEMO = {
  name: "Rahul",
  email: "rahul@example.com",
  phone: "+91 9876543210",
  secret: "sk-demo-123456",
  notes: "Please resolve my account issue.",
};

function makeInput(attrs, value) {
  return {
    tagName: "INPUT",
    type: attrs.type || "text",
    id: attrs.id || "",
    value,
    disabled: false,
    readOnly: false,
    getAttribute: (k) => attrs[k] ?? null,
  };
}

// ---- page sandbox: runs the REAL content.js + classify.js ----
const sent = [];
const inputListeners = [];
const pageSandbox = {
  document: {
    addEventListener: (t, fn) => inputListeners.push([t, fn]),
    querySelectorAll: () => [],
    querySelector: () => null,
  },
  chrome: { runtime: { sendMessage: async (m) => void sent.push(m) } },
};
vm.createContext(pageSandbox);

function fireInput(el) {
  for (const [t, fn] of inputListeners) {
    if (t === "input") fn({ target: el });
  }
  return Promise.resolve();
}

function lastFor(fieldKey) {
  return sent.filter((m) => m.fieldKey === fieldKey).at(-1);
}

// ---- background sandbox: runs the REAL built background.js ----
const stored = {};
let onMessage = null;
const bgSandbox = {
  chrome: {
    storage: { local: { set: async (o) => Object.assign(stored, o), get: async () => ({ ...stored }) } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (fn) => (onMessage = fn) },
    },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    tabs: { onRemoved: { addListener: () => {} } },
  },
  fetch: async () => {
    throw new Error("offline");
  },
  console,
  Date,
};
vm.createContext(bgSandbox);

before(async () => {
  // NOTE: dist/chrome holds the SHIPPED classic scripts (export-stripped),
  // so these tests exercise exactly what Chrome/Firefox load.
  vm.runInContext(read("dist/chrome/classify.js"), pageSandbox, { filename: "classify.js" });
  vm.runInContext(read("dist/chrome/content.js"), pageSandbox, { filename: "content.js" });
  vm.runInContext(read("dist/chrome/background.js"), bgSandbox, { filename: "background.js" });
  assert.ok(onMessage, "background registered onMessage");
});

describe("live masking pipeline", () => {
  it("classifies demo values into stable deterministic references", async () => {
    const email = makeInput({ id: "email", name: "email" }, DEMO.email);
    const phone = makeInput({ id: "phone", name: "phone" }, DEMO.phone);
    const secret = makeInput({ id: "api-key", name: "api-key" }, DEMO.secret);
    const name = makeInput({ id: "name", name: "name" }, DEMO.name);
    await fireInput(email);
    await fireInput(phone);
    await fireInput(secret);
    await fireInput(name);
    assert.equal(lastFor("email").reference, "[EMAIL_1]");
    assert.equal(lastFor("phone").reference, "[PHONE_1]");
    assert.equal(lastFor("api-key").reference, "[SECRET_1]");
    assert.equal(lastFor("name").reference, "[NAME_1]");
    assert.equal(lastFor("email").dataClass, "EMAIL");
  });

  it("keeps the same reference when the same field value changes", async () => {
    const email = makeInput({ id: "email", name: "email" }, "other@example.org");
    await fireInput(email);
    assert.equal(lastFor("email").reference, "[EMAIL_1]");
  });

  it("withdraws the reference when a field is cleared, without any value", async () => {
    const email = makeInput({ id: "email", name: "email" }, "");
    await fireInput(email);
    const msg = lastFor("email");
    assert.equal(msg.present, false);
    assert.equal(msg.reference, "");
  });

  it("background stores refs only; raw values appear nowhere", async () => {
    for (const m of sent) {
      await onMessage(structuredClone(m), { tab: { id: 7 } });
    }
    const blob = JSON.stringify(stored);
    for (const raw of Object.values(DEMO)) {
      assert.ok(!blob.includes(raw), `raw value leaked to background storage: ${raw}`);
    }
    const keys = Object.keys(stored.liveFields || {});
    assert.ok(keys.length >= 3, "expected live fields in storage");
    for (const k of keys) {
      assert.match(k, /^7::/, "keyed by tab");
      assert.match(stored.liveFields[k].reference, /^\[(EMAIL|PHONE|SECRET|NAME|TEXT)_\d+\]$/);
    }
  });

  it("message payloads carry metadata keys only", async () => {
    const allowed = new Set(["kind", "fieldKey", "label", "dataClass", "reference", "present"]);
    for (const m of sent) {
      for (const k of Object.keys(m)) assert.ok(allowed.has(k), `unexpected key ${k}`);
      const blob = JSON.stringify(m);
      for (const raw of Object.values(DEMO)) {
        assert.ok(!blob.includes(raw), `raw value in message: ${raw}`);
      }
    }
    assert.ok(sent.length > 0);
  });
});
