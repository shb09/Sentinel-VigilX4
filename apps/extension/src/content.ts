/* Sentinel live-masking content script — PAGE side of the privacy boundary.
 *
 * SECURITY BOUNDARY (read carefully):
 * - Raw field values may be inspected HERE ONLY, transiently, to classify.
 * - NOTHING but {kind, fieldKey, label, dataClass, reference, present}
 *   metadata ever leaves this context (see buildFieldMessage).
 * - No raw value is logged, stored, fetched, or sent. Ever.
 *
 * The page DOM itself is never modified: the user keeps typing normally.
 * Loaded after classify.js (see manifest content_scripts order).
 */

interface FieldRecord {
  reference: string;
  dataClass: string;
}

const refCounters: Record<string, number> = {};
const fieldRefs: Record<string, FieldRecord> = {};

function fieldKeyFor(el: Element, index: number): string {
  const e = el as HTMLInputElement;
  return e.id || e.getAttribute("name") || `${el.tagName.toLowerCase()}[${index}]`;
}

function labelFor(el: Element): string {
  const e = el as HTMLInputElement;
  const id = e.id;
  if (id) {
    const lab = document.querySelector(`label[for="${id}"]`);
    if (lab && lab.textContent) return lab.textContent.trim().slice(0, 40);
  }
  return (
    e.getAttribute("aria-label") ||
    e.getAttribute("placeholder") ||
    e.getAttribute("name") ||
    id ||
    el.tagName.toLowerCase()
  ).slice(0, 40);
}

function hintFor(el: Element): string {
  const e = el as HTMLInputElement;
  return [e.type, e.id, e.getAttribute("name"), e.getAttribute("placeholder"), labelFor(el)].join(" ");
}

/* The ONLY message ever sent. Allowlisted keys; raw value cannot fit. */
function buildFieldMessage(
  fieldKey: string,
  label: string,
  dataClass: string,
  reference: string,
  present: boolean
): Record<string, string | boolean> {
  return { kind: "sentinel-field", fieldKey, label, dataClass, reference, present };
}

function observeElement(el: Element, index: number): void {
  const tag = el.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea") return;
  const input = el as HTMLInputElement;
  if (input.type === "password") return; // never even read password fields
  if (input.disabled || input.readOnly) return;
  const key = fieldKeyFor(el, index);
  const cls = classifyFieldLocal(hintFor(el), input.value);
  if (cls === null) {
    // Field emptied: withdraw the reference, still without any value.
    if (fieldRefs[key]) {
      delete fieldRefs[key];
      void chrome.runtime
        .sendMessage(buildFieldMessage(key, labelFor(el), "TEXT", "", false))
        .catch(() => {});
    }
    return;
  }
  const prev = fieldRefs[key];
  let reference: string;
  if (prev && prev.dataClass === cls) {
    reference = prev.reference; // stable: same field, same class → same ref
  } else {
    refCounters[cls] = (refCounters[cls] || 0) + 1;
    reference = `[${cls}_${refCounters[cls]}]`;
    fieldRefs[key] = { reference, dataClass: cls };
  }
  void chrome.runtime
    .sendMessage(buildFieldMessage(key, labelFor(el), cls, reference, true))
    .catch(() => {});
}

function scanRoot(root: ParentNode): void {
  const fields = root.querySelectorAll("input, textarea");
  fields.forEach((el, i) => {
    const input = el as HTMLInputElement;
    if (input.value) observeElement(el, i);
  });
}

function initLiveMasking(): void {
  let index = 0;
  const handle = (ev: Event): void => {
    const t = ev.target as Element | null;
    if (!t || typeof (t as Element).tagName !== "string") return;
    const tag = (t as Element).tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") observeElement(t as Element, index++);
  };
  // Delegated: also covers dynamically added fields. Page DOM untouched.
  document.addEventListener("input", handle, true);
  document.addEventListener("change", handle, true);
  scanRoot(document); // classify pre-filled values present at load
}

initLiveMasking();

export {};
