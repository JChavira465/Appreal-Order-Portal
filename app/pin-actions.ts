"use server";

import { createClient } from "@/lib/supabase/server";
import { pinToPassword } from "@/lib/pin";

export type SetPinResult = { ok: boolean; message: string } | null;

export async function setOwnPin(
  _prevState: SetPinResult,
  formData: FormData,
): Promise<SetPinResult> {
  const pin = String(formData.get("pin") ?? "").trim();

  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, message: "PIN must be 4 digits." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: pinToPassword(pin),
  });

  if (error) {
    return { ok: false, message: "Could not update PIN. Try again." };
  }

  return { ok: true, message: "PIN updated." };
}
