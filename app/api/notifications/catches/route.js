import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendPush } from "../../../../lib/push";
import { getLeagueData } from "../../../../lib/leagueData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-night-only watch: Colts at Texans, November 19, 2026.
// ESPN box-score reception totals are sampled at intervals; the ESPN feed
// may be delayed, and multiple catches between polls are reported together.
const WATCHES = [
  { name: "Tyler Warren", team: "IND" },
  { name: "Xavier Hutchinson", team: "HOU" },
];
const KEY_PREFIX = "catch-alert:2026-11-19";

function chicagoDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const part = type => parts.find(p => p.type === type)?.value;
  return [part("year"), part("month"), part("day")].join("-");
}

async function json(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("NFL data unavailable: " + r.status);
  return r.json();
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getReceivingStats(summary, fullName) {
  for (const team of summary?.boxscore?.players || []) {
    for (const group of team.statistics || []) {
      if (!/receiv/i.test(group.name || group.displayName || "")) continue;
      const labels = (group.labels || group.names || []).map(v => String(v).toUpperCase());
      const recIndex = labels.findIndex(v => v === "REC" || v === "RECEPTIONS");
      const yardsIndex = labels.findIndex(v => v === "YDS" || v === "YARDS");
      if (recIndex < 0) continue;
      for (const row of group.athletes || []) {
        const athlete = row.athlete || {};
        if (normalize(athlete.displayName || athlete.fullName) !== normalize(fullName)) continue;
        const rec = Number(row.stats?.[recIndex]);
        const yards = yardsIndex < 0 ? null : Number(row.stats?.[yardsIndex]);
        if (!Number.isFinite(rec) || rec < 0) continue;
        return { receptions: rec, yards: Number.isFinite(yards) ? yards : null };
      }
    }
  }
  return null;
}

async function state(key) {
  const { data, error } = await supabaseAdmin.from("notification_state")
    .select("state_value").eq("state_key", key).maybeSingle();
  if (error) throw error;
  return data?.state_value || null;
}
async function saveState(key, value) {
  const { error } = await supabaseAdmin.from("notification_state")
    .upsert({ state_key: key, state_value: value, updated_at: new Date().toISOString() },
      { onConflict: "state_key" });
  if (error) throw error;
}

export async function GET() {
  try {
    if (chicagoDate() !== "2026-11-19") {
      return NextResponse.json({ ok: true, watching: false, reason: "Outside November 19 game night" });
    }
    const league = await getLeagueData();
    const reed = (league.owners || []).find(o => normalize(o.name).includes("reed"));
    if (!reed) return NextResponse.json({ ok: false, error: "Reed owner not found" }, { status: 404 });
    const { data: subscriptions, error } = await supabaseAdmin.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth").eq("enabled", true).eq("owner_id", Number(reed.id));
    if (error) throw error;
    if (!subscriptions?.length) return NextResponse.json({
      ok: true, watching: false, reason: "No push-enabled device for Reed. Enable Dirty P notifications on the phone."
    });
    const scoreboard = await json("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261119&limit=100");
    const event = (scoreboard.events || []).find(e => {
      const names = (e.competitions?.[0]?.competitors || []).map(c => String(c.team?.abbreviation || "").toUpperCase());
      return names.includes("IND") && names.includes("HOU");
    });
    if (!event) return NextResponse.json({ ok: true, watching: false, reason: "Colts-Texans event unavailable" });
    const status = event.status?.type?.state;
    if (status === "pre") return NextResponse.json({ ok: true, watching: true, reason: "Awaiting kickoff" });
    const summary = await json("https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=" + encodeURIComponent(String(event.id)));
    let sent = 0;
    const updates = [];
    for (const watch of WATCHES) {
      const stats = getReceivingStats(summary, watch.name);
      if (!stats) continue;
      const key = KEY_PREFIX + ":" + normalize(watch.name);
      const old = await state(key);
      if (!old) {
        // Initial observation is a baseline, not a delayed alert for past catches.
        await saveState(key, { receptions: stats.receptions, yards: stats.yards });
        updates.push({ player: watch.name, status: "baseline", receptions: stats.receptions });
        continue;
      }
      const delta = stats.receptions - Number(old.receptions || 0);
      if (delta > 0) {
        const title = delta === 1 ? "🏈 " + watch.name + " caught a pass!" : "🏈 " + watch.name + ": " + delta + " new catches!";
        const yardsText = stats.yards == null ? "" : " · " + stats.yards + " receiving yards";
        const body = stats.receptions + " receptions" + yardsText + " tonight.";
        // Same tag only within the specific reception count, preventing stale repetitions.
        for (const subscription of subscriptions) {
          try {
            await sendPush(subscription, {
              title, body, tag: key + ":" + stats.receptions, url: "/"
            });
            sent++;
          } catch (pushError) {
            console.error("Catch alert delivery failed", pushError);
            if ([404,410].includes(pushError?.statusCode)) {
              await supabaseAdmin.from("push_subscriptions").delete().eq("id",subscription.id);
            }
          }
        }
        updates.push({ player: watch.name, status: "new receptions", count: delta });
      }
      if (delta !== 0 || stats.yards !== old.yards) {
        await saveState(key, { receptions: stats.receptions, yards: stats.yards });
      }
    }
    return NextResponse.json({ ok: true, watching: status === "in", sent, updates });
  } catch (error) {
    console.error("Catch alert processing failed:", error);
    return NextResponse.json({ ok: false, error: "Unable to process catch alerts" }, { status: 500 });
  }
}
