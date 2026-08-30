"use client";

import { useState, useTransition } from "react";
import { setIssueResolved } from "../issue-actions";

export function IssueRow({
  id,
  resolved,
  children,
}: {
  id: string;
  resolved: boolean;
  children: React.ReactNode;
}) {
  const [checked, setChecked] = useState(resolved);
  const [pending, startTransition] = useTransition();

  const handleChange = (next: boolean) => {
    setChecked(next);
    startTransition(async () => {
      const result = await setIssueResolved(id, next);
      if (!result.ok) setChecked(!next);
    });
  };

  return (
    <div
      className="rounded-xl border border-neutral-200 p-4"
      style={{ opacity: checked ? 0.55 : 1 }}
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => handleChange(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <div className="min-w-0 flex-1">{children}</div>
      </label>
    </div>
  );
}
