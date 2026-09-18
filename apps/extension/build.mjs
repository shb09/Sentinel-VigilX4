/* Assembles dist/chrome and dist/firefox from tsc output (dist/tmp)
   plus static assets. Run via `npm run build` (tsc && node build.mjs). */
import { mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync } from "node:fs";

/* The manifest and popup.html load background.js/popup.js as CLASSIC scripts
   (MV3 service_worker without "type": "module", plain <script> tag), so the
   emitted JS must contain no module syntax. Sources keep a meaningless
   `export {};` marker for TS module semantics; strip exactly that here and
   fail loudly on any real module syntax instead of shipping it. */
function toClassic(src) {
  const text = readFileSync(src, "utf8");
  const stripped = text.replace(/^\s*export\s*\{\s*\}\s*;?\s*$/m, "");
  if (/^\s*(import|export)\s+[^;]*;/m.test(stripped)) {
    console.error(`real module syntax in ${src} — refusing to emit classic script`);
    process.exit(1);
  }
  return stripped;
}

for (const dir of ["dist/chrome", "dist/firefox"]) {
  mkdirSync(dir, { recursive: true });
  copyFileSync("src/popup.html", `${dir}/popup.html`);
  // background/popup are classic extension scripts; classify/content are
  // classic content scripts (content runs after classify — order matters).
  for (const js of ["background.js", "popup.js", "classify.js", "content.js"]) {
    const src = `dist/tmp/${js}`;
    if (!existsSync(src)) {
      console.error(`missing ${src} — did tsc emit fail?`);
      process.exit(1);
    }
    writeFileSync(`${dir}/${js}`, toClassic(src));
  }
}

/* Match patterns intentionally ignore ports, so one localhost pattern covers
   the backend (:8000) and the dev server (:5173) demo pages. No <all_urls>,
   no broad hosts — content scripts run on controlled demo pages only. */
const contentScripts = [
  {
    matches: ["http://localhost/demo/*", "http://127.0.0.1/demo/*"],
    js: ["classify.js", "content.js"],
    run_at: "document_idle",
  },
];

const base = {
  manifest_version: 3,
  name: "Sentinel",
  version: "0.9.0",
  description: "Sentinel authorization layer — live protection status",
  action: { default_popup: "popup.html" },
  permissions: ["storage", "tabs", "alarms"],
  host_permissions: ["http://localhost/*"],
  content_scripts: contentScripts,
};

writeFileSync(
  "dist/chrome/manifest.json",
  JSON.stringify({ ...base, background: { service_worker: "background.js" } }, null, 2)
);
writeFileSync(
  "dist/firefox/manifest.json",
  JSON.stringify(
    {
      ...base,
      background: { scripts: ["background.js"] },
      browser_specific_settings: { gecko: { id: "sentinel@local" } },
    },
    null,
    2
  )
);
console.log("extension build ok: dist/chrome, dist/firefox");
