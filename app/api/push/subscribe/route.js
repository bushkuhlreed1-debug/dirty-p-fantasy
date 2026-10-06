import {
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "../../../../lib/supabaseAdmin";

export const runtime =
  "nodejs";


export async function POST(
  request
) {
  try {
    const body =
      await request.json();

    const ownerId =
      Number(
        body.ownerId
      );

    const subscription =
      body.subscription;


    if (
      !ownerId ||
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return NextResponse.json(
        {
          error:
            "Missing owner or push subscription information.",
        },
        {
          status: 400,
        }
      );
    }


    const {
      data: existing,
      error: lookupError,
    } =
      await supabaseAdmin
        .from(
          "push_subscriptions"
        )
        .select("id")
        .eq(
          "endpoint",
          subscription.endpoint
        )
        .maybeSingle();


    if (lookupError) {
      throw lookupError;
    }


    if (existing?.id) {
      const {
        error: updateError,
      } =
        await supabaseAdmin
          .from(
            "push_subscriptions"
          )
          .update({
            owner_id:
              ownerId,

            p256dh:
              subscription
                .keys
                .p256dh,

            auth:
              subscription
                .keys
                .auth,

            enabled:
              true,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            existing.id
          );


      if (updateError) {
        throw updateError;
      }
    } else {
      const {
        error: insertError,
      } =
        await supabaseAdmin
          .from(
            "push_subscriptions"
          )
          .insert({
            endpoint:
              subscription.endpoint,

            owner_id:
              ownerId,

            p256dh:
              subscription
                .keys
                .p256dh,

            auth:
              subscription
                .keys
                .auth,

            enabled:
              true,

            created_at:
              new Date()
                .toISOString(),

            updated_at:
              new Date()
                .toISOString(),
          });


      if (insertError) {
        throw insertError;
      }
    }


    return NextResponse.json({
      ok: true,
    });

  } catch (error) {
    console.error(
      "Push subscription error:",
      error
    );


    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to save push subscription.",
      },
      {
        status: 500,
      }
    );
  }
}
