import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScore(value) {
  return number(value).toFixed(2);
}

function getGameType(game) {
  const matchupType = String(game.matchup_type || "").toLowerCase();
  const playoffTier = String(game.playoff_tier || "").toLowerCase();

  if (
    matchupType === "consolation" ||
    matchupType.includes("consolation") ||
    playoffTier.includes("consolation") ||
    playoffTier.includes("losers") ||
    playoffTier.includes("loser")
  ) {
    return "consolation";
  }

  if (
    matchupType === "playoff" ||
    matchupType.includes("championship") ||
    playoffTier.includes("winners_bracket") ||
    playoffTier.includes("winner") ||
    playoffTier.includes("championship") ||
    game.is_championship === true ||
    game.is_playoff === true
  ) {
    return "playoff";
  }

  return "regular";
}

function ownerName(ownerMap, ownerId) {
  return ownerMap.get(Number(ownerId)) || "Unknown Owner";
}

function gameSides(game, ownerMap) {
  return [
    {
      side: "HOME",
      ownerId: Number(game.home_owner_id),
      owner: ownerName(ownerMap, game.home_owner_id),
      team: game.home_team_name || "Unknown Team",
      score: number(game.home_score),
      opponentId: Number(game.away_owner_id),
      opponent: ownerName(ownerMap, game.away_owner_id),
      opponentTeam: game.away_team_name || "Unknown Team",
      opponentScore: number(game.away_score),
    },
    {
      side: "AWAY",
      ownerId: Number(game.away_owner_id),
      owner: ownerName(ownerMap, game.away_owner_id),
      team: game.away_team_name || "Unknown Team",
      score: number(game.away_score),
      opponentId: Number(game.home_owner_id),
      opponent: ownerName(ownerMap, game.home_owner_id),
      opponentTeam: game.home_team_name || "Unknown Team",
      opponentScore: number(game.home_score),
    },
  ];
}

function winnerSide(game) {
  const winner = String(game.winner || "").toUpperCase();

  if (winner === "HOME") return "HOME";
  if (winner === "AWAY") return "AWAY";
  if (winner === "TIE") return "TIE";

  const home = number(game.home_score);
  const away = number(game.away_score);

  if (home > away) return "HOME";
  if (away > home) return "AWAY";

  return "TIE";
}

function getWinnerInfo(game, ownerMap) {
  const winner = winnerSide(game);

  if (winner === "HOME") {
    return {
      ownerId: Number(game.home_owner_id),
      owner: ownerName(ownerMap, game.home_owner_id),
      team: game.home_team_name || "Unknown Team",
      score: number(game.home_score),
      opponent: ownerName(ownerMap, game.away_owner_id),
      opponentTeam: game.away_team_name || "Unknown Team",
      opponentScore: number(game.away_score),
    };
  }

  if (winner === "AWAY") {
    return {
      ownerId: Number(game.away_owner_id),
      owner: ownerName(ownerMap, game.away_owner_id),
      team: game.away_team_name || "Unknown Team",
      score: number(game.away_score),
      opponent: ownerName(ownerMap, game.home_owner_id),
      opponentTeam: game.home_team_name || "Unknown Team",
      opponentScore: number(game.home_score),
    };
  }

  return null;
}

function RecordCard({
  label,
  value,
  owner,
  team,
  detail,
  opponent,
}) {
  return (
    <div className="record-book-card">
      <span className="record-book-label">{label}</span>

      <strong className="record-book-value">{value}</strong>

      {owner && <h3>{owner}</h3>}

      {team && <p className="record-book-team">{team}</p>}

      {detail && <p className="record-book-detail">{detail}</p>}

      {opponent && (
        <p className="record-book-opponent">
          {opponent}
        </p>
      )}
    </div>
  );
}

export default async function RecordsPage() {
  const [{ data: owners }, { data: matchupData }] = await Promise.all([
    supabase
      .from("owners")
      .select("id, name"),

    supabase
      .from("matchups")
      .select("*")
      .lt("season_year", 2026)
      .order("season_year", { ascending: true })
      .order("matchup_period", { ascending: true }),
  ]);

  const ownerMap = new Map(
    (owners || []).map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  const games = (matchupData || []).filter(
    (game) =>
      game.home_score !== null &&
      game.away_score !== null
  );

  const regularGames = games.filter(
    (game) => getGameType(game) === "regular"
  );

  const playoffGames = games.filter(
    (game) => getGameType(game) === "playoff"
  );

  const championshipGames = games.filter(
    (game) => game.is_championship === true
  );

  /* ======================================================
     INDIVIDUAL REGULAR-SEASON SCORES
     ====================================================== */

  const regularPerformances = regularGames.flatMap((game) =>
   
