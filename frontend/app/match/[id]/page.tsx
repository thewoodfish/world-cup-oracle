"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/countdown";
import { WalletButton } from "@/app/wallet-button";
import { fetchMatches, type MatchRow } from "@/lib/api";
import { teamFlag } from "@/lib/teams";
import { PredictionForm } from "./prediction-form";
import { LivePanel } from "./live-panel";

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;
  const [match, setMatch] = useState<MatchRow | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchMatches()
      .then((rows) => {
        if (!cancelled) setMatch(rows.find((m) => m.id === matchId) ?? null);
      })
      .catch(() => !cancelled && setMatch(null));
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const locked = match ? new Date(match.kickoff_at) <= new Date() : false;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All matches
        </Link>
        <WalletButton />
      </div>

      {match === undefined && (
        <p className="text-sm text-muted-foreground">Loading match…</p>
      )}
      {match === null && (
        <p className="text-sm text-danger">Match not found.</p>
      )}

      {match && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge variant={locked ? "default" : "primary"}>
                {locked ? "In progress / finished" : "Upcoming"}
              </Badge>
            </div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <span>{teamFlag(match.home_team)}</span>
              {match.home_team} vs {match.away_team}
              <span>{teamFlag(match.away_team)}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Kickoff {new Date(match.kickoff_at).toLocaleString()}
            </p>
            {!locked && <Countdown targetIso={match.kickoff_at} />}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <PredictionForm
              matchId={matchId}
              locked={locked}
              homeTeam={match.home_team}
              awayTeam={match.away_team}
            />
            <LivePanel matchId={matchId} />
          </div>
        </>
      )}
    </div>
  );
}
