use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use serde::Serialize;

use crate::AppState;
use crate::models::ProfileRow;

use super::authenticate;

#[derive(Debug, Serialize)]
pub struct ProfileResponse {
    #[serde(flatten)]
    user: ProfileRow,
    achievements: Vec<String>,
}

pub async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ProfileResponse>, StatusCode> {
    let user_id = authenticate(&headers, &state.config.session_jwt_secret)?;

    let user = sqlx::query_as!(
        ProfileRow,
        "SELECT id, wallet_pubkey, display_name, created_at FROM users WHERE id = $1",
        user_id,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let achievements = sqlx::query_scalar!(
        "SELECT achievement_key FROM achievements WHERE user_id = $1",
        user_id,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ProfileResponse { user, achievements }))
}
