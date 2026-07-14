"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Circle, PartyPopper, Radio, Trophy, WifiOff, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  PREDICTION_LABEL,
  PREDICTION_ORDER,
  TOTAL_PREDICTION_POINTS,
  type PredictionType,
} from "@/lib/predictions";
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
  card: "🟨 Card",
  substitution: "🔄 Substitution",
  shot: "🎯 Shot",
  penalty: "⚠️ Penalty",
  extra_time_started: "⏱️ Extra Time",
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
  const [myScores, setMyScores] = useState<Map<PredictionType, number>>(new Map());
  const [matchFinished, setMatchFinished] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
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
          if (msg.event_type === "full_time") {
            setMatchFinished(true);
            setShowReveal(true);
          }
        } else if (msg.type === "leaderboard_update") {
          setLeaderboard(msg.top);
        } else if (msg.type === "score_update") {
          if (session && msg.user_id === session.userId) {
            setMyTotal(msg.total);
            setMyScores((prev) =>
              new Map(prev).set(msg.prediction_type as PredictionType, msg.points),
            );
          }
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

      <AnimatePresence>
        {showReveal && session && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
            onClick={() => setShowReveal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 20, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="w-80 overflow-hidden">
                <CardHeader className="items-center text-center">
                  <PartyPopper className="h-8 w-8 text-accent" />
                  <CardTitle>Full time!</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {PREDICTION_ORDER.map((type) => {
                    const pts = myScores.get(type);
                    const correct = (pts ?? 0) > 0;
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          {pts === undefined ? (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : correct ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-danger" />
                          )}
                          {PREDICTION_LABEL[type]}
                        </span>
                        <span className="font-semibold">
                          {pts === undefined ? "—" : `+${pts}`}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between rounded-md bg-accent/15 px-3 py-2">
                    <span className="text-sm font-medium">Total score</span>
                    <span className="text-lg font-bold text-accent">
                      {myTotal ?? 0}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        / {TOTAL_PREDICTION_POINTS}
                      </span>
                    </span>
                  </div>
                  <Button variant="outline" onClick={() => setShowReveal(false)}>
                    Close
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {session && myScores.size > 0 && (
        <Card>
          <CardContent className="flex flex-wrap gap-2 p-3">
            {PREDICTION_ORDER.filter((t) => myScores.has(t)).map((type) => {
              const pts = myScores.get(type) ?? 0;
              const correct = pts > 0;
              return (
                <motion.span
                  key={type}
                  layout
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                    correct
                      ? "bg-primary/15 text-primary"
                      : matchFinished
                        ? "bg-danger/10 text-danger"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {correct ? "🔥" : matchFinished ? "✕" : "⏳"} {PREDICTION_LABEL[type]}
                  {correct && ` +${pts}`}
                </motion.span>
              );
            })}
          </CardContent>
        </Card>
      )}

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
                    initial={{ opacity: 0, x: -12, scale: item.event_type === "goal" ? 0.9 : 1 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm",
                      item.event_type === "goal"
                        ? "bg-accent/15 font-semibold text-accent-foreground"
                        : "bg-muted",
                    )}
                  >
                    {item.event_type === "goal" ? `⚽ ${item.summary}` : item.summary}
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
