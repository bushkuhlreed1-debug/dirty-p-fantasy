import { revalidateTag } from "next/cache";
import { getEspnLeague } from "../../../../lib/espn";

export async function GET(request) {
  const authHeader =
    request.headers.get("authorization");

  if (
    process.env.CRON_SECRET &&
    authHeader !==
      `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json(
      {
        success: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  try {
    // Clear the previous ESPN cache
    revalidateTag("espn-league");

    // Immediately fetch fresh data
    const league =
      await getEspnLeague();

    return Response.json({
      success: true,
      updatedAt:
        new Date().toISOString(),
      currentWeek:
        league.currentWeek,
      teams:
        league.teams?.length || 0,
    });
  } catch (error) {
    console.error(
      "ESPN Tuesday sync failed:",
      error
    );

    return Response.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
