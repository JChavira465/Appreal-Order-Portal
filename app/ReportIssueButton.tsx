"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { reportIssue } from "./issue-actions";

export function ReportIssueButton() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  if (!signedIn) return null;

  const handleSubmit = async () => {
    setStatus("sending");
    const result = await reportIssue(description, pathname);
    if (result.ok) {
      setStatus("sent");
      setDescription("");
      setTimeout(() => {
        setOpen(false);
        setStatus("idle");
      }, 1500);
    } else {
      setStatus("error");
      setErrorMessage(result.message ?? "Could not submit.");
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="mb-2 w-72 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg">
          <p className="mb-2 text-sm font-bold text-black">Report an issue</p>
          {status === "sent" ? (
            <p className="text-sm text-green-700">Thanks — sent.</p>
          ) : (
            <>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What went wrong?"
                rows={4}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-black placeholder:text-neutral-400 focus:border-black focus:outline-none"
              />
              {status === "error" && (
                <p className="mt-1 text-xs text-red-600">{errorMessage}</p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-neutral-300 py-2 text-xs font-semibold text-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={status === "sending" || !description.trim()}
                  className="flex-1 rounded-lg bg-black py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {status === "sending" ? "Sending…" : "Submit"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-black px-4 py-3 text-xs font-bold text-white shadow-lg"
      >
        {open ? "Close" : "Report Issue"}
      </button>
    </div>
  );
}
