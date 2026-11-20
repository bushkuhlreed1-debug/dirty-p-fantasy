"use client";

import { useCallback, useEffect, useState } from "react";

const OPTIONS = [
  {key:"matchupStart",name:"Matchup starts",detail:"When your fantasy matchup begins"},
  {key:"touchdowns",name:"My players' touchdowns",detail:"Touchdowns scored by your selected starters"},
  {key:"receptions",name:"Every reception",detail:"Receiving catches by your selected starters"},
  {key:"bigPlays",name:"Big plays (20+ yards)",detail:"Big rushing or receiving plays by your starters"},
  {key:"milestones",name:"Fantasy point milestones",detail:"When a starter first passes 10, 20 or 30 fantasy points"},
  {key:"playerFinal",name:"Player final stats",detail:"Each starter's final fantasy score and stats"},
  {key:"leadChanges",name:"Matchup lead changes",detail:"When you take or lose the fantasy lead"},
  {key:"gameUpdates",name:"Thursday & Sunday updates",detail:"End-of-day fantasy matchup score summaries"},
  {key:"finalScores",name:"Matchup final score",detail:"The final result of your head-to-head matchup"},
  {key:"recordWatch",name:"League record alerts",detail:"When your team approaches or breaks a league scoring record"},
  {key:"playoffPulse",name:"Playoff race alerts",detail:"Major estimated changes to your playoff outlook"},
];
const DEFAULTS = {
  matchupStart:true,touchdowns:true,receptions:false,bigPlays:false,
  milestones:false,playerFinal:true,leadChanges:true,gameUpdates:true,
  finalScores:true,recordWatch:false,playoffPulse:false,selectedPlayers:[]
};
const normalized = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g,"");

export default function NotificationPreferences({ playersByOwner = {} }) {
  const [ready,setReady]=useState(false);
  const [ownerId,setOwnerId]=useState("");
  const [prefs,setPrefs]=useState(DEFAULTS);
  const [saving,setSaving]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [message,setMessage]=useState("");
  const [showPlayers,setShowPlayers]=useState(false);

  const fetchDevice = useCallback(async () => {
    if(!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setReady(false);
      return;
    }
    const id=window.localStorage.getItem("dirtyPNotificationOwnerId") || "";
    if(!id){setReady(false);return;}
    const registration=await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.getSubscription();
    if(!subscription){setReady(false);return;}
    setOwnerId(id);
    const response=await fetch("/api/push/preferences",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"load",ownerId:Number(id),endpoint:subscription.endpoint})
    });
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||"Could not load notification settings");
    setPrefs(result.preferences);
    setDirty(false);
    setReady(true);
  },[]);

  useEffect(()=>{
    fetchDevice().catch(error=>setMessage(error?.message||"Unable to load settings"));
    const listener=()=>fetchDevice().catch(error=>setMessage(error?.message||"Unable to load settings"));
    window.addEventListener("dirty-p-notifications-changed",listener);
    return ()=>window.removeEventListener("dirty-p-notifications-changed",listener);
  },[fetchDevice]);

  async function save(){
    setSaving(true);setMessage("");
    try{
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription();
      if(!subscription)throw new Error("Enable notifications on this phone first.");
      const response=await fetch("/api/push/preferences",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"save",ownerId:Number(ownerId),endpoint:subscription.endpoint,preferences:prefs})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Unable to save preferences");
      setPrefs(result.preferences);setDirty(false);setMessage("Preferences saved for this device.");
    }catch(error){setMessage(error?.message||"Unable to save preferences");}
    finally{setSaving(false);}
  }

  const players=playersByOwner[String(ownerId)] || [];
  const selected=prefs.selectedPlayers || [];

  return (
    <section className="dp-custom-alert-settings">
      <div className="dp-custom-alert-heading">
        <span className="notification-eyebrow">YOUR PHONE · YOUR RULES</span>
        <h2>Customize My Alerts</h2>
        <p>Choose what makes your phone buzz. Different phones can have different preferences.</p>
      </div>
      {!ready ? (
        <div className="dp-custom-alert-empty">
          Subscribe to Notifications above, then your alert preferences will appear here automatically.
          {message && <p role="status">{message}</p>}
        </div>
      ) : (
        <>
          <div className="dp-custom-alert-owner">Managing alerts for <strong>{
            (()=>{const saved=playersByOwner[String(ownerId)];return saved?.ownerName || "your selected owner";})()
          }</strong></div>
          <div className="dp-custom-alert-options">
            {OPTIONS.map(option=>(
              <label className="dp-custom-alert-option" key={option.key}>
                <span>
                  <strong>{option.name}</strong>
                  <small>{option.detail}</small>
                </span>
                <input type="checkbox" checked={Boolean(prefs[option.key])}
                  onChange={event=>{
                    setPrefs(p=>({...p,[option.key]:event.target.checked}));
                    setDirty(true);setMessage("");
                  }}/>
              </label>
            ))}
          </div>
          <div className="dp-custom-alert-players">
            <button type="button" className="dp-custom-alert-players-trigger"
              onClick={()=>setShowPlayers(v=>!v)}
              aria-expanded={showPlayers}>
              <span><strong>Which players should trigger alerts?</strong><small>{
                selected.length ? selected.length+" selected player"+(selected.length===1?"":"s") :
                "All current starters (default)"
              }</small></span>
              <span aria-hidden="true">{showPlayers?"⌃":"⌄"}</span>
            </button>
            {showPlayers && (
              <div className="dp-custom-alert-players-body">
                <p>Use this for touchdowns, receptions, big plays, point milestones and final player stats. Leave every player unchecked to follow all your current starters.</p>
                {players.length===0 ? (
                  <p>Current starters aren't available from ESPN right now. Your alerts will follow all starters unless you selected players previously.</p>
                ) : (
                  <>
                    <button type="button" className="dp-custom-alert-all"
                      onClick={()=>{setPrefs(p=>({...p,selectedPlayers:[]}));setDirty(true);}}>
                      {selected.length===0?"✓ All starters":"Follow all starters"}
                    </button>
                    {players.map(player=>{
                      const key=normalized(player.name);
                      return (
                        <label key={player.id || key} className="dp-custom-alert-player-option">
                          <span><strong>{player.name}</strong><small>{player.position || ""} · {player.nflTeam || ""}</small></span>
                          <input type="checkbox" checked={selected.includes(key)}
                            onChange={event=>{
                              setPrefs(p=>{
                                const next=event.target.checked ?
                                  [...(p.selectedPlayers||[]),key] :
                                  (p.selectedPlayers||[]).filter(x=>x!==key);
                                return {...p,selectedPlayers:next};
                              });setDirty(true);
                            }}/>
                        </label>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
          <button type="button" className="dp-custom-alert-save"
            onClick={save} disabled={saving||!dirty}>
            {saving?"Saving...":dirty?"Save Alert Preferences":"Preferences Saved"}
          </button>
          {message && <p className="dp-custom-alert-message" role="status">{message}</p>}
          <p className="dp-custom-alert-help">
            Alerts depend on live ESPN updates and the Dirty P notification checker.
            A catch or play can arrive late if ESPN updates its stats after the play.
          </p>
        </>
      )}
    </section>
  );
}
