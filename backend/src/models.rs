use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MatchRow {
    pub id: Uuid,
    pub txline_match_id: String,
    pub home_team: String,
    pub away_team: String,
    pub kickoff_at: DateTime<Utc>,
    pub status: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PredictionRow {
    pub id: Uuid,
    pub match_id: Uuid,
    pub prediction_type: String,
    pub payload: serde_json::Value,
    pub submitted_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct LeaderboardRow {
    pub user_id: Uuid,
    pub display_name: Option<String>,
    pub total: Option<i64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProfileRow {
    pub id: Uuid,
    pub wallet_pubkey: String,
    pub display_name: Option<String>,
    pub created_at: DateTime<Utc>,
}
