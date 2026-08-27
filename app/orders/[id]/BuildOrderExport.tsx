"use client";

import { useState } from "react";
import type { BuildOrderLine } from "@/lib/exportOrders";

export function BuildOrderExport({
  orderNumber,
  teamName,
  lines,
}: {
  orderNumber: number;
  teamName: string;
  lines: BuildOrderLine[];
}) {
  const [message, setMessage] = useState("");

  const handleExport = async () => {
    try {
      const { exportBuildOrder } = await import("@/lib/exportOrders");
      exportBuildOrder(orderNumber, teamName, lines);
      setMessage("");
    } catch {
      setMessage("Download blocked -- try again");
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleExport}
        className="w-full rounded-lg border-2 border-neutral-300 py-2.5 text-sm font-semibold text-black"
      >
        Export build order
      </button>
      <p className="mt-1 text-[11px] text-neutral-400">
        Item, customization, size, count, and cost -- ready to hand to
        whichever manufacturer this goes to. No player names (see the size
        breakdown above for those).
      </p>
      {message && <p className="mt-1 text-xs text-red-600">{message}</p>}
    </div>
  );
}
