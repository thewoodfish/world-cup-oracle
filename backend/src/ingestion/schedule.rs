use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use super::{Fixture, TxLineClient, WORLD_CUP_COMPETITION_ID};

/// Pulls the real World Cup schedule (CLAUDE.md Section 5, item 4 — confirmed live on
/// 2026-07-13: the semi-finals are real, upcoming fixtures, not just the already-played
/// quarter-finals) into `matches`. Safe to call repeatedly — upserts on the TxLINE
/// fixture id, so re-running just refreshes kickoff times rather than duplicating rows.
pub async fn sync_world_cup_matches(
    pool: &PgPool,
    client: &TxLineClient,
    jwt: &str,
    api_token: &str,
) -> anyhow::Result<Vec<(Uuid, i64)>> {
    let fixtures = client
        .fetch_fixtures(jwt, api_token, WORLD_CUP_COMPETITION_ID)
        .await?;

    let mut synced = Vec::with_capacity(fixtures.len());
    for fixture in fixtures {
        let match_id = upsert_fixture(pool, &fixture).await?;
        synced.push((match_id, fixture.fixture_id));
    }
    Ok(synced)
}

async fn upsert_fixture(pool: &PgPool, fixture: &Fixture) -> anyhow::Result<Uuid> {
    let kickoff_at: DateTime<Utc> = DateTime::from_timestamp_millis(fixture.start_time_ms)
        .ok_or_else(|| anyhow::anyhow!("invalid StartTime for fixture {}", fixture.fixture_id))?;
    let txline_match_id = fixture.fixture_id.to_string();

    let match_id = sqlx::query_scalar!(
        r#"
        INSERT INTO matches (txline_match_id, home_team, away_team, kickoff_at, status)
        VALUES ($1, $2, $3, $4, 'scheduled')
        ON CONFLICT (txline_match_id) DO UPDATE SET
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            kickoff_at = EXCLUDED.kickoff_at
        RETURNING id
        "#,
        txline_match_id,
        fixture.participant1,
        fixture.participant2,
        kickoff_at,
    )
    .fetch_one(pool)
    .await?;

    Ok(match_id)
}
