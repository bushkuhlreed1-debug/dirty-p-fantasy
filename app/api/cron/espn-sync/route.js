import {
  createClient,
} from "@supabase/supabase-js";

import {
  getEspnLeague,
} from "../../../../lib/espn";


export const dynamic =
  "force-dynamic";


export async function GET(
  request
) {
  // =========================================================
  // VERIFY VERCEL CRON
  // =========================================================

  const authHeader =
    request.headers.get(
      "authorization"
    );

  if (
    !process.env
      .CRON_SECRET ||
    authHeader !==
      `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json(
      {
        success: false,
        error:
          "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  try {
    // =======================================================
    // CHECK SUPABASE ENVIRONMENT VARIABLES
    // =======================================================

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL"
      );
    }

    if (!serviceRoleKey) {
      throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    // =======================================================
    // SERVER-ONLY SUPABASE CLIENT
    // =======================================================

    const supabaseAdmin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,
          },
        }
      );

    // =======================================================
    // GET CURRENT ESPN DATA
    // =======================================================

    const league =
      await getEspnLeague();

    const syncedAt =
      new Date()
        .toISOString();

    // =======================================================
    // CONVERT ESPN DATA TO DATABASE ROWS
    // =======================================================

    const rows =
      league.teams.map(
        (team) => ({
          season_year:
            league.season,

          espn_team_id:
            team.espnTeamId,

          owner_name:
            team.ownerName,

          team_name:
            team.teamName,

          wins:
            team.wins,

          losses:
            team.losses,

          ties:
            team.ties,

          points_for:
            team.pointsFor,

          points_against:
            team.pointsAgainst,

          playoff_seed:
            team.playoffSeed,

          division_id:
            team.divisionId,

          division_name:
            team.divisionName,

          current_week:
            league.currentWeek,

          playoff_team_count:
            league.playoffTeamCount,

          synced_at:
            syncedAt,
        })
      );

    // =======================================================
    // SAVE CURRENT STANDINGS
    // =======================================================

    const {
      error:
        standingsError,
    } =
      await supabaseAdmin
        .from(
          "espn_current_standings"
        )
        .upsert(
          rows,
          {
            onConflict:
              "season_year,espn_team_id",
          }
        );

    if (
      standingsError
    ) {
      throw standingsError;
    }

    // =======================================================
    // SUCCESS
    // =======================================================

    return Response.json(
      {
        success: true,

        league:
          league.leagueName,

        season:
          league.season,

        currentWeek:
          league.currentWeek,

        teamsUpdated:
          rows.length,

        syncedAt,
      }
    );
  } catch (error) {
    console.error(
      "ESPN Tuesday sync failed:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error.message ||
          "Unknown sync error",
      },
      {
        status: 500,
      }
    );
  }
}
