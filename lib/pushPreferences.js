import { createHash } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";

// Preferences are stored per push endpoint so two devices can pick different alerts.
// Use existing notification_state table (state_key/state_value JSON), no migration.
export const DEFAULT_PUSH_PREFS = Object.freeze({
  matchupStart: true,
  touchdowns: true,
  receptions: false,
  bigPlays: false,
  milestones: false,
  playerFinal: true,
  leadChanges: true,
  gameUpdates: true,
  finalScores: true,
  recordWatch: false,
  playoffPulse: false,
  selectedPlayers: [],
});

export const PUSH_CATEGORIES = Object.keys(DEFAULT_PUSH_PREFS).filter(key => key !== "selectedPlayers");

function prefKey(endpoint) {
  if (typeof endpoint !== "string" || !/^https:\/\//i.test(endpoint) || endpoint.length > 4000) {
    throw new Error("Invalid push subscription endpoint");
  }
  return "push-preferences:v1:" + createHash("sha256").update(endpoint).digest("hex");
}

export function normalizePushPrefs(value) {
  const input = value && typeof value === "object" ? value : {};
  const result = { ...DEFAULT_PUSH_PREFS };
  for (const category of PUSH_CATEGORIES) {
    if (typeof input[category] === "boolean") result[category] = input[category];
  }
  if (Array.isArray(input.selectedPlayers)) {
    result.selectedPlayers = [...new Set(input.selectedPlayers
      .filter(x => typeof x === "string" && x.length < 90)
      .map(x => x.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter(Boolean))].slice(0,30);
  }
  return result;
}

export async function readPushPreferences(endpoint) {
  const key = prefKey(endpoint);
  const { data, error } = await supabaseAdmin.from("notification_state")
    .select("state_value").eq("state_key",key).maybeSingle();
  if (error) throw error;
  return normalizePushPrefs(data?.state_value);
}

export async function writePushPreferences(endpoint, preferences) {
  const key = prefKey(endpoint);
  const clean = normalizePushPrefs(preferences);
  const { error } = await supabaseAdmin.from("notification_state")
    .upsert({state_key:key,state_value:clean,updated_at:new Date().toISOString()},
      {onConflict:"state_key"});
  if(error) throw error;
  return clean;
}

export function matchesPlayer(prefs, playerName) {
  if (!Array.isArray(prefs.selectedPlayers) || prefs.selectedPlayers.length===0) return true;
  const names=Array.isArray(playerName) ? playerName : [playerName];
  return names.some(name=>{
    const normalized=String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    return prefs.selectedPlayers.includes(normalized);
  });
}

export function notificationCategory(payload) {
  const title=String(payload?.title||"").toUpperCase();
  if(title.includes("TOUCHDOWN")) return "touchdowns";
  if(title.includes("RECEPTION")||title.includes("CAUGHT A PASS")||title.includes("NEW CATCHES")) return "receptions";
  if(title.includes("BIG PLAY")) return "bigPlays";
  if(title.includes("POINT MILESTONE")) return "milestones";
  if(title.includes("PLAYER FINAL")) return "playerFinal";
  if(title.includes("LEAD CHANGE")) return "leadChanges";
  if(title.includes("MATCHUP START")) return "matchupStart";
  if(title.includes("THURSDAY UPDATE")||title.includes("SUNDAY UPDATE")) return "gameUpdates";
  if(title.includes("RECORD WATCH")) return "recordWatch";
  if(title.includes("PLAYOFF PULSE")) return "playoffPulse";
  if(title.includes("FINAL")) return "finalScores";
  return null; // unknown notifications pass through, including explicit test pushes.
}
