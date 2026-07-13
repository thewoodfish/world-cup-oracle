use chrono::{Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const SESSION_TTL_HOURS: i64 = 24;

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("invalid wallet pubkey encoding")]
    InvalidPubkey,
    #[error("invalid signature encoding")]
    InvalidSignatureEncoding,
    #[error("signature does not match message/pubkey")]
    SignatureMismatch,
    #[error("invalid or expired session token")]
    InvalidSession,
}

/// Verifies a Solana wallet's signature over an arbitrary message. Solana keypairs are
/// ed25519, so this is a direct signature check — no on-chain lookup needed (CLAUDE.md
/// Section 4: "keep it to a signed message + persistent profile row in Postgres").
pub fn verify_wallet_signature(
    wallet_pubkey_b58: &str,
    message: &[u8],
    signature_b64: &str,
) -> Result<(), AuthError> {
    let pubkey_bytes = bs58::decode(wallet_pubkey_b58)
        .into_vec()
        .map_err(|_| AuthError::InvalidPubkey)?;
    let pubkey_bytes: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| AuthError::InvalidPubkey)?;
    let verifying_key =
        VerifyingKey::from_bytes(&pubkey_bytes).map_err(|_| AuthError::InvalidPubkey)?;

    let sig_bytes = base64_decode(signature_b64).ok_or(AuthError::InvalidSignatureEncoding)?;
    let sig_bytes: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| AuthError::InvalidSignatureEncoding)?;
    let signature = Signature::from_bytes(&sig_bytes);

    verifying_key
        .verify(message, &signature)
        .map_err(|_| AuthError::SignatureMismatch)
}

fn base64_decode(s: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(s).ok()
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionClaims {
    sub: Uuid,
    exp: i64,
}

pub fn issue_session_token(user_id: Uuid, jwt_secret: &str) -> Result<String, AuthError> {
    let claims = SessionClaims {
        sub: user_id,
        exp: (Utc::now() + Duration::hours(SESSION_TTL_HOURS)).timestamp(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(|_| AuthError::InvalidSession)
}

pub fn verify_session_token(token: &str, jwt_secret: &str) -> Result<Uuid, AuthError> {
    let data = decode::<SessionClaims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AuthError::InvalidSession)?;
    Ok(data.claims.sub)
}
