"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMyPredictions,
  submitPrediction,
  type KeyMomentType,
  type Outcome,
  type Prediction,
} from "@/lib/api";

const TYPES: { key: Prediction["prediction_type"]; label: string; points: string }[] = [
  { key: "outcome", label: "Outcome", points: "10 pts" },
  { key: "scoreline", label: "Scoreline", points: "25 pts" },
  { key: "key_moment", label: "Key Moment", points: "15 pts" },
  { key: "player_performance", label: "Player", points: "20 pts" },
];

const KEY_MOMENTS: { value: KeyMomentType; label: string }[] = [
  { value: "red_card", label: "Red card shown" },
  { value: "penalty", label: "Penalty awarded" },
  { value: "extra_time", label: "Goes to extra time" },
];

function segmentClass(active: boolean) {
  return cn(
    "flex flex-1 flex-col items-center gap-0.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-muted-foreground hover:text-foreground",
  );
}

export function PredictionForm({
  matchId,
  locked,
}: {
  matchId: string;
  locked: boolean;
}) {
  const { session, status: authStatus } = useAuth();
  const [activeType, setActiveType] =
    useState<Prediction["prediction_type"]>("outcome");
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [outcome, setOutcome] = useState<Outcome>("home_win");
  const [guessHome, setGuessHome] = useState(1);
  const [guessAway, setGuessAway] = useState(0);
  const [moment, setMoment] = useState<KeyMomentType>("penalty");
  const [guessOccurs, setGuessOccurs] = useState(true);
  const [playerId, setPlayerId] = useState<number>(0);

  useEffect(() => {
    if (!session) return;
    fetchMyPredictions(session.token, matchId)
      .then((rows) => setSubmitted(new Set(rows.map((r) => r.prediction_type))))
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

  async function handleSubmit() {
    if (!session) return;
    setSubmitting(true);
    setError(null);
    let prediction: Prediction;
    switch (activeType) {
      case "outcome":
        prediction = { prediction_type: "outcome", guess: outcome };
        break;
      case "scoreline":
        prediction = {
          prediction_type: "scoreline",
          guess_home: guessHome,
          guess_away: guessAway,
        };
        break;
      case "key_moment":
        prediction = {
          prediction_type: "key_moment",
          moment,
          guess_occurs: guessOccurs,
        };
        break;
      case "player_performance":
        prediction = { prediction_type: "player_performance", player_id: playerId };
        break;
    }
    try {
      await submitPrediction(session.token, matchId, prediction);
      setSubmitted((prev) => new Set(prev).add(activeType));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const alreadySubmitted = submitted.has(activeType);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your predictions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {TYPES.map((t) => (
            <button
              key={t.key}
              className={segmentClass(activeType === t.key)}
              onClick={() => setActiveType(t.key)}
              type="button"
            >
              <span className="flex items-center gap-1">
                {t.label}
                {submitted.has(t.key) && <CheckCircle2 className="h-3 w-3" />}
              </span>
              <span className="opacity-70">{t.points}</span>
            </button>
          ))}
        </div>

        {activeType === "outcome" && (
          <div className="flex gap-2">
            {(["home_win", "draw", "away_win"] as Outcome[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome(o)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  outcome === o
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {o === "home_win" ? "Home" : o === "draw" ? "Draw" : "Away"}
              </button>
            ))}
          </div>
        )}

        {activeType === "scoreline" && (
          <div className="flex items-center justify-center gap-3">
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
          </div>
        )}

        {activeType === "key_moment" && (
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

        {activeType === "player_performance" && (
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

        {error && <p className="text-xs text-danger">{error}</p>}

        <Button
          onClick={() => void handleSubmit()}
          disabled={submitting || locked}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {locked
            ? "Predictions closed"
            : alreadySubmitted
              ? "Update prediction"
              : "Submit prediction"}
        </Button>
      </CardContent>
    </Card>
  );
}
