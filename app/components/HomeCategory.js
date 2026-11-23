"use client";

import { useLayoutEffect, useRef } from "react";

export default function HomeCategory({ category, className, children }) {
  const detailsRef = useRef(null);
  const storageKey = `dirty-p:home-category:${category}`;

  useLayoutEffect(() => {
    const details = detailsRef.current;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved !== null) details.open = saved === "open";
    } catch {
      // The disclosure still works when storage is unavailable.
    }
  }, [storageKey]);

  function remember(event) {
    if (event.target !== event.currentTarget) return;

    try {
      window.localStorage.setItem(storageKey, event.currentTarget.open ? "open" : "closed");
    } catch {
      // Toggling remains available without storage.
    }
  }

  return (
    <details ref={detailsRef} className={`${className} dp-home-category`} onToggle={remember}>
      {children}
    </details>
  );
}
