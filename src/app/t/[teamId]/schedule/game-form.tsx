"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeCall } from "@/lib/safe-call";
import { deleteGameAction, saveGameAction } from "../scout/actions";

const NEW = "__new__";

/** Add a game: pick an opponent already on the list, or type a new one. */
export function GameForm({ teamId, opponents, season }: { teamId: string; opponents: Array<{ id: string; name: string; season: number }>; season: number }) {
  const router = useRouter();
  const [opponentId, setOpponentId] = useState(opponents[0]?.id ?? NEW);
  const [name, setName] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [homeAway, setHomeAway] = useState<"home" | "away" | "neutral">("home");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const fresh = opponentId === NEW ? { name, season: gameDate ? Number(gameDate.slice(0, 4)) : season } : null;
    const r = await safeCall(() => saveGameAction(teamId, null, { opponentId, gameDate, kickoff, homeAway, location }, fresh), "Adding the game");
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setName("");
    setGameDate("");
    setKickoff("");
    setLocation("");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Opponent</span>
          <select className="input" value={opponentId} onChange={(e) => setOpponentId(e.target.value)}>
            {opponents.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} {o.season}
              </option>
            ))}
            <option value={NEW}>A new opponent…</option>
          </select>
        </label>
        {opponentId === NEW && (
          <label className="flex flex-col gap-1">
            <span className="text-muted">Their name</span>
            <input className="input" value={name} placeholder="Central" onChange={(e) => setName(e.target.value)} />
          </label>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Date</span>
          <input className="input" type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Kickoff</span>
          <input className="input" value={kickoff} placeholder="7:00 PM" onChange={(e) => setKickoff(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Where</span>
          <select className="input" value={homeAway} onChange={(e) => setHomeAway(e.target.value as "home" | "away" | "neutral")}>
            <option value="home">Home</option>
            <option value="away">Away</option>
            <option value="neutral">Neutral site</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Field</span>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary min-h-9 px-4 text-sm" disabled={busy || !gameDate || (opponentId === NEW && !name.trim())} onClick={save}>
          Add game
        </button>
        {msg && (
          <span role="status" className="text-bad">
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

export function RemoveGame({ teamId, gameId, label }: { teamId: string; gameId: string; label: string }) {
  const router = useRouter();
  return (
    <button
      className="text-sm text-muted underline"
      onClick={async () => {
        if (!window.confirm(`Take ${label} off the schedule?`)) return;
        const r = await safeCall(() => deleteGameAction(teamId, gameId), "Removing the game");
        if (r.ok) router.refresh();
        else window.alert(r.error);
      }}
    >
      Remove
    </button>
  );
}
