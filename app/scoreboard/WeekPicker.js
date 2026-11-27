"use client";

import { useRouter } from "next/navigation";

export default function WeekPicker({ seasons, weeks, season, week }) {
  const router = useRouter();
  return (
    <div className="weekly-board-picker">
      <label>
        Season
        <select value={season} onChange={event => router.push(`/scoreboard?season=${event.target.value}`)}>
          {seasons.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      <label>
        Week
        <select value={week} onChange={event => router.push(`/scoreboard?season=${season}&week=${event.target.value}`)}>
          {weeks.map(period => <option key={period} value={period}>Week {period}</option>)}
        </select>
      </label>
    </div>
  );
}
