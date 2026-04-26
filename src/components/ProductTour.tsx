import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useAppContext } from "../context/AppContext";

const STEPS = [
  {
    title: "See value in minutes",
    body:
      "GitPulse stays local, scans Git history into SQLite, and turns repository activity into readable product and code-health signals.",
    accent: "Local-first repo intelligence",
  },
  {
    title: "Create a workspace",
    body:
      "Group related repositories so Dashboard, Seasons, Awards, Records, and Hall of Fame can tell the story of a product area instead of one repo only.",
    accent: "Start in Settings",
  },
  {
    title: "Add a repo and branch",
    body:
      "Pick the active branch you want to analyze. GitPulse reads Git data and keeps branch cursors so future scans can be incremental.",
    accent: "No working tree mutation",
  },
  {
    title: "Scan and resume safely",
    body:
      "Run a scan, pause it if needed, and resume from persisted progress. Large repos keep moving without blocking the rest of the app.",
    accent: "Progress is durable",
  },
  {
    title: "Read the dashboard first",
    body:
      "Use the Dashboard for the first aha moment: activity timeline, top files, developer context, and the fastest route to hotspots.",
    accent: "Your daily overview",
  },
  {
    title: "Make GitPulse a habit",
    body:
      "Come back for Code Health, volatility, coupling, Seasons, Awards, Records, and Hall of Fame. The next milestones add recaps, insights, watchlists, and exports.",
    accent: "Retention loop",
  },
];

export default function ProductTour() {
  const { isProductTourOpen, dismissProductTour } = useAppContext();
  const [stepIndex, setStepIndex] = useState(0);

  if (!isProductTourOpen) return null;

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const finishTour = () => {
    setStepIndex(0);
    dismissProductTour();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        className="w-full max-w-xl rounded-lg bg-surface-container-low shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/20 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">
              GitPulse product tour
            </p>
            <h2
              id="product-tour-title"
              className="mt-1 text-2xl font-bold text-on-surface"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              GitPulse product tour
            </h2>
          </div>
          <button
            type="button"
            onClick={finishTour}
            aria-label="Skip tour"
            className="rounded-full bg-surface-container-high p-2 text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <span className="rounded-full bg-primary-container px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              Step {stepIndex + 1} of {STEPS.length}
            </span>
            <span className="text-xs text-on-surface-variant">{step.accent}</span>
          </div>

          <h3
            className="text-2xl font-bold text-on-surface"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            {step.title}
          </h3>
          <p className="mt-3 text-sm leading-6 text-on-surface-variant">
            {step.body}
          </p>

          <div className="mt-6 grid grid-cols-6 gap-1">
            {STEPS.map((item, index) => (
              <div
                key={item.title}
                className={[
                  "h-1.5 rounded-full",
                  index <= stepIndex ? "bg-primary" : "bg-surface-container-highest",
                ].join(" ")}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/20 px-5 py-4">
          <button
            type="button"
            onClick={finishTour}
            className="text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={isFirst}
              className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-40"
            >
              <ChevronLeft size={15} />
              Back
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={finishTour}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-on-primary gradient-primary"
              >
                <Check size={15} />
                Finish tour
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setStepIndex((current) => Math.min(STEPS.length - 1, current + 1))
                }
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-on-primary gradient-primary"
              >
                Next
                <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
