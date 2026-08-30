"use client";

import { useState } from "react";

export function TrackLinkShare({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{url}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 text-xs font-semibold text-black underline"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
