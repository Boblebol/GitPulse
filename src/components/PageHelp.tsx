interface PageHelpProps {
  title?: string;
  items: string[];
}

export default function PageHelp({
  title = "How to read this page",
  items,
}: PageHelpProps) {
  return (
    <details className="rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant ring-1 ring-outline-variant/15">
      <summary className="cursor-pointer text-sm font-semibold text-on-surface transition-colors hover:text-primary">
        {title}
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}
