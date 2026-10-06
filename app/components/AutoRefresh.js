"use client";

import {
  useEffect,
} from "react";

import {
  useRouter,
} from "next/navigation";


export default function AutoRefresh({
  enabled = false,
  intervalMs = 30000,
}) {
  const router =
    useRouter();


  useEffect(() => {
    if (!enabled) {
      return;
    }


    const timer =
      setInterval(
        () => {
          router.refresh();
        },
        intervalMs
      );


    return () => {
      clearInterval(
        timer
      );
    };
  }, [
    enabled,
    intervalMs,
    router,
  ]);


  return null;
}
