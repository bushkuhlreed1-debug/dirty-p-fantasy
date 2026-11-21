import { unstable_cache } from "next/cache";
import { encodeOutcomeRows } from "./playoffOutcomeRows";
import { model, ownerReport } from "./weeklyPlayoffModel";

// Bump the cache key when the model or encoded outcome format changes.
export const getCachedPlayoffScenarios = unstable_cache(
  async (teams, games, playoffCount, season, currentWeek) => {
    const baseline = model(teams, games, playoffCount, season);
    const week = games.find(game => game.week >= currentWeek)?.week;
    const reports = {};

    if (week != null) {
      for (const team of teams) {
        const stats = baseline.totals.get(team.ownerId);
        if (baseline.exact && (stats.possible === 0 || stats.clinch === baseline.iterations)) continue;
        reports[team.ownerId] = ownerReport(team.ownerId, games, baseline, week, team.espnPlayoffPct);
      }
    }

    return {
      exact: baseline.exact,
      iterations: baseline.iterations,
      totals: [...baseline.totals],
      reports,
      outcomeRows: currentWeek >= 11 && currentWeek <= 13
        ? Buffer.from(encodeOutcomeRows(baseline.entries, teams, games)).toString("base64")
        : "",
    };
  },
  ["dirty-p-weekly-playoff-scenarios-v1"]
);
