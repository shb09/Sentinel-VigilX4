import { useState } from "react";
import { ShieldCheck, Palette } from "lucide-react";
import { ThemeProvider, useTheme } from "./lib/theme";
import Playground from "./components/Playground";
import {
  Hero,
  Architecture,
  Security,
  Provenance,
  AuditView,
  ExtensionView,
} from "./components/Sections";

const LINKS = [
  ["Operate", "#operate"],
  ["How it works", "#how"],
  ["Security", "#security"],
  ["Provenance", "#provenance"],
  ["Audit", "#audit"],
  ["Extension", "#extension"],
];

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

function Shell() {
  const [activity, setActivity] = useState(0);
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-10 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-5 px-6 py-3">
          <span className="accent-text flex items-center gap-2 text-sm font-bold tracking-[0.25em]">
            <ShieldCheck size={18} /> SENTINEL
          </span>
          <div className="ml-auto flex items-center gap-4 text-xs text-slate-300">
            {LINKS.map(([label, href]) => (
              <a key={href} href={href} className="hidden hover:text-white sm:inline">
                {label}
              </a>
            ))}
            <button
              onClick={toggle}
              title="Switch theme"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 hover:bg-white/10"
            >
              <Palette size={13} />
              {theme === "aurora" ? "Obsidian" : "Aurora"}
            </button>
          </div>
        </div>
      </nav>

      <Hero />

      <section id="operate" className="mx-auto mt-16 max-w-4xl scroll-mt-20 px-6">
        <h2 className="mb-4 text-2xl font-bold">Operate</h2>
        <Playground onActivity={() => setActivity((n) => n + 1)} />
      </section>

      <section id="how" className="scroll-mt-20">
        <div className="mx-auto mt-20 max-w-3xl px-6">
          <h2 className="text-2xl font-bold">How it works</h2>
          <p className="mt-2 text-sm text-slate-400">
            The agent observes a real page and proposes one structured action. Sentinel
            evaluates data, provenance, trust, and destination — then allows, holds for
            review, or blocks. Only authorized actions reach Playwright.
          </p>
        </div>
        <Architecture />
      </section>

      <section id="security" className="scroll-mt-20">
        <Security />
      </section>

      <section id="provenance" className="scroll-mt-20">
        <Provenance refreshKey={activity} />
      </section>

      <section id="audit" className="scroll-mt-20">
        <AuditView refreshKey={activity} />
      </section>

      <section id="extension" className="scroll-mt-20">
        <ExtensionView refreshKey={activity} />
      </section>
    </div>
  );
}
