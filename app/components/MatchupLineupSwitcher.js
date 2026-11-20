"use client";

import { useState } from "react";

export default function MatchupLineupSwitcher({ awayName, homeName, children }) {
  const [selected, setSelected] = useState(0);

  return (
    <div className={`dp-matchup-lineup-switcher dp-matchup-side-${selected}`}>
      <div className="dp-matchup-mobile-tabs" role="tablist" aria-label="Select fantasy team lineup">
        {[awayName, homeName].map((name, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={selected === index}
            className={selected === index ? "dp-selected" : ""}
            onClick={() => setSelected(index)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="dp-two-columns dp-live-columns">
        {children}
      </div>
    </div>
  );
}
