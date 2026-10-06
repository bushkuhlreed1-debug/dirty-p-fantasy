"use client";

import {
  useEffect,
  useState,
} from "react";


function urlBase64ToUint8Array(
  base64String
) {
  const padding =
    "=".repeat(
      (
        4 -
        (base64String.length % 4)
      ) %
        4
    );

  const base64 =
    (
      base64String +
      padding
    )
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const rawData =
    window.atob(base64);

  return Uint8Array.from(
    [...rawData].map(
      (character) =>
        character.charCodeAt(0)
    )
  );
}


async function saveSubscription(
  ownerId,
  subscription
) {
  const response =
    await fetch(
      "/api/push/subscribe",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            ownerId:
              Number(ownerId),

            subscription:
              subscription.toJSON(),
          }),
      }
    );


  const result =
    await response.json();


  if (!response.ok) {
    throw new Error(
      result?.error ||
        "Unable to save notification subscription."
    );
  }


  return result;
}


export default function NotificationButton({
  owners = [],
}) {
  const [
    supported,
    setSupported,
  ] = useState(true);

  const [
    enabled,
    setEnabled,
  ] = useState(false);

  const [
    choosingOwner,
    setChoosingOwner,
  ] = useState(false);

  const [
    ownerId,
    setOwnerId,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    testLoading,
    setTestLoading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");


  useEffect(() => {
    async function checkNotifications() {
      const pushSupported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;


      setSupported(
        pushSupported
      );


      if (!pushSupported) {
        return;
      }


      const savedOwnerId =
        window.localStorage.getItem(
          "dirtyPNotificationOwnerId"
        );


      if (savedOwnerId) {
        setOwnerId(
          savedOwnerId
        );
      }


      try {
        await navigator
          .serviceWorker
          .register("/sw.js");


        await navigator
          .serviceWorker
          .ready;


        const registration =
          await navigator
            .serviceWorker
            .ready;


        let subscription =
          await registration
            .pushManager
            .getSubscription();


        const currentPublicKey =
          process.env
            .NEXT_PUBLIC_VAPID_PUBLIC_KEY;


        if (
          subscription &&
          currentPublicKey
        ) {
          const existingKey =
            subscription
              .options
              ?.applicationServerKey;


          if (existingKey) {
            const existingArray =
              new Uint8Array(
                existingKey
              );


            const currentArray =
              urlBase64ToUint8Array(
                currentPublicKey
              );


            const sameKey =
              existingArray.length ===
                currentArray.length &&
              existingArray.every(
                (value, index) =>
                  value ===
                  currentArray[index]
              );


            if (!sameKey) {
              await subscription
                .unsubscribe();

              subscription =
                null;
            }
          }
        }


        if (
          !subscription
        ) {
          setEnabled(false);

          if (savedOwnerId) {
            setMessage(
              "Tap Enable Notifications to reconnect this device."
            );
          }

          return;
        }


        if (savedOwnerId) {
          try {
            await saveSubscription(
              savedOwnerId,
              subscription
            );


            setEnabled(true);

          } catch (error) {
            console.error(
              "Subscription sync error:",
              error
            );


            setEnabled(false);

            setMessage(
              error?.message ||
                "Unable to sync notifications."
            );
          }


          return;
        }


        setEnabled(false);

        setChoosingOwner(true);

        setMessage(
          "Choose your name to finish notification setup."
        );

      } catch (error) {
        console.error(
          "Service worker error:",
          error
        );


        setEnabled(false);

        setMessage(
          error?.message ||
            "Unable to check notifications."
        );
      }
    }


    checkNotifications();
  }, []);


  async function enableNotifications(
    selectedOwnerId
  ) {
    if (!selectedOwnerId) {
      setMessage(
        "Select your name first."
      );

      return;
    }


    setLoading(true);
    setMessage("");


    try {
      if (!supported) {
        throw new Error(
          "Push notifications are not supported in this browser."
        );
      }


      const permission =
        await Notification
          .requestPermission();


      if (
        permission !==
        "granted"
      ) {
        throw new Error(
          "Notification permission was not granted."
        );
      }


      await navigator
        .serviceWorker
        .register("/sw.js");


      const registration =
        await navigator
          .serviceWorker
          .ready;


      const publicKey =
        process.env
          .NEXT_PUBLIC_VAPID_PUBLIC_KEY;


      if (!publicKey) {
        throw new Error(
          "Missing public VAPID key."
        );
      }


      let subscription =
        await registration
          .pushManager
          .getSubscription();


      if (subscription) {
        const existingKey =
          subscription
            .options
            ?.applicationServerKey;


        if (existingKey) {
          const existingArray =
            new Uint8Array(
              existingKey
            );

          const currentArray =
            urlBase64ToUint8Array(
              publicKey
            );


          const sameKey =
            existingArray.length ===
              currentArray.length &&
            existingArray.every(
              (value, index) =>
                value ===
                currentArray[index]
            );


          if (!sameKey) {
            await subscription
              .unsubscribe();

            subscription =
              null;
          }
        }
      }


      if (!subscription) {
        subscription =
          await registration
            .pushManager
            .subscribe({
              userVisibleOnly:
                true,

              applicationServerKey:
                urlBase64ToUint8Array(
                  publicKey
                ),
            });
      }


      await saveSubscription(
        selectedOwnerId,
        subscription
      );


      window.localStorage.setItem(
        "dirtyPNotificationOwnerId",
        String(
          selectedOwnerId
        )
      );


      setOwnerId(
        String(
          selectedOwnerId
        )
      );

      setEnabled(true);

      setChoosingOwner(false);

      setMessage(
        "Notifications enabled."
      );

    } catch (error) {
      console.error(
        "Notification setup error:",
        error
      );


      setEnabled(false);

      setMessage(
        error?.message ||
          "Unable to enable notifications."
      );
    } finally {
      setLoading(false);
    }
  }


  async function sendTestNotification() {
    if (!ownerId) {
      setMessage(
        "No owner selected."
      );

      return;
    }


    setTestLoading(true);

    setMessage(
      "Sending test..."
    );


    try {
      const response =
        await fetch(
          "/api/push/test",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                ownerId:
                  Number(ownerId),
              }),
          }
        );


      const result =
        await response.json();


      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Unable to send test notification."
        );
      }


      setMessage(
        "Test notification sent."
      );

    } catch (error) {
      console.error(
        "Test notification error:",
        error
      );


      setMessage(
        error?.message ||
          "Unable to send test notification."
      );
    } finally {
      setTestLoading(false);
    }
  }


  function handleButtonClick() {
    if (enabled) {
      setMessage(
        "Notifications are already enabled on this device."
      );

      return;
    }


    if (ownerId) {
      enableNotifications(
        ownerId
      );

      return;
    }


    setChoosingOwner(true);

    setMessage("");
  }


  return (
    <section className="notification-card">

      <div className="notification-card-copy">

        <span className="notification-eyebrow">
          LIVE LEAGUE ALERTS
        </span>


        <strong className="notification-title">
          Stay on top of your matchup.
        </strong>


        <p>
          Get matchup start alerts,
          touchdown notifications,
          lead changes after both teams
          reach 50 points, Thursday and
          Sunday score updates, and final
          scores.
        </p>

      </div>


      <div className="notification-card-actions">

        {!supported && (

          <span className="notification-status">
            Push notifications are not
            supported in this browser.
          </span>

        )}


        {choosingOwner &&
          !enabled && (

          <div className="notification-owner-picker">

            <label htmlFor="notification-owner">
              WHO ARE YOU?
            </label>


            <select
              id="notification-owner"
              value={ownerId}
              onChange={(
                event
              ) =>
                setOwnerId(
                  event.target.value
                )
              }
            >

              <option value="">
                Select owner
              </option>


              {owners.map(
                (owner) => (

                  <option
                    value={
                      owner.id
                    }
                    key={
                      owner.id
                    }
                  >
                    {owner.name}
                  </option>

                )
              )}

            </select>


            <button
              type="button"
              className="notification-enable-button"
              disabled={
                loading ||
                !ownerId
              }
              onClick={() =>
                enableNotifications(
                  ownerId
                )
              }
            >

              {loading
                ? "Enabling..."
                : "Enable Notifications"}

            </button>

          </div>

        )}


        {!choosingOwner ||
        enabled ? (

          <button
            type="button"
            className={
              enabled
                ? "notification-enable-button enabled"
                : "notification-enable-button"
            }
            disabled={
              loading ||
              !supported
            }
            onClick={
              handleButtonClick
            }
          >

            {loading
              ? "Working..."
              : enabled
                ? "Notifications On"
                : "Enable Notifications"}

          </button>

        ) : null}


        {enabled && (

          <button
            type="button"
            className="notification-enable-button"
            disabled={
              testLoading
            }
            onClick={
              sendTestNotification
            }
          >

            {testLoading
              ? "Sending..."
              : "Send Test Notification"}

          </button>

        )}


        {message && (

          <span className="notification-status">
            {message}
          </span>

        )}

      </div>

    </section>
  );
}
