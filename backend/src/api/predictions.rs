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

    sqlx::query!(
        r#"
        INSERT INTO predictions (user_id, match_id, prediction_type, payload)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, match_id, prediction_type)
        DO UPDATE SET payload = EXCLUDED.payload, submitted_at = now()
        "#,
        user_id,
        req.match_id,
        prediction_type,
        payload,
    )
    .execute(&state.pool)
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
        SELECT id, match_id, prediction_type, payload, submitted_at
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
