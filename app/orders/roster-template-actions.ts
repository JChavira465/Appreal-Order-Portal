"use server";

import { createClient } from "@/lib/supabase/server";

export type RosterTemplateEntry = { name: string; number: string; size: string };

export async function getRosterTemplate(teamName: string): Promise<RosterTemplateEntry[]> {
  const trimmed = teamName.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roster_template_players")
    .select("player_name, player_number, size_label")
    .eq("team_name", trimmed)
    .order("sort_order");

  if (error) {
    console.error("getRosterTemplate: query failed", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    name: r.player_name ?? "",
    number: r.player_number ?? "",
    size: r.size_label ?? "",
  }));
}

export async function saveRosterTemplate(
  teamName: string,
  entries: RosterTemplateEntry[],
): Promise<{ ok: boolean; message: string }> {
  const trimmed = teamName.trim();
  if (!trimmed) return { ok: false, message: "Enter a team name first." };

  const real = entries.filter((e) => e.name.trim() || e.number.trim());
  if (real.length === 0) {
    return { ok: false, message: "Nothing to save -- add some names first." };
  }

  const supabase = await createClient();

  // Replace-all rather than merge -- simplest correct behavior for "this
  // is our roster now," and avoids ending up with stale/duplicate players
  // from a previous season.
  const { error: deleteError } = await supabase
    .from("roster_template_players")
    .delete()
    .eq("team_name", trimmed);
  if (deleteError) {
    console.error("saveRosterTemplate: delete failed", deleteError);
    return { ok: false, message: `Could not save: ${deleteError.message}` };
  }

  const { error: insertError } = await supabase.from("roster_template_players").insert(
    real.map((e, i) => ({
      team_name: trimmed,
      player_name: e.name.trim() || null,
      player_number: e.number.trim() || null,
      size_label: e.size.trim() || null,
      sort_order: i,
    })),
  );
  if (insertError) {
    console.error("saveRosterTemplate: insert failed", insertError);
    return { ok: false, message: `Could not save: ${insertError.message}` };
  }

  return {
    ok: true,
    message: `Saved ${real.length} player${real.length === 1 ? "" : "s"} for ${trimmed}.`,
  };
}
