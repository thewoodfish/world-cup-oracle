use std::time::Duration;

use futures_util::StreamExt;
use reqwest_eventsource::{Event, EventSource};
use sqlx::PgPool;
use uuid::Uuid;

use crate::events::EventBus;

use super::TxLineClient;
use super::pipeline::ingest_raw_event;

/// How long to keep a single SSE connection + guest JWT before tearing it down and
/// reconnecting with a fresh one. `reqwest-eventsource`'s built-in auto-retry (per the
/// W3C EventSource spec) reuses the *same* request on transient failures, so it can't
/// refresh an expired JWT on its own — this bounds how stale that JWT is allowed to get.
/// TxLINE doesn't document a guest JWT TTL, so this is a conservative guess, not a
/// confirmed value.
const JWT_REFRESH_INTERVAL: Duration = Duration::from_secs(20 * 60);

/// Consumes the real TxLINE live-scores SSE stream for one fixture (CLAUDE.md Section 5,
/// item 2) and feeds it through the same `ingest_raw_event` pipeline `replay` uses.
/// Long-running — intended to be spawned as its own task per live/upcoming match and to
/// run for the lifetime of that match. Errors are logged and retried rather than
/// propagated, per CLAUDE.md Section 13 ("degrade gracefully... rather than crashing").
pub async fn stream_fixture(
    client: &TxLineClient,
    fixture_id: i64,
    match_id: Uuid,
    pool: PgPool,
    bus: EventBus,
) {
    loop {
        let jwt = match client.authenticate_guest().await {
            Ok(jwt) => jwt,
            Err(err) => {
                tracing::warn!(
                    ?err,
                    fixture_id,
                    "failed to acquire guest JWT for live stream, retrying in 10s"
                );
                tokio::time::sleep(Duration::from_secs(10)).await;
                continue;
            }
        };

        let api_token = match std::env::var("TXLINE_API_KEY") {
            Ok(token) if !token.is_empty() => token,
            _ => {
                tracing::warn!(
                    fixture_id,
                    "TXLINE_API_KEY not set, cannot open live stream"
                );
                return;
            }
        };

        let request = reqwest::Client::new()
            .get(format!("{}/api/scores/stream", client.base_url()))
            .query(&[("fixtureId", fixture_id)])
            .bearer_auth(&jwt)
            .header("X-Api-Token", &api_token)
            .header("Accept-Encoding", "identity");

        let mut source = match EventSource::new(request) {
            Ok(source) => source,
            Err(err) => {
                tracing::warn!(
                    ?err,
                    fixture_id,
                    "could not build SSE request, retrying in 10s"
                );
                tokio::time::sleep(Duration::from_secs(10)).await;
                continue;
            }
        };

        tracing::info!(fixture_id, %match_id, "opening live TxLINE scores stream");
        let deadline = tokio::time::Instant::now() + JWT_REFRESH_INTERVAL;

        loop {
            let next = tokio::time::timeout_at(deadline, source.next()).await;
            let Ok(Some(event)) = next else {
                // Either the refresh deadline elapsed, or the stream ended — reconnect
                // with a fresh JWT either way.
                break;
            };

            match event {
                Ok(Event::Open) => tracing::info!(fixture_id, "live stream connected"),
                Ok(Event::Message(msg)) => {
                    if msg.event == "heartbeat" {
                        continue;
                    }
                    if let Err(err) = ingest_raw_event(&msg.data, match_id, &pool, &bus).await {
                        tracing::warn!(?err, fixture_id, data = %msg.data, "failed to ingest live event");
                    }
                }
                Err(err) => {
                    tracing::warn!(?err, fixture_id, "live stream error, will reconnect");
                    break;
                }
            }
        }

        source.close();
    }
}
