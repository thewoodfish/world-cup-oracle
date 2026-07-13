"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fetchMatches, type MatchRow } from "@/lib/api";

function statusBadge(status: string) {
  if (status === "live") {
    return (
      <Badge variant="live" className="animate-pulse-live">
        ● Live
      </Badge>
    );
  }
  if (status === "finished") return <Badge variant="default">Finished</Badge>;
  return <Badge variant="primary">Upcoming</Badge>;
}

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MatchList() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMatches()
      .then((data) => {
        if (!cancelled) setMatches(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="text-sm text-danger">Couldn&apos;t reach the backend: {error}</p>
    );
  }

  if (!matches) {
    return <p className="text-sm text-muted-foreground">Loading matches…</p>;
  }

  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No matches scheduled yet.</p>
    );
  }

  return (
    <ul className="flex w-full flex-col gap-3">
      {matches.map((match) => (
        <li key={match.id}>
          <Link href={`/match/${match.id}`}>
            <Card className="group flex items-center justify-between gap-4 p-4 transition-colors hover:border-primary/50">
              <div className="flex flex-col gap-1">
                <span className="font-semibold">
                  {match.home_team} vs {match.away_team}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatKickoff(match.kickoff_at)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {statusBadge(match.status)}
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
