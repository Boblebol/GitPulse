import type { ReactNode } from "react";

interface FieldHintProps {
  id: string;
  children: ReactNode;
}

export default function FieldHint({ id, children }: FieldHintProps) {
  return (
    <p id={id} className="mt-1 text-xs leading-5 text-on-surface-variant">
      {children}
    </p>
  );
}
