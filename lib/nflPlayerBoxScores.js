// NFL official box-score player stats via ESPN's public game summary.
// Stats are returned as displayed by ESPN, not guessed from fantasy points.
function statLine(group, values) {
  const labels = Array.isArray(group?.labels) ? group.labels : [];
  const name = String(group?.name || group?.displayName || "").toLowerCase();
  const stats = Array.isArray(values) ? values : [];
  const get = (...keys) => {
    for (const key of keys) {
      const idx = labels.findIndex(l => String(l).toUpperCase().replace(/[^A-Z/]/g, "") === key);
      if (idx >= 0 && stats[idx] != null && stats[idx] !== "--") return String(stats[idx]);
    }
    return null;
  };
  if (name.includes("passing")) {
    const ca=get("C/ATT","CMP/ATT","COMP/ATT"), yds=get("YDS"), td=get("TD"), int=get("INT");
    return [ca && "Pass "+ca, yds && yds+" YDS", td && td+" TD", int && int+" INT"].filter(Boolean).join(" · ");
  }
  if (name.includes("rushing")) {
    const att=get("CAR","ATT"),yds=get("YDS"),td=get("TD");
    return [att && att+" CAR",yds && yds+" RUSH YDS",td && td+" RUSH TD"].filter(Boolean).join(" · ");
  }
  if (name.includes("receiving")) {
    const rec=get("REC"),yds=get("YDS"),td=get("TD");
    return [rec && rec+" REC",yds && yds+" REC YDS",td && td+" REC TD"].filter(Boolean).join(" · ");
  }
  if (name.includes("kicking")) {
    const fg=get("FG"),xp=get("XP"),pts=get("PTS");
    return [fg && fg+" FG",xp && xp+" XP",pts && pts+" PTS"].filter(Boolean).join(" · ");
  }
  return null;
}

export async function getNflPlayerBoxScores(games = {}) {
  const eventIds = [...new Set(Object.values(games)
    .filter(g => g?.eventId && (g.state === "in" || g.state === "post"))
    .map(g => g.eventId))];
  if (!eventIds.length) return {};
  const outputs = await Promise.all(eventIds.map(async eventId => {
    try {
      const res = await fetch(
        "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=" + encodeURIComponent(eventId),
        { next: { revalidate: 30 } }
      );
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      for (const team of data?.boxscore?.players || []) {
        for (const group of team?.statistics || []) {
          for (const entry of group?.athletes || []) {
            const id = String(entry?.athlete?.id || "");
            if (!id) continue;
            const line = statLine(group, entry.stats);
            if (!line) continue;
            (map[id] ||= []).push(line);
          }
        }
      }
      return map;
    } catch (error) {
      console.error("NFL player box score unavailable:", String(eventId), error);
      return {};
    }
  }));
  const merged = {};
  for (const output of outputs) {
    for (const [id, lines] of Object.entries(output)) merged[id] = lines.join(" · ");
  }
  return merged;
}
