import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: staff } = await supabase.rpc("list_active_staff");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-script mb-1 text-center text-5xl leading-tight text-black">
          Acme Apparel Co.
        </h1>
        <p className="mb-10 text-center text-sm text-neutral-500">
          Order Desk
        </p>

        <LoginForm staff={staff ?? []} />

        <p className="mt-8 text-center text-xs text-neutral-400">
          <Link href="/login/recovery" className="underline">
            Trouble signing in?
          </Link>
        </p>
      </div>
    </main>
  );
}
