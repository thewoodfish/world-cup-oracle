use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;
use crate::auth::{issue_session_token, verify_wallet_signature};

#[derive(Debug, Deserialize)]
pub struct WalletLoginRequest {
    wallet_pubkey: String,
    /// The exact message the wallet signed (e.g. a server-issued nonce challenge in a
    /// fuller implementation; a fixed app-defined string is enough for v1).
    message: String,
    /// Base64-encoded ed25519 signature produced by the wallet.
    signature: String,
}

#[derive(Debug, Serialize)]
pub struct WalletLoginResponse {
    token: String,
    user_id: Uuid,
}

pub async fn wallet_login(
    State(state): State<AppState>,
    Json(req): Json<WalletLoginRequest>,
) -> Result<Json<WalletLoginResponse>, StatusCode> {
    verify_wallet_signature(&req.wallet_pubkey, req.message.as_bytes(), &req.signature)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let user_id: Uuid = sqlx::query_scalar!(
        r#"
        INSERT INTO users (wallet_pubkey)
        VALUES ($1)
        ON CONFLICT (wallet_pubkey) DO UPDATE SET wallet_pubkey = EXCLUDED.wallet_pubkey
        RETURNING id
        "#,
        req.wallet_pubkey,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let token = issue_session_token(user_id, &state.config.session_jwt_secret)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(WalletLoginResponse { token, user_id }))
}
