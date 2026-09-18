/* Sentinel local field classifier — PURE logic, no DOM, no chrome APIs.
 *
 * Runs inside the content script (page context). The raw value NEVER leaves
 * this file's callers: classification happens here, and only the resulting
 * {dataClass} metadata is forwarded. There is intentionally no import/export
 * so this compiles to a classic script shareable with content.js.
 *
 * Vocabulary matches the Sentinel backend (PUBLIC/ORDINARY/PII/SENSITIVE/
 * SECRET/CREDENTIAL) collapsed to the five demo classes below.
 */

type DemoFieldClass = "EMAIL" | "PHONE" | "SECRET" | "NAME" | "TEXT";

function classifyFieldLocal(fieldHint: string, value: string): DemoFieldClass | null {
  const v = (value || "").trim();
  if (!v) return null; // empty: nothing to report (caller sends removal)
  const hint = (fieldHint || "").toLowerCase();

  // 1. Explicit secret-looking VALUES win regardless of field.
  if (/sk-[A-Za-z0-9\-_]{4,}/.test(v)) return "SECRET";
  if (/^(api[_-]?key|secret|token|bearer)\s*[:=]/i.test(v)) return "SECRET";

  const hintSecret = /(api[\s_-]?key|secret|token|passwd|password|passkey)/.test(hint);
  const hintEmail = /(e-?mail)/.test(hint);
  const hintPhone = /(phone|mobile|tel\b|tel$)/.test(hint);
  const hintName = /(full[\s_-]?name|first[\s_-]?name|last[\s_-]?name|^name$|\bname\b)/.test(hint);

  // 2. Field-hint classification (the page tells us what it expects).
  if (hintSecret && v.length >= 3) return "SECRET";
  if (hintEmail) return "EMAIL";
  if (hintPhone) return "PHONE";
  if (hintName && /^[A-Za-z][A-Za-z .'\-]{1,40}$/.test(v)) return "NAME";

  // 3. Value-pattern fallback for unlabelled fields.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "EMAIL";
  if (/^\+?[\d][\d\s\-().]{6,}$/.test(v) && (v.replace(/\D/g, "").length >= 7)) return "PHONE";
  if (v.length >= 16 && /^[A-Za-z0-9\-_+/=]{16,}$/.test(v) && /[A-Za-z]/.test(v) && /\d/.test(v))
    return "SECRET";
  if (/^[A-Z][a-z]+(?: [A-Z][a-z]+){0,3}$/.test(v)) return "NAME";

  // 4. Ordinary text.
  return "TEXT";
}
