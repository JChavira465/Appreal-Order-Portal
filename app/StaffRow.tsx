"use client";

import { useActionState, useEffect, useState } from "react";
import {
  renameStaff,
  setStaffActive,
  type UpdateStaffResult,
} from "./team-actions";

const initialState: UpdateStaffResult = null;

export function StaffRow({
  id,
  fullName,
  active,
  roleLabel,
  locked = false,
}: {
  id: string;
  fullName: string;
  active: boolean;
  roleLabel: string;
  locked?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [renameState, renameAction, renamePending] = useActionState(
    renameStaff,
    initialState,
  );
  const [activeState, activeAction, activePending] = useActionState(
    setStaffActive,
    initialState,
  );

  useEffect(() => {
    if (renameState?.ok) {
      setEditing(false);
    }
  }, [renameState]);

  return (
    <li className="border-t border-neutral-100 py-2 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <form action={renameAction} className="flex flex-1 items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <input
              name="fullName"
              defaultValue={fullName}
              required
              autoFocus
              className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm text-black focus:border-black focus:outline-none"
            />
            <button
              type="submit"
              disabled={renamePending}
              className="shrink-0 text-xs font-medium text-black underline"
            >
              {renamePending ? "Saving…" : "Save"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm text-neutral-700"
          >
            {fullName}
            <span className="ml-2 text-xs text-neutral-400">{roleLabel}</span>
          </button>
        )}

        {locked ? (
          <span className="shrink-0 text-xs text-neutral-300">Protected</span>
        ) : (
          <form action={activeAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="active" value={(!active).toString()} />
            <button
              type="submit"
              disabled={activePending}
              className="shrink-0 text-xs text-neutral-400 underline"
            >
              {active ? "Deactivate" : "Reactivate"}
            </button>
          </form>
        )}
      </div>

      {renameState && !renameState.ok && (
        <p className="mt-1 text-xs text-red-600">{renameState.message}</p>
      )}
      {activeState && !activeState.ok && (
        <p className="mt-1 text-xs text-red-600">{activeState.message}</p>
      )}
    </li>
  );
}
