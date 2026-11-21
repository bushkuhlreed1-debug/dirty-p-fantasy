"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({
  enabled = false,
  intervalMs = 30000,
  nextKickoff = null,
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    let timer;
    let nextCheck = Math.min(Date.now() + intervalMs, nextKickoff ?? Infinity);

    function schedule() {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;

      timer = setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        nextCheck = Date.now() + intervalMs;
        router.refresh();
        schedule();
      }, Math.max(0, nextCheck - Date.now()));
    }

    document.addEventListener("visibilitychange", schedule);
    schedule();

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [enabled, intervalMs, nextKickoff, router]);

  return null;
}
