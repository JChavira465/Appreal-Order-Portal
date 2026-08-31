"use client";

import { useState, useTransition } from "react";
import { setCompanyActive } from "./actions";

export function SuspendCompanyButton({
  companyId,
  companyName,
  active,
}: {
  companyId: string;
  companyName: string;
  active: boolean;
}) {
  const [isActive, setIsActive] = useState(active);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (
      isActive &&
      !confirm(
        `Suspend "${companyName}"? Their staff stay signed in but immediately lose access to all their orders, vendors, and other data until you reactivate.`,
      )
    ) {
      return;
    }
    const next = !isActive;
    startTransition(async () => {
      const result = await setCompanyActive(companyId, next);
      if (result.ok) setIsActive(next);
      setMessage(result.message);
    });
  };

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`text-xs underline disabled:opacity-50 ${
          isActive ? "text-amber-600" : "text-green-700"
        }`}
      >
        {pending ? "Updating…" : isActive ? "Suspend" : "Reactivate"}
      </button>
      {message && (
        <span className="ml-2 text-xs text-neutral-500">{message}</span>
      )}
    </div>
  );
}
