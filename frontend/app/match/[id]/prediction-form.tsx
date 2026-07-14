"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  Flame,
  Lock,
  Loader2,
  Pencil,
  PartyPopper,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMyPredictions,
  fetchOutcomeConsensus,
  submitPrediction,
  type KeyMomentType,
  type Outcome,
  type OutcomeConsensus,
  type Prediction,
} from "@/lib/api";
import {
  PREDICTION_ORDER as STEP_ORDER,
  PREDICTION_POINTS as POINTS,
  TOTAL_PREDICTION_POINTS as TOTAL_POINTS,
  type PredictionType,
} from "@/lib/predictions";

const STEP_TITLE: Record<PredictionType, string> = {
  outcome: "Who wins?",
  scoreline: "Final score?",
  key_moment: "Key moment?",
  player_performance: "Who scores?",
};

const KEY_MOMENTS: { value: KeyMomentType; label: string }[] = [
  { value: "red_card", label: "Red card shown" },
  { value: "penalty", label: "Penalty awarded" },
  { value: "extra_time", label: "Goes to extra time" },
];

function describePrediction(p: Prediction, home: string, away: string): string {
  switch (p.prediction_type) {
    case "outcome":
      return p.guess === "home_win" ? `${home} win` : p.guess === "away_win" ? `${away} win` : "Draw";
    case "scoreline":
      return `${home} ${p.guess_home} – ${p.guess_away} ${away}`;
    case "key_moment": {
      const label = KEY_MOMENTS.find((m) => m.value === p.moment)?.label ?? p.moment;
      return `${label}: ${p.guess_occurs ? "Yes" : "No"}`;
    }
    case "player_performance":
      return `Player #${p.player_id} to score`;
  }
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -48 : 48, opacity: 0 }),
};

export function PredictionForm({
  matchId,
  locked,
  homeTeam = "Home",
  awayTeam = "Away",
}: {
  matchId: string;
  locked: boolean;
  homeTeam?: string;
  awayTeam?: string;
}) {
  const { session, status: authStatus } = useAuth();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [mode, setMode] = useState<"stepper" | "summary">("stepper");
  const [predictions, setPredictions] = useState<Map<PredictionType, Prediction>>(new Map());
  const [lockType, setLockType] = useState<PredictionType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consensus, setConsensus] = useState<OutcomeConsensus | null>(null);

  const [outcome, setOutcome] = useState<Outcome>("home_win");
  const [guessHome, setGuessHome] = useState(1);
  const [guessAway, setGuessAway] = useState(0);
  const [moment, setMoment] = useState<KeyMomentType>("penalty");
  const [guessOccurs, setGuessOccurs] = useState(true);
  const [playerId, setPlayerId] = useState<number>(0);

  useEffect(() => {
    fetchOutcomeConsensus(matchId).then(setConsensus).catch(() => undefined);
  }, [matchId]);

  useEffect(() => {
    if (!session) return;
    fetchMyPredictions(session.token, matchId)
      .then((rows) => {
        const map = new Map<PredictionType, Prediction>();
        for (const row of rows) {
          map.set(row.prediction_type as PredictionType, row.payload);
          if (row.is_lock) setLockType(row.prediction_type as PredictionType);
        }
        setPredictions(map);
        if (map.size > 0) setMode("summary");
      })
      .catch(() => undefined);
  }, [session, matchId]);

  if (authStatus !== "signed-in" || !session) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Sign in with your wallet above to submit predictions.
        </CardContent>
      </Card>
    );
  }

  function buildPrediction(type: PredictionType): Prediction {
    switch (type) {
      case "outcome":
        return { prediction_type: "outcome", guess: outcome };
      case "scoreline":
        return { prediction_type: "scoreline", guess_home: guessHome, guess_away: guessAway };
      case "key_moment":
        return { prediction_type: "key_moment", moment, guess_occurs: guessOccurs };
      case "player_performance":
        return { prediction_type: "player_performance", player_id: playerId };
    }
  }

  async function commitStep() {
    if (!session) return;
    const type = STEP_ORDER[step];
    const prediction = buildPrediction(type);
    setSubmitting(true);
    setError(null);
    try {
      await submitPrediction(session.token, matchId, prediction, lockType === type);
      setPredictions((prev) => new Map(prev).set(type, prediction));
      advance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  function advance() {
    setDirection(1);
    if (step === STEP_ORDER.length - 1) {
      setMode("summary");
    } else {
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    setDirection(-1);
    setStep((s) => Math.max(0, s - 1));
  }

  const lockedPoints = STEP_ORDER.filter((t) => predictions.has(t)).reduce(
    (sum, t) => sum + (t === lockType ? POINTS[t] * 2 : POINTS[t]),
    0,
  );

  if (mode === "summary") {
    const allDone = predictions.size === STEP_ORDER.length;
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {predictions.size > 0 ? (
              <>
                <Lock className="h-4 w-4 text-accent" />
                Prediction{allDone ? "s" : ""} locked
              </>
            ) : (
              "Your predictions"
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {STEP_ORDER.map((type) => {
              const p = predictions.get(type);
              const isLock = type === lockType;
              return (
                <div
                  key={type}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                    isLock
                      ? "border-accent/50 bg-accent/10"
                      : p
                        ? "border-primary/30 bg-primary/5"
                        : "border-dashed border-border text-muted-foreground",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {p ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-current" />
                    )}
                    {p ? describePrediction(p, homeTeam, awayTeam) : "Not predicted"}
                    {isLock && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-accent">
                        <Star className="h-3 w-3 fill-accent" /> LOCK
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {isLock ? `${POINTS[type] * 2} pts (2×)` : `${POINTS[type]} pts`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-md bg-accent/10 px-3 py-2">
            <span className="text-sm font-medium">Potential points</span>
            <span className="text-lg font-bold text-accent">
              {lockedPoints}
              <span className="text-xs font-normal text-muted-foreground">
                {" "}
                / {TOTAL_POINTS * 2}
              </span>
            </span>
          </div>

          {locked ? (
            <p className="text-center text-xs text-muted-foreground">
              Kickoff has passed — predictions are locked in. Good luck!
            </p>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setMode("stepper");
                setStep(0);
                setDirection(-1);
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit predictions
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const type = STEP_ORDER[step];
  const isLockStep = lockType === type;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{STEP_TITLE[type]}</CardTitle>
        <div className="flex items-center gap-1.5">
          {STEP_ORDER.map((t, i) => (
            <span
              key={t}
              className={cn(
                "h-1.5 w-5 rounded-full transition-colors",
                i === step
                  ? "bg-primary"
                  : predictions.has(t)
                    ? "bg-primary/40"
                    : "bg-muted",
              )}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative min-h-32 overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={type}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeOut" }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.4}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60 && !submitting) void commitStep();
                else if (info.offset.x > 60 && step > 0) goBack();
              }}
              className="flex cursor-grab flex-col gap-3 active:cursor-grabbing"
            >
              {type === "outcome" && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    {(["home_win", "draw", "away_win"] as Outcome[]).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setOutcome(o)}
                        className={cn(
                          "flex-1 rounded-md border px-3 py-3 text-sm font-medium transition-colors",
                          outcome === o
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {o === "home_win" ? homeTeam : o === "away_win" ? awayTeam : "Draw"}
                      </button>
                    ))}
                  </div>
                  {consensus &&
                    (() => {
                      const total = consensus.home_win + consensus.draw + consensus.away_win;
                      if (total === 0) {
                        return (
                          <p className="text-center text-[11px] text-muted-foreground">
                            Be the first to predict this match
                          </p>
                        );
                      }
                      const mine =
                        outcome === "home_win"
                          ? consensus.home_win
                          : outcome === "draw"
                            ? consensus.draw
                            : consensus.away_win;
                      const share = pct(mine, total);
                      return (
                        <p className="text-center text-[11px] text-muted-foreground">
                          {share}% of {total} player{total === 1 ? "" : "s"} agree with you
                          {share < 30 && " — 🔥 bold pick"}
                        </p>
                      );
                    })()}
                </div>
              )}

              {type === "scoreline" && (
                <div className="flex items-center justify-center gap-3 py-2">
                  <span className="w-16 truncate text-right text-xs text-muted-foreground">
                    {homeTeam}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={guessHome}
                    onChange={(e) => setGuessHome(Number(e.target.value))}
                    className="h-12 w-16 rounded-md border border-border bg-background text-center text-lg font-semibold"
                  />
                  <span className="text-muted-foreground">–</span>
                  <input
                    type="number"
                    min={0}
                    value={guessAway}
                    onChange={(e) => setGuessAway(Number(e.target.value))}
                    className="h-12 w-16 rounded-md border border-border bg-background text-center text-lg font-semibold"
                  />
                  <span className="w-16 truncate text-xs text-muted-foreground">
                    {awayTeam}
                  </span>
                </div>
              )}

              {type === "key_moment" && (
                <div className="flex flex-col gap-2">
                  <select
                    value={moment}
                    onChange={(e) => setMoment(e.target.value as KeyMomentType)}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {KEY_MOMENTS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setGuessOccurs(v)}
                        className={cn(
                          "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                          guessOccurs === v
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {v ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {type === "player_performance" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    TxLINE player ID who will score
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={playerId}
                    onChange={(e) => setPlayerId(Number(e.target.value))}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={() => setLockType(isLockStep ? null : type)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors",
            isLockStep
              ? "border-accent bg-accent/15 text-accent-foreground"
              : "border-dashed border-border text-muted-foreground hover:border-accent/50 hover:text-accent",
          )}
        >
          {isLockStep ? (
            <Star className="h-3.5 w-3.5 fill-accent text-accent" />
          ) : (
            <Star className="h-3.5 w-3.5" />
          )}
          {isLockStep
            ? `This is your Lock of the Day — 2× points if right`
            : "Make this your Lock of the Day (2×)"}
        </button>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button variant="ghost" size="icon" onClick={goBack} disabled={submitting}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" className="flex-1" onClick={advance} disabled={submitting}>
            Skip
          </Button>
          <Button className="flex-1" onClick={() => void commitStep()} disabled={submitting || locked}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : step === STEP_ORDER.length - 1 ? (
              <PartyPopper className="h-4 w-4" />
            ) : null}
            {step === STEP_ORDER.length - 1 ? "Finish" : "Next"}
          </Button>
        </div>
        <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
          {isLockStep && <Flame className="h-3 w-3 text-accent" />}
          Swipe or use the buttons —{" "}
          {isLockStep ? `${POINTS[type] * 2} pts (locked 2×)` : `${POINTS[type]} pts`} up for
          grabs on this one
        </p>
      </CardContent>
    </Card>
  );
}
