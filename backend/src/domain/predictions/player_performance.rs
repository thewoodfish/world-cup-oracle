use serde::{Deserialize, Serialize};

use crate::domain::scorable::{MatchEvent, Scorable, ScoreResult};

const POINTS_CORRECT: i32 = 20;

/// v1 scope confirmed against the TxLINE OpenAPI spec (CLAUDE.md Section 5): goal events
/// carry `PlayerId`, so "will Player X score" is directly scoreable. Finer-grained stats
/// (shots on target, rating thresholds) are a stretch goal, not implemented here.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerPerformancePrediction {
    pub player_id: i32,
}

impl Scorable for PlayerPerformancePrediction {
    fn score(&self, events: &[MatchEvent]) -> ScoreResult {
        let scored = events.iter().any(|e| {
            matches!(e, MatchEvent::Goal { scorer_player_id: Some(id), .. } if *id == self.player_id)
        });
        ScoreResult {
            correct: scored,
            points: if scored { POINTS_CORRECT } else { 0 },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn player_scores_awards_points() {
        let events = [MatchEvent::Goal {
            participant: 1,
            scorer_player_id: Some(99),
            goal_type: None,
        }];
        let prediction = PlayerPerformancePrediction { player_id: 99 };
        assert_eq!(
            prediction.score(&events),
            ScoreResult {
                correct: true,
                points: POINTS_CORRECT
            }
        );
    }

    #[test]
    fn different_scorer_awards_zero() {
        let events = [MatchEvent::Goal {
            participant: 1,
            scorer_player_id: Some(1),
            goal_type: None,
        }];
        let prediction = PlayerPerformancePrediction { player_id: 99 };
        assert_eq!(prediction.score(&events), ScoreResult::default());
    }
}
