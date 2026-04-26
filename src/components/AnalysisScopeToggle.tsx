import { GitBranch, Layers3 } from "lucide-react";
import type { AnalysisScopeMode } from "../types";

interface Props {
  mode: AnalysisScopeMode;
  onChange: (mode: AnalysisScopeMode) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{
  mode: AnalysisScopeMode;
  label: string;
  Icon: typeof GitBranch;
}> = [
  { mode: "repo", label: "Repo", Icon: GitBranch },
  { mode: "workspace", label: "Workspace", Icon: Layers3 },
];

export default function AnalysisScopeToggle({ mode, onChange, disabled }: Props) {
  return (
    <div
      className={[
        "grid grid-cols-2 rounded-lg bg-surface-container p-0.5",
        disabled ? "opacity-40" : "",
      ].join(" ")}
      aria-label="Analysis scope"
    >
      {OPTIONS.map(({ mode: optionMode, label, Icon }) => {
        const isActive = mode === optionMode;
        return (
          <button
            key={optionMode}
            type="button"
            disabled={disabled}
            onClick={() => onChange(optionMode)}
            className={[
              "flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
              isActive
                ? "bg-surface-container-highest text-primary"
                : "text-on-surface-variant hover:text-on-surface",
            ].join(" ")}
          >
            <Icon size={12} className="shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
