"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./NflLogoRibbon.module.css";

const names = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills",
  CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
  HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs",
  LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams", LV: "Las Vegas Raiders", MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
  NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders",
};

function logo(code) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${code.toLowerCase()}.png`;
}

function kickoff(game) {
  const date = new Date(game.date);
  const options = { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" };
  if (game.timeTBD) return date.toLocaleDateString("en-US", options) + " · Time TBD";
  return date.toLocaleString("en-US", { ...options, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export default function NflLogoRibbon({ ownerNames }) {
  const dialog = useRef(null);
  const [code, setCode] = useState(null);
  const [info, setInfo] = useState(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    fetch(`/api/nfl-team/${code}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setInfo(data); })
      .catch(() => { if (!controller.signal.aborted) setInfo({}); });
    return () => controller.abort();
  }, [code]);

  function open(team) {
    setInfo(null);
    setCode(team);
    dialog.current.showModal();
  }

  return (
    <div className="dp-nfl-ribbon">
      <div className={`dp-nfl-ribbon-window ${styles.window}`} onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onPointerLeave={() => setPressed(false)}>
        <div className="dp-nfl-ribbon-track" style={{ animationPlayState: pressed || code ? "paused" : undefined }}>
          {[0, 1].map(copy => (
            <div className="dp-nfl-ribbon-group" key={copy} aria-hidden={copy === 1 || undefined}>
              {Object.keys(names).map(team => (
                <button key={team} className={styles.team} type="button" tabIndex={copy ? -1 : 0}
                  aria-label={names[team]} aria-haspopup="dialog" onClick={() => open(team)}>
                  <img src={logo(team)} alt="" width="40" height="40" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <dialog className={styles.card} ref={dialog} aria-labelledby="nfl-team-title"
        onClose={() => { setCode(null); setPressed(false); }}
        onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
        {code && <div className={styles.body}>
          <header><img src={logo(code)} width="48" height="48" alt="" />
            <h2 id="nfl-team-title">{names[code]}</h2>
            <button type="button" className={styles.close} aria-label="Close team card" onClick={() => dialog.current.close()}>×</button>
          </header>
          {!info ? <p role="status">Loading team details…</p> : <>
            <h3>Next game</h3>
            {info.game ? <p><strong>{info.game.home ? "vs." : "at"} {info.game.opponent}</strong><br />{kickoff(info.game)}</p>
              : <p>{info.scheduleAvailable ? "No upcoming game listed." : "Schedule currently unavailable."}</p>}
            <h3>On Dirty P rosters</h3>
            {info.owners?.length ? (
              <ul className={styles.rosters}>
                {info.owners.map(owner => (
                  <li className={styles.roster} key={owner.teamId}>
                    <h4 className={styles.ownerName}>
                      <span>Owner</span>
                      {ownerNames[owner.teamId] || `Fantasy team ${owner.teamId}`}
                    </h4>
                    <ul className={styles.players} aria-label="Rostered players">
                      {owner.players.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            )
              : <p>{info.owners ? "No Dirty P owner rosters a player from this team." : "Current rosters are unavailable."}</p>}
          </>}
        </div>}
      </dialog>
    </div>
  );
}
