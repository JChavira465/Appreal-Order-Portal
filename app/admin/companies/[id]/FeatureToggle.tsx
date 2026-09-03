"use client";

import { useState, useTransition } from "react";
import { setCompanyFeature } from "../actions";
import { FEATURE_COPY, PLANS, type Feature, type Tier } from "@/lib/plans";

type State = "on" | "off" | "default";

export function FeatureToggle({
  companyId,
  feature,
  tier,
  initialState,
  initialNote,
}: {
  companyId: string;
  feature: Feature;
  tier: Tier;
  initialState: State;
  initialNote: string;
}) {
  const [state, setState] = useState<State>(initialState);
  const [note, setNote] = useState(initialNote);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tierGives = PLANS[tier].features.includes(feature);
  const copy = FEATURE_COPY[feature];
  const effective = state === "default" ? tierGives : state === "on";

  const save = (next: State, nextNote: string) => {
    const previous = state;
    setState(next);
    setMessage(null);
    startTransition(async () => {
      const result = await setCompanyFeature(companyId, feature, next, nextNote);
      if (!result.ok) {
        setState(previous);
        setMessage(result.message);
      } else {
        setMessage(result.message);
      }
    });
  };

  return (
    <div className="border-b border-neutral-200 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-black">
              {copy.name}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{
                background: effective ? "#F0FDF4" : "#F5F5F5",
                color: effective ? "#15803D" : "#737373",
              }}
            >
              {effective ? "On" : "Off"}
            </span>
            {state !== "default" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                Override
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">{copy.blurb}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1">
        {(
          [
            ["default", `Plan default (${tierGives ? "on" : "off"})`],
            ["on", "Force on"],
            ["off", "Force off"],
          ] as [State, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            onClick={() => save(value, note)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              state === value
                ? "border-black bg-black text-white"
                : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {state !== "default" && (
        <div className="mt-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => save(state, note)}
            maxLength={300}
            placeholder="Why? e.g. beta tester, comped through October"
            className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs text-black placeholder:text-neutral-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>
      )}

      {message && (
        <p className="mt-2 text-xs text-neutral-500">{message}</p>
      )}
    </div>
  );
}
