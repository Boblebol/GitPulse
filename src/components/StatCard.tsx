interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  className?: string;
}

/** Reusable stat metric card following the design system. */
export default function StatCard({
  label,
  value,
  sub,
  accent = false,
  className = "",
}: StatCardProps) {
  return (
    <div
      className={[
        "relative rounded-lg bg-surface-container-high px-4 py-3",
        accent ? "accent-bar pl-5" : "",
        className,
      ].join(" ")}
    >
      {/* Radial highlight on corner for primary stat */}
      {accent && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 100% 0%, rgba(30,42,64,0.6) 0%, transparent 60%)",
          }}
        />
      )}
      <p
        className="text-xs uppercase tracking-widest text-on-surface-variant mb-1"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        {label}
      </p>
      <p
        className="text-2xl font-bold text-on-surface leading-none"
        style={{ fontFamily: "Public Sans, sans-serif" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs text-on-surface-variant mt-1">{sub}</p>
      )}
    </div>
  );
}
