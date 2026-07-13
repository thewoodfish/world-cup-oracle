use serde::{Deserialize, Serialize};

use crate::domain::scorable::{MatchEvent, Scorable, ScoreResult, find_full_time};

const POINTS_EXACT: i32 = 25;

/// v1: exact-score-only, per CLAUDE.md Section 7 ("exact-only if not [time]"). Partial
/// credit for correct-outcome-wrong-score is a stretch goal, not implemented here.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScorelinePrediction {
    pub guess_home: u8,
    pub guess_away: u8,
}

impl Scorable for ScorelinePrediction {
    fn score(&self, events: &[MatchEvent]) -> ScoreResult {
        match find_full_time(events) {
            Some((home, away)) => {
                let correct = home == self.guess_home && away == self.guess_away;
                ScoreResult {
                    correct,
                    points: if correct { POINTS_EXACT } else { 0 },
                }
            }
            None => ScoreResult::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_scores_full_points() {
        let events = [MatchEvent::FullTime {
            home_score: 3,
            away_score: 1,
        }];
        let prediction = ScorelinePrediction {
            guess_home: 3,
            guess_away: 1,
        };
        assert_eq!(
            prediction.score(&events),
            ScoreResult {
                correct: true,
                points: POINTS_EXACT
            }
        );
    }

    #[test]
    fn near_miss_scores_zero() {
        let events = [MatchEvent::FullTime {
            home_score: 3,
            away_score: 1,
        }];
        let prediction = ScorelinePrediction {
            guess_home: 2,
            guess_away: 1,
        };
        assert_eq!(prediction.score(&events), ScoreResult::default());
    }
}
