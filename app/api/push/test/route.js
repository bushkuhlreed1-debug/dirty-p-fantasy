import { NextResponse } from "next/server";

import {
  supabaseAdmin,
} from "../../../../lib/supabaseAdmin";

import {
  sendPush,
} from "../../../../lib/push";


export const runtime = "nodejs";


export async function POST(request) {
  try {
    const body =
      await request.json();

    const ownerId =
      Number(body.ownerId);


    if (!ownerId) {
      return NextResponse.json(
        {
          error:
            "Missing owner ID.",
        },
        {
          status: 400,
        }
      );
    }


    const {
      data: subscriptions,
      error,
    } =
      await supabaseAdmin
        .from(
          "push_subscriptions"
        )
        .select(
          "id, endpoint, p256dh, auth"
        )
        .eq(
          "owner_id",
          ownerId
        )
        .eq(
          "enabled",
          true
        );


    if (error) {
      throw error;
    }


    if (
      !subscriptions ||
      subscriptions.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No active notification subscription found.",
        },
        {
          status: 404,
        }
      );
    }


    let sent = 0;
    let failed = 0;


    for (
      const subscription of
      subscriptions
    ) {
      try {
        await sendPush(
          subscription,
          {
            title:
              "🏈 DIRTY P FANTASY FOOTBALL",

            body:
              "Notifications are live. You’re locked in for matchup alerts.",

            tag:
              "dirty-p-test",

            url:
              "/",
          }
        );


        sent += 1;

      } catch (pushError) {
        console.error(
          "Test push error:",
          pushError
        );


        failed += 1;


        if (
          pushError?.statusCode === 404 ||
          pushError?.statusCode === 410
        ) {
          await supabaseAdmin
            .from(
              "push_subscriptions"
            )
            .delete()
            .eq(
              "id",
              subscription.id
            );
        }
      }
    }


    if (sent === 0) {
      return NextResponse.json(
        {
          error:
            "The push notification could not be delivered.",
          failed,
        },
        {
          status: 500,
        }
      );
    }


    return NextResponse.json({
      ok: true,
      sent,
      failed,
    });

  } catch (error) {
    console.error(
      "Test notification route error:",
      error
    );


    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to send test notification.",
      },
      {
        status: 500,
      }
    );
  }
}
