export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

export type MatchStatus = "scheduled" | "live" | "finished";

export type MatchRow = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: MatchStatus | string;
};

export type Outcome = "home_win" | "draw" | "away_win";
export type KeyMomentType = "red_card" | "penalty" | "extra_time";

export type Prediction =
  | { prediction_type: "outcome"; guess: Outcome }
  | { prediction_type: "scoreline"; guess_home: number; guess_away: number }
  | { prediction_type: "key_moment"; moment: KeyMomentType; guess_occurs: boolean }
  | { prediction_type: "player_performance"; player_id: number };

export type LeaderboardRow = {
  user_id: string;
  display_name: string | null;
  total: number | string | null;
};

export type WsMessage =
  | {
      type: "score_update";
      user_id: string;
      match_id: string;
      prediction_type: string;
      points: number;
      total: number;
    }
  | { type: "leaderboard_update"; match_id: string; top: LeaderboardRow[] }
  | {
      type: "match_event";
      match_id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }
  | { type: "achievement_unlocked"; user_id: string; achievement_key: string };

export async function fetchMatches(): Promise<MatchRow[]> {
  const res = await fetch(`${API_BASE_URL}/matches`);
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json();
}

export async function submitPrediction(
  token: string,
  matchId: string,
  prediction: Prediction,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/predictions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ match_id: matchId, ...prediction }),
  });
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
}

export async function fetchMyPredictions(
  token: string,
  matchId: string,
): Promise<Array<{ prediction_type: string; payload: Prediction }>> {
  const res = await fetch(
    `${API_BASE_URL}/predictions/mine?match_id=${matchId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json();
}

export async function fetchMatchLeaderboard(
  matchId: string,
): Promise<LeaderboardRow[]> {
  const res = await fetch(`${API_BASE_URL}/leaderboard/match/${matchId}`);
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json();
}
