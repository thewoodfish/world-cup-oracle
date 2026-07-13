mod auth_routes;
mod leaderboard;
mod matches;
mod predictions;
mod profile;

use axum::Router;
use axum::routing::{get, post};

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/wallet", post(auth_routes::wallet_login))
        .route("/matches", get(matches::list_matches))
        .route("/predictions", post(predictions::submit_prediction))
        .route("/predictions/mine", get(predictions::my_predictions))
        .route("/leaderboard/global", get(leaderboard::global))
        .route("/leaderboard/match/{match_id}", get(leaderboard::for_match))
        .route("/users/me/profile", get(profile::me))
}

/// Extracts and verifies the bearer session token from the `Authorization` header,
/// returning the authenticated user's id.
pub(crate) fn authenticate(
    headers: &axum::http::HeaderMap,
    jwt_secret: &str,
) -> Result<uuid::Uuid, axum::http::StatusCode> {
    let header = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(axum::http::StatusCode::UNAUTHORIZED)?;
    let token = header
        .strip_prefix("Bearer ")
        .ok_or(axum::http::StatusCode::UNAUTHORIZED)?;
    crate::auth::verify_session_token(token, jwt_secret)
        .map_err(|_| axum::http::StatusCode::UNAUTHORIZED)
}
