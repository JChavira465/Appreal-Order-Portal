"use client";

import { useActionState } from "react";
import { deleteOrderImage, type ActionResult } from "./actions";

const initialState: ActionResult = null;

export function DeleteImageButton({
  orderId,
  imageId,
  storagePath,
}: {
  orderId: string;
  imageId: string;
  storagePath: string;
}) {
  const [state, formAction, pending] = useActionState(deleteOrderImage, initialState);

  return (
    <form action={formAction} className="absolute right-1 top-1">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="imageId" value={imageId} />
      <input type="hidden" name="storagePath" value={storagePath} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!confirm("Remove this photo?")) e.preventDefault();
        }}
        aria-label="Remove photo"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs font-bold leading-none text-white disabled:opacity-50"
      >
        {pending ? "…" : "×"}
      </button>
      {state && !state.ok && (
        <p className="absolute -bottom-5 right-0 whitespace-nowrap text-[10px] text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}
