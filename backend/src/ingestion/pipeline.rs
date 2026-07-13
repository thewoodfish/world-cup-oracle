use sqlx::PgPool;
use uuid::Uuid;

use crate::events::{EventBus, WsMessage};
use crate::scoring::rescore_match;

use super::soccer::{RawSoccerEvent, map_soccer_event};

/// Shared by `replay` (reading a recorded fixture) and `live` (reading the real TxLINE
/// SSE stream) — both just need "take one raw event, persist it, broadcast it, rescore."
/// Per CLAUDE.md Section 3: one function, not a parallel code path per source.
pub async fn ingest_raw_event(
    raw_json: &str,
    match_id: Uuid,
    pool: &PgPool,
    bus: &EventBus,
) -> anyhow::Result<()> {
    let raw_event: RawSoccerEvent = serde_json::from_str(raw_json)?;
    let Some(match_event) = map_soccer_event(&raw_event) else {
        return Ok(());
    };

    let payload = serde_json::to_value(&match_event)?;
    let event_type = payload
        .get("event_type")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    sqlx::query!(
        r#"
        INSERT INTO match_events (match_id, event_type, payload)
        VALUES ($1, $2, $3)
        "#,
        match_id,
        event_type,
        payload,
    )
    .execute(pool)
    .await?;

    bus.publish(
        match_id,
        WsMessage::MatchEvent {
            match_id,
            event_type,
            payload,
        },
    );

    rescore_match(pool, bus, match_id).await?;

    Ok(())
}
