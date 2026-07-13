use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use crate::AppState;
use crate::models::MatchRow;

pub async fn list_matches(
    State(state): State<AppState>,
) -> Result<Json<Vec<MatchRow>>, StatusCode> {
    let matches = sqlx::query_as!(
        MatchRow,
        r#"
        SELECT id, txline_match_id, home_team, away_team, kickoff_at, status
        FROM matches
        ORDER BY kickoff_at ASC
        "#
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(matches))
}
