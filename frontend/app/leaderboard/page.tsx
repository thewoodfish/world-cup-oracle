"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { fetchGlobalLeaderboard, type LeaderboardRow } from "@/lib/api";
import { cn } from "@/lib/utils";

const MEDAL = ["🥇", "🥈", "🥉"];

function displayName(row: LeaderboardRow) {
  return row.display_name ?? `${row.user_id.slice(0, 6)}…`;
}

export default function LeaderboardPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGlobalLeaderboard()
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col items-center gap-1 text-center">
        <Trophy className="h-8 w-8 text-accent" />
        <h1 className="text-2xl font-bold tracking-tight">Global Leaderboard</h1>
        <p className="text-sm text-muted-foreground">
          Total points across every tracked match.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Oracles</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-danger">{error}</p>}
          {!rows && !error && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          )}
          {rows && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No scores yet — be the first to predict a match.
            </p>
          )}
          {rows && rows.length > 0 && (
            <ul className="flex flex-col gap-1">
              {rows.map((row, i) => {
                const isMe = session && row.user_id === session.userId;
                return (
                  <motion.li
                    key={row.user_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                      isMe && "bg-primary/10 font-semibold",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-6 text-center">
                        {MEDAL[i] ?? i + 1}
                      </span>
                      {displayName(row)}
                      {isMe && (
                        <span className="text-[10px] font-bold uppercase text-primary">
                          you
                        </span>
                      )}
                    </span>
                    <span className="font-semibold">{row.total ?? 0}</span>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
