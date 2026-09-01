"use server";

import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/like";

export type RecentDuplicate = { orderNumber: number; createdAt: string } | null;

const RECENT_WINDOW_HOURS = 48;

// Non-blocking safety net for a hectic intake session -- flags a very
// recent order for the same team so a rep can double-check before
// submitting what might be an accidental double-entry, without stopping
// them from submitting a genuinely separate order for the same team.
export async function checkRecentDuplicate(teamName: string): Promise<RecentDuplicate> {
  const trimmed = teamName.trim();
  if (!trimmed) return null;

  const supabase = await createClient();
  const since = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("order_number, created_at")
    .ilike("team_name", escapeLike(trimmed))
    .neq("status", "draft")
    .neq("status", "cancelled")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("checkRecentDuplicate: query failed", error);
    return null;
  }
  if (!data) return null;
  return { orderNumber: data.order_number, createdAt: data.created_at };
}
