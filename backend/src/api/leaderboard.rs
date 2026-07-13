use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use crate::AppState;
use crate::models::LeaderboardRow;

const LEADERBOARD_LIMIT: i64 = 50;

pub async fn global(
    State(state): State<AppState>,
) -> Result<Json<Vec<LeaderboardRow>>, StatusCode> {
    let rows = sqlx::query_as!(
        LeaderboardRow,
        r#"
        SELECT u.id as user_id, u.display_name, SUM(s.points)::bigint as total
        FROM scores s
        JOIN users u ON u.id = s.user_id
        GROUP BY u.id, u.display_name
        ORDER BY total DESC NULLS LAST
        LIMIT $1
        "#,
        LEADERBOARD_LIMIT,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(rows))
}

pub async fn for_match(
    State(state): State<AppState>,
    Path(match_id): Path<Uuid>,
) -> Result<Json<Vec<LeaderboardRow>>, StatusCode> {
    let rows = sqlx::query_as!(
        LeaderboardRow,
        r#"
        SELECT u.id as user_id, u.display_name, SUM(s.points)::bigint as total
        FROM scores s
        JOIN users u ON u.id = s.user_id
        WHERE s.match_id = $1
        GROUP BY u.id, u.display_name
        ORDER BY total DESC NULLS LAST
        LIMIT $2
        "#,
        match_id,
        LEADERBOARD_LIMIT,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(rows))
}
