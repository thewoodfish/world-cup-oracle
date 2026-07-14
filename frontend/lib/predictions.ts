import type { Prediction } from "./api";

export type PredictionType = Prediction["prediction_type"];

/** Mirrors the point values in the Rust `Scorable` impls (backend/src/domain/predictions). */
export const PREDICTION_POINTS: Record<PredictionType, number> = {
  outcome: 10,
  scoreline: 25,
  key_moment: 15,
  player_performance: 20,
};

export const PREDICTION_ORDER: PredictionType[] = [
  "outcome",
  "scoreline",
  "key_moment",
  "player_performance",
];

export const PREDICTION_LABEL: Record<PredictionType, string> = {
  outcome: "Outcome",
  scoreline: "Scoreline",
  key_moment: "Key moment",
  player_performance: "Player",
};

export const TOTAL_PREDICTION_POINTS = Object.values(PREDICTION_POINTS).reduce(
  (a, b) => a + b,
  0,
);
