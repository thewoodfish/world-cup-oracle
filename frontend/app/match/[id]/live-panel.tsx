"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio, Trophy, WifiOff } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import {
  WS_BASE_URL,
  fetchMatchLeaderboard,
  type LeaderboardRow,
  type WsMessage,
} from "@/lib/api";

type FeedItem = {
  id: string;
  event_type: string;
  summary: string;
};

const EVENT_LABELS: Record<string, string> = {
  goal: "⚽ Goal",
  card: "🟨 Card",
  substitution: "🔄 Substitution",
  shot: "🎯 Shot",
  penalty: "⚠️ Penalty",
  extra_time_started: "⏱️ Extra Time",
  full_time: "🏁 Full Time",
};

function summarize(eventType: string, payload: Record<string, unknown>) {
  if (eventType === "full_time") {
    return `Full time: ${payload.home_score} – ${payload.away_score}`;
  }
  if (eventType === "goal") {
    const id = payload.scorer_player_id;
    return id ? `Goal — player #${id}` : "Goal";
  }
  return EVENT_LABELS[eventType] ?? eventType;
}

function displayName(row: LeaderboardRow) {
  return row.display_name ?? `${row.user_id.slice(0, 6)}…`;
}

export function LivePanel({ matchId }: { matchId: string }) {
  const { session } = useAuth();
  const [connected, setConnected] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [myTotal, setMyTotal] = useState<number | null>(null);
  const [toasts, setToasts] = useState<{ id: string; key: string }[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function resync() {
      fetchMatchLeaderboard(matchId)
        .then((rows) => !cancelled && setLeaderboard(rows))
        .catch(() => undefined);
    }

    function connect() {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/match/${matchId}`);
      socketRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        resync();
      };

      ws.onmessage = (event) => {
        const msg: WsMessage = JSON.parse(event.data);
        if (msg.type === "match_event") {
          setFeed((prev) =>
            [
              {
                id: `${Date.now()}-${Math.random()}`,
                event_type: msg.event_type,
                summary: summarize(msg.event_type, msg.payload),
              },
              ...prev,
            ].slice(0, 15),
          );
        } else if (msg.type === "leaderboard_update") {
          setLeaderboard(msg.top);
        } else if (msg.type === "score_update") {
          if (session && msg.user_id === session.userId) setMyTotal(msg.total);
        } else if (msg.type === "achievement_unlocked") {
          if (session && msg.user_id === session.userId) {
            const id = `${Date.now()}-${Math.random()}`;
            setToasts((prev) => [...prev, { id, key: msg.achievement_key }]);
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 4500);
          }
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        retryTimer = setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [matchId, session]);

  return (
    <div className="flex flex-col gap-4">
      <div className="fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.9 }}
              className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent-foreground shadow-lg backdrop-blur"
            >
              <Trophy className="h-4 w-4 text-accent" />
              Achievement unlocked: {t.key.replace(/_/g, " ")}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2">
        {connected ? (
          <Badge variant="live" className="animate-pulse-live">
            <Radio className="h-3 w-3" /> Live
          </Badge>
        ) : (
          <Badge variant="default">
            <WifiOff className="h-3 w-3" /> Reconnecting…
          </Badge>
        )}
        {session && myTotal !== null && (
          <motion.div
            key={myTotal}
            initial={{ scale: 1.15 }}
            animate={{ scale: 1 }}
            className="ml-auto text-sm font-semibold"
          >
            Your score: <span className="text-primary">{myTotal}</span>
          </motion.div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Match feed</CardTitle>
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Waiting for the first live event…
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {feed.map((item) => (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-md bg-muted px-3 py-2 text-sm"
                  >
                    {item.summary}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scores yet — predictions settle as the match plays.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {leaderboard.map((row, i) => (
                  <motion.li
                    key={row.user_id}
                    layout
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-4 text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      {displayName(row)}
                    </span>
                    <span className="font-semibold">{row.total ?? 0}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
