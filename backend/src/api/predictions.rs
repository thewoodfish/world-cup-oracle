use axum::Json;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

use crate::AppState;
use crate::domain::predictions::Prediction;
use crate::models::PredictionRow;

use super::authenticate;

#[derive(Debug, Deserialize)]
pub struct SubmitPredictionRequest {
    match_id: Uuid,
    /// "Lock of the Day" (CLAUDE.md's swipeable-flow design pass): the one pick per match
    /// the user stakes double points on. At most one row per (user_id, match_id) can carry
    /// this — enforced by `idx_predictions_one_lock_per_match` — so setting it here first
    /// clears any prior lock for this match.
    #[serde(default)]
    is_lock: bool,
    #[serde(flatten)]
    prediction: Prediction,
}

pub async fn submit_prediction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<SubmitPredictionRequest>,
) -> Result<StatusCode, StatusCode> {
    let user_id = authenticate(&headers, &state.config.session_jwt_secret)?;

    let kickoff_at =
        sqlx::query_scalar!("SELECT kickoff_at FROM matches WHERE id = $1", req.match_id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;

    if Utc::now() >= kickoff_at {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let payload =
        serde_json::to_value(&req.prediction).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let prediction_type = req.prediction.type_key();

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if req.is_lock {
        sqlx::query!(
            r#"
            UPDATE predictions SET is_lock = false
            WHERE user_id = $1 AND match_id = $2 AND is_lock
            "#,
            user_id,
            req.match_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    sqlx::query!(
        r#"
        INSERT INTO predictions (user_id, match_id, prediction_type, payload, is_lock)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, match_id, prediction_type)
        DO UPDATE SET payload = EXCLUDED.payload, is_lock = EXCLUDED.is_lock, submitted_at = now()
        "#,
        user_id,
        req.match_id,
        prediction_type,
        payload,
        req.is_lock,
    )
    .execute(&mut *tx)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tx.commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct MyPredictionsQuery {
    match_id: Uuid,
}

pub async fn my_predictions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<MyPredictionsQuery>,
) -> Result<Json<Vec<PredictionRow>>, StatusCode> {
    let user_id = authenticate(&headers, &state.config.session_jwt_secret)?;

    let rows = sqlx::query_as!(
        PredictionRow,
        r#"
        SELECT id, match_id, prediction_type, payload, submitted_at, is_lock
        FROM predictions
        WHERE user_id = $1 AND match_id = $2
        "#,
        user_id,
        q.match_id,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(rows))
}

#[derive(Debug, Deserialize)]
pub struct ConsensusQuery {
    match_id: Uuid,
}

#[derive(Debug, serde::Serialize, Default)]
pub struct OutcomeConsensus {
    home_win: i64,
    draw: i64,
    away_win: i64,
}

/// Crowd consensus on the outcome pick — "62% picked France" — computed live from real
/// submitted predictions, not a fabricated stat. No auth required: it's an aggregate
/// count, not per-user data.
pub async fn outcome_consensus(
    State(state): State<AppState>,
    Query(q): Query<ConsensusQuery>,
) -> Result<Json<OutcomeConsensus>, StatusCode> {
    let rows = sqlx::query!(
        r#"
        SELECT payload ->> 'guess' as "guess!", count(*) as "count!"
        FROM predictions
        WHERE match_id = $1 AND prediction_type = 'outcome'
        GROUP BY payload ->> 'guess'
        "#,
        q.match_id,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut consensus = OutcomeConsensus::default();
    for row in rows {
        match row.guess.as_str() {
            "home_win" => consensus.home_win = row.count,
            "draw" => consensus.draw = row.count,
            "away_win" => consensus.away_win = row.count,
            _ => {}
        }
    }

    Ok(Json(consensus))
}
