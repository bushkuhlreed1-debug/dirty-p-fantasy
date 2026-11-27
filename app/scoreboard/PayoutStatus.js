"use client";

import { useEffect, useState } from "react";

export default function PayoutStatus({ season, week, ownerId }) {
  const key = `dirty-p:payout:${season}:${week}:${ownerId}`;
  const [entry, setEntry] = useState(null);
  const paid = entry?.key === key && entry.paid;
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      setEntry({ key, paid: localStorage.getItem(key) === "paid" });
      setError(false);
    } catch {
      setError(true);
    }
  }, [key]);

  function toggle() {
    try {
      if (paid) localStorage.removeItem(key);
      else localStorage.setItem(key, "paid");
      setEntry({ key, paid: !paid });
      setError(false);
    } catch {
      setError(true);
    }
  }

  return (
    <>
      <button type="button" className="weekly-payout-status" aria-pressed={paid}
        aria-label={`Week ${week} payout marked paid`} onClick={toggle} disabled={entry?.key !== key}>
        {paid ? "Paid" : "Unpaid"}
      </button>
      {error && <small role="status">Browser storage unavailable.</small>}
    </>
  );
}
