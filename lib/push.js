import webpush from "web-push";

let configured = false;

function configureWebPush() {
  if (configured) {
    return;
  }

  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const privateKey =
    process.env.VAPID_PRIVATE_KEY;

  const subject =
    process.env.VAPID_SUBJECT;

  if (
    !publicKey ||
    !privateKey ||
    !subject
  ) {
    throw new Error(
      "Missing VAPID environment variables."
    );
  }

  webpush.setVapidDetails(
    subject,
    publicKey,
    privateKey
  );

  configured = true;
}

export async function sendPush(
  subscription,
  payload
) {
  configureWebPush();

  return webpush.sendNotification(
    {
      endpoint:
        subscription.endpoint,

      keys: {
        p256dh:
          subscription.p256dh,

        auth:
          subscription.auth,
      },
    },

    JSON.stringify(payload)
  );
}
