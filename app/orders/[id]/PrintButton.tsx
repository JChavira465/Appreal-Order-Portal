"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white"
    >
      Print / Save as PDF
    </button>
  );
}
