"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/countdown";
import { fetchMatches, type MatchRow } from "@/lib/api";
import { teamFlag } from "@/lib/teams";

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
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-border bg-muted"
          />
        ))}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No matches scheduled yet.</p>
    );
  }

  return (
    <ul className="flex w-full flex-col gap-3">
      {matches.map((match, i) => (
        <motion.li
          key={match.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
        >
          <Link href={`/match/${match.id}`}>
            <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.99 }}>
              <Card className="group relative overflow-hidden p-5 transition-colors hover:border-primary/50 hover:shadow-md">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center text-2xl">
                      <span>{teamFlag(match.home_team)}</span>
                      <span className="mx-1.5 text-xs font-medium text-muted-foreground">
                        vs
                      </span>
                      <span>{teamFlag(match.away_team)}</span>
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold">
                        {match.home_team} vs {match.away_team}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatKickoff(match.kickoff_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {statusBadge(match.status)}
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
                {match.status === "scheduled" && (
                  <div className="mt-4 border-t border-border pt-3">
                    <Countdown targetIso={match.kickoff_at} />
                  </div>
                )}
              </Card>
            </motion.div>
          </Link>
        </motion.li>
      ))}
    </ul>
  );
}
