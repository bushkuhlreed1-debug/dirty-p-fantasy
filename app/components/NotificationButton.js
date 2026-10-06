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
    window.atob(
      base64
    );

  return Uint8Array.from(
    [...rawData].map(
      (character) =>
        character.charCodeAt(
          0
        )
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
  ] =
    useState(true);

  const [
    enabled,
    setEnabled,
  ] =
    useState(false);

  const [
    choosingOwner,
    setChoosingOwner,
  ] =
    useState(false);

  const [
    ownerId,
    setOwnerId,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState("");


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
        const registration =
          await navigator
            .serviceWorker
            .register(
              "/sw.js"
            );


        const subscription =
          await registration
            .pushManager
            .getSubscription();


        if (!subscription) {
          setEnabled(false);

          return;
        }


        // If we already know who this
        // device belongs to, re-sync
        // the existing browser
        // subscription with Supabase.
        if (savedOwnerId) {
          try {
            await saveSubscription(
              savedOwnerId,
              subscription
            );


            setEnabled(true);

            setMessage(
              "Notifications are enabled."
            );
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


        // A browser subscription exists,
        // but the failed first attempt
        // may not have saved an owner.
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


      const registration =
        await navigator
          .serviceWorker
          .register(
            "/sw.js"
          );


      await navigator
        .serviceWorker
        .ready;


      let subscription =
        await registration
          .pushManager
          .getSubscription();


      if (!subscription) {
        const publicKey =
          process.env
            .NEXT_PUBLIC_VAPID_PUBLIC_KEY;


        if (!publicKey) {
          throw new Error(
            "Missing public VAPID key."
          );
        }


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

            On iPhone, add the site to
            your Home Screen and open it
            from there.

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


        {message && (

          <span className="notification-status">
            {message}
          </span>

        )}

      </div>

    </section>
  );
}
