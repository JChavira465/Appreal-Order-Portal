"use client";

import { useActionState } from "react";
import { generateAiConcept, type ActionResult } from "./ai-concept-actions";

const initialState: ActionResult = null;

export function AiConceptForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(generateAiConcept, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <textarea
        name="prompt"
        rows={3}
        maxLength={400}
        placeholder="e.g. Navy and gold baseball jersey, script team name across the chest, gold sleeve stripes"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
      />
      {state && (
        <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border-2 border-neutral-300 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Generating… (~10–20s)" : "Generate AI concept"}
      </button>
      <p className="text-[11px] text-neutral-400">
        A rough idea to react to, not the official mockup — team names and
        numbers may not render cleanly. Up to 4 per order.
      </p>
    </form>
  );
}
