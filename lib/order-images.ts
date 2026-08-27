import type { SupabaseClient } from "@supabase/supabase-js";

export const IMAGE_BUCKET = "order-images";

export type ImageKind = "reference" | "mockup" | "ai_concept";

export async function uploadOrderImage(
  supabase: SupabaseClient,
  orderId: string,
  kind: ImageKind,
  file: File,
): Promise<{ path: string } | { error: string }> {
  if (!file || file.size === 0) return { error: "No file." };
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${orderId}/${kind}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) return { error: error.message };
  return { path };
}

// For images generated server-side (no browser File object) -- the AI
// concept flow.
export async function uploadGeneratedOrderImage(
  supabase: SupabaseClient,
  orderId: string,
  kind: ImageKind,
  bytes: Buffer,
  contentType: string,
): Promise<{ path: string } | { error: string }> {
  const path = `${orderId}/${kind}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) return { error: error.message };
  return { path };
}

export async function signedUrlsFor(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}
