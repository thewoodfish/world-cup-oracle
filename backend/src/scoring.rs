use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::achievements::{self, AchievementContext};
use crate::domain::predictions::Prediction;
use crate::domain::scorable::{MatchEvent, Scorable};
use crate::events::{EventBus, LeaderboardEntry, WsMessage};

/// The "Scoring Engine" + "Achievement Engine" boxes from the CLAUDE.md architecture
/// diagram: re-derives every prediction's score from the match's full event history so
/// far, persists deltas, and evaluates achievement rules. Called after every new
/// `match_event` (from replay today, from live SSE once TxLINE activation is wired).
///
/// Recomputes from scratch each time rather than applying incremental deltas — simplest
/// correct thing under the hackathon deadline; matches count in the hundreds per match,
/// not a performance concern at this scale.
pub async fn rescore_match(pool: &PgPool, bus: &EventBus, match_id: Uuid) -> anyhow::Result<()> {
    let events = load_match_events(pool, match_id).await?;

    let predictions = sqlx::query!(
        r#"
        SELECT user_id, prediction_type, payload
        FROM predictions
        WHERE match_id = $1
        "#,
        match_id,
    )
    .fetch_all(pool)
    .await?;

    for row in &predictions {
        let Ok(prediction) = serde_json::from_value::<Prediction>(row.payload.clone()) else {
            continue;
        };
        let result = prediction.score(&events);

        sqlx::query!(
            r#"
            INSERT INTO scores (user_id, match_id, prediction_type, points)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, match_id, prediction_type)
            DO UPDATE SET points = EXCLUDED.points, last_updated_at = now()
            "#,
            row.user_id,
            match_id,
            row.prediction_type,
            result.points,
        )
        .execute(pool)
        .await?;

        let total = sqlx::query_scalar!(
            r#"SELECT COALESCE(SUM(points), 0)::int as "total!" FROM scores WHERE user_id = $1 AND match_id = $2"#,
            row.user_id,
            match_id,
        )
        .fetch_one(pool)
        .await?;

        bus.publish(
            match_id,
            WsMessage::ScoreUpdate {
                user_id: row.user_id,
                match_id,
                prediction_type: row.prediction_type.clone(),
                points: result.points,
                total,
            },
        );
    }

    evaluate_achievements(pool, bus, match_id).await?;
    publish_leaderboard(pool, bus, match_id).await?;

    Ok(())
}

async fn load_match_events(pool: &PgPool, match_id: Uuid) -> anyhow::Result<Vec<MatchEvent>> {
    let rows = sqlx::query!(
        "SELECT payload FROM match_events WHERE match_id = $1 ORDER BY occurred_at ASC",
        match_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .filter_map(|r| serde_json::from_value(r.payload).ok())
        .collect())
}

/// Best-effort achievement evaluation. `picked_correct_underdog_outcome` is left `false`
/// pending the still-open pre-match-odds question in CLAUDE.md Section 5 — wire it up
/// once `/documentation/odds/odds-coverage` confirms the pre-match snapshot mechanism.
async fn evaluate_achievements(
    pool: &PgPool,
    bus: &EventBus,
    match_id: Uuid,
) -> anyhow::Result<()> {
    let users = sqlx::query_scalar!(
        "SELECT DISTINCT user_id FROM predictions WHERE match_id = $1",
        match_id,
    )
    .fetch_all(pool)
    .await?;

    for user_id in users {
        let already_unlocked = sqlx::query_scalar!(
            "SELECT achievement_key FROM achievements WHERE user_id = $1",
            user_id,
        )
        .fetch_all(pool)
        .await?;

        let user_scores = sqlx::query!(
            "SELECT prediction_type, points FROM scores WHERE user_id = $1 AND match_id = $2",
            user_id,
            match_id,
        )
        .fetch_all(pool)
        .await?;
        let has_predictions = !user_scores.is_empty();
        let all_correct = has_predictions && user_scores.iter().all(|s| s.points > 0);
        let outcome_correct = user_scores
            .iter()
            .any(|s| s.prediction_type == "outcome" && s.points > 0);

        let distinct_matches = sqlx::query_scalar!(
            r#"SELECT COUNT(DISTINCT match_id)::int as "count!" FROM predictions WHERE user_id = $1"#,
            user_id,
        )
        .fetch_one(pool)
        .await?;

        let streak = consecutive_correct_outcome_streak(pool, user_id).await?;

        let ctx = AchievementContext {
            all_predictions_correct_this_match: all_correct,
            correctly_predicted_first_goal_or_outcome: outcome_correct && distinct_matches == 1,
            is_users_first_tournament_match: distinct_matches == 1,
            consecutive_correct_outcome_streak: streak,
            picked_correct_underdog_outcome: false,
        };

        for key in achievements::evaluate(&ctx) {
            if already_unlocked.iter().any(|k| k == key) {
                continue;
            }
            sqlx::query!(
                r#"
                INSERT INTO achievements (user_id, achievement_key)
                VALUES ($1, $2)
                ON CONFLICT (user_id, achievement_key) DO NOTHING
                "#,
                user_id,
                key,
            )
            .execute(pool)
            .await?;

            bus.publish(
                match_id,
                WsMessage::AchievementUnlocked {
                    user_id,
                    achievement_key: key.to_string(),
                },
            );
        }
    }

    Ok(())
}

async fn consecutive_correct_outcome_streak(pool: &PgPool, user_id: Uuid) -> anyhow::Result<u32> {
    let rows = sqlx::query!(
        r#"
        SELECT s.points
        FROM scores s
        JOIN matches m ON m.id = s.match_id
        WHERE s.user_id = $1 AND s.prediction_type = 'outcome'
        ORDER BY m.kickoff_at DESC
        "#,
        user_id,
    )
    .fetch_all(pool)
    .await?;

    let mut streak = 0u32;
    for row in rows {
        if row.points > 0 {
            streak += 1;
        } else {
            break;
        }
    }
    Ok(streak)
}

async fn publish_leaderboard(pool: &PgPool, bus: &EventBus, match_id: Uuid) -> anyhow::Result<()> {
    let rows = sqlx::query!(
        r#"
        SELECT u.id as user_id, u.display_name, SUM(s.points)::int as "total!"
        FROM scores s
        JOIN users u ON u.id = s.user_id
        WHERE s.match_id = $1
        GROUP BY u.id, u.display_name
        ORDER BY "total!" DESC
        LIMIT 50
        "#,
        match_id,
    )
    .fetch_all(pool)
    .await?;

    let top = rows
        .into_iter()
        .map(|r| LeaderboardEntry {
            user_id: r.user_id,
            display_name: r.display_name,
            total: r.total,
        })
        .collect();

    bus.publish(match_id, WsMessage::LeaderboardUpdate { match_id, top });
    Ok(())
}
