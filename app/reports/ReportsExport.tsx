"use client";

import { useState } from "react";
import type {
  ReportSummary,
  ReportMonthRow,
  ReportItemRow,
  ReportCustomerRow,
} from "@/lib/exportOrders";

export function ReportsExport({
  summary,
  months,
  items,
  customers,
}: {
  summary: ReportSummary;
  months: ReportMonthRow[];
  items: ReportItemRow[];
  customers: ReportCustomerRow[];
}) {
  const [message, setMessage] = useState("");

  const handleExport = async () => {
    try {
      const { exportReports } = await import("@/lib/exportOrders");
      await exportReports(summary, months, items, customers);
      setMessage("");
    } catch {
      setMessage("Download blocked — try again");
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleExport}
        className="w-full rounded-lg border-2 border-neutral-300 py-2.5 text-sm font-semibold text-black"
      >
        Export reports to Excel
      </button>
      <p className="mt-1.5 text-center text-[11px] text-neutral-400">
        A separate workbook — summary, monthly trend, item, and customer
        breakdowns. Not the same file as the order exports.
      </p>
      {message && (
        <p className="mt-1 text-center text-xs text-red-600">{message}</p>
      )}
    </div>
  );
}
