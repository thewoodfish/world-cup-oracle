use std::path::Path;
use std::time::Duration;

use sqlx::PgPool;
use uuid::Uuid;

use crate::events::EventBus;

use super::pipeline::ingest_raw_event;

/// Replaying a recorded fixture's event log is a first-class ingestion mode (CLAUDE.md
/// Section 5, item 4), not just a fallback — useful for demos and for backfilling the
/// completed quarter-finals, which are real historical data (see `soccer.rs`'s doc
/// comment for how the real payload shape was verified). Expects a plain JSON array of
/// raw event objects — the same shape TxLINE's `/api/scores/historical/{fixtureId}`
/// returns per-line (as SSE `data:` frames), just collected into an array.
pub async fn replay_fixture(
    path: &Path,
    match_id: Uuid,
    pool: &PgPool,
    bus: &EventBus,
    pace: Duration,
) -> anyhow::Result<()> {
    let raw = tokio::fs::read_to_string(path).await?;
    let events: Vec<serde_json::Value> = serde_json::from_str(&raw)?;

    for raw_event in events {
        ingest_raw_event(&raw_event.to_string(), match_id, pool, bus).await?;
        tokio::time::sleep(pace).await;
    }

    Ok(())
}
