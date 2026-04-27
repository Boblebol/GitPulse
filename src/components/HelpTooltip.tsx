import { HelpCircle } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

interface HelpTooltipProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export default function HelpTooltip({
  label,
  children,
  className = "",
}: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className={["relative inline-flex items-center", className].filter(Boolean).join(" ")}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={isOpen ? tooltipId : undefined}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
          }
        }}
        className="inline-grid h-5 w-5 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary focus-visible:bg-surface-container-high focus-visible:text-primary"
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>
      {isOpen && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-1/2 top-6 z-40 w-64 -translate-x-1/2 rounded-lg bg-surface-container-highest px-3 py-2 text-left text-xs leading-5 text-on-surface shadow-xl ring-1 ring-outline-variant/30"
        >
          {children}
        </span>
      )}
    </span>
  );
}
