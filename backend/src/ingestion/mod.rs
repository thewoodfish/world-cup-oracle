pub mod live;
pub mod pipeline;
pub mod replay;
pub mod schedule;
pub mod soccer;

use serde::Deserialize;
use thiserror::Error;

/// The World Cup 2026 competition, confirmed live via `/api/fixtures/snapshot` on
/// 2026-07-13 (returns the France v Spain / England v Argentina semi-finals under this
/// id — see CLAUDE.md Section 5, item 4).
pub const WORLD_CUP_COMPETITION_ID: i32 = 72;

#[derive(Debug, Error)]
pub enum IngestionError {
    #[error("txline request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("txline activation not yet implemented: {0}")]
    ActivationUnimplemented(&'static str),
}

#[derive(Debug, Deserialize)]
struct GuestSessionResponse {
    #[serde(alias = "jwt", alias = "token")]
    jwt: String,
}

/// Mirrors the real `Fixture` schema confirmed live via `/api/fixtures/snapshot` on
/// 2026-07-13 — PascalCase, matching the OpenAPI spec here (unlike the `Scores` stream
/// payload, which disagrees with its own spec — see `soccer.rs`).
#[derive(Debug, Clone, Deserialize)]
pub struct Fixture {
    #[serde(rename = "FixtureId")]
    pub fixture_id: i64,
    #[serde(rename = "Participant1")]
    pub participant1: String,
    #[serde(rename = "Participant2")]
    pub participant2: String,
    #[serde(rename = "StartTime")]
    pub start_time_ms: i64,
}

/// Talks to TxLINE per the auth flow resolved in CLAUDE.md Section 5: guest JWT first,
/// then an on-chain-signed activation step to get a real `X-Api-Token`.
pub struct TxLineClient {
    http: reqwest::Client,
    base_url: String,
}

impl TxLineClient {
    pub fn new(base_url: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url,
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// `POST /auth/guest/start` — real call, no on-chain step required for this stage.
    pub async fn authenticate_guest(&self) -> Result<String, IngestionError> {
        let resp = self
            .http
            .post(format!("{}/auth/guest/start", self.base_url))
            .send()
            .await?
            .error_for_status()?
            .json::<GuestSessionResponse>()
            .await?;
        Ok(resp.jwt)
    }

    /// `GET /api/fixtures/snapshot?competitionId=...` — confirmed live on 2026-07-13
    /// against `competitionId=72` (World Cup), returning the real semi-final fixtures.
    pub async fn fetch_fixtures(
        &self,
        jwt: &str,
        api_token: &str,
        competition_id: i32,
    ) -> Result<Vec<Fixture>, IngestionError> {
        let resp = self
            .http
            .get(format!("{}/api/fixtures/snapshot", self.base_url))
            .query(&[("competitionId", competition_id)])
            .bearer_auth(jwt)
            .header("X-Api-Token", api_token)
            .send()
            .await?
            .error_for_status()?
            .json::<Vec<Fixture>>()
            .await?;
        Ok(resp)
    }
}

/// The `POST /api/token/activate` step requires signing and submitting a Solana
/// transaction (subscription purchase) — see CLAUDE.md Section 5, item 3. That's a
/// devnet Anchor program call (PDA derivation, Token-2022 ATA, `subscribe` instruction),
/// not something worth hand-rolling against `solana-sdk` under hackathon time pressure
/// when TxLINE ships a proven TS reference implementation. Instead it's provisioned
/// out-of-band by `backend/ops/txline-activate` (a one-time/renew-on-expiry script, run
/// manually — matches CLAUDE.md's "not per-request" guidance) and handed to the running
/// server via `TXLINE_API_KEY`. This trait seam just picks that up; swap in a different
/// `ActivationStrategy` if the provisioning step ever moves in-process.
#[async_trait::async_trait]
pub trait ActivationStrategy: Send + Sync {
    async fn activate(&self, guest_jwt: &str) -> Result<String, IngestionError>;
}

/// Reads the token produced by `backend/ops/txline-activate/activate.js` out of config.
pub struct PreProvisionedActivation {
    pub api_key: Option<String>,
}

#[async_trait::async_trait]
impl ActivationStrategy for PreProvisionedActivation {
    async fn activate(&self, _guest_jwt: &str) -> Result<String, IngestionError> {
        self.api_key
            .clone()
            .ok_or(IngestionError::ActivationUnimplemented(
                "TXLINE_API_KEY is not set — run `node backend/ops/txline-activate/activate.js` \
             with a devnet-funded keypair once, then put the resulting token in .env",
            ))
    }
}
