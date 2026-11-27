"use client";

import { useRouter } from "next/navigation";

export default function WeekPicker({ weeks, week }) {
  const router = useRouter();
  return (
    <div className="weekly-board-picker">
      <label>
        Week
        <select value={week} onChange={event => router.push(`/scoreboard?week=${event.target.value}`)}>
          {weeks.map(period => <option key={period} value={period}>Week {period}</option>)}
        </select>
      </label>
    </div>
  );
}
