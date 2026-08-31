"use client";

import { useState, useTransition } from "react";
import { deleteCompany } from "./actions";

export function DeleteCompanyButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (
      !confirm(
        `Delete "${companyName}"? This can't be undone. It only works if the company has no orders, vendors, or other business data yet.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteCompany(companyId);
      setMessage(result.message);
    });
  };

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-xs text-red-600 underline disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {message && (
        <p className="mt-1 text-xs text-neutral-500">{message}</p>
      )}
    </div>
  );
}
