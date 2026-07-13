use serde::{Deserialize, Serialize};

use crate::domain::scorable::{MatchEvent, Scorable, ScoreResult, find_full_time};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    HomeWin,
    Draw,
    AwayWin,
}

impl Outcome {
    fn from_score(home: u8, away: u8) -> Self {
        match home.cmp(&away) {
            std::cmp::Ordering::Greater => Outcome::HomeWin,
            std::cmp::Ordering::Equal => Outcome::Draw,
            std::cmp::Ordering::Less => Outcome::AwayWin,
        }
    }
}

const POINTS_CORRECT: i32 = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutcomePrediction {
    pub guess: Outcome,
}

impl Scorable for OutcomePrediction {
    fn score(&self, events: &[MatchEvent]) -> ScoreResult {
        match find_full_time(events) {
            Some((home, away)) => {
                let actual = Outcome::from_score(home, away);
                let correct = actual == self.guess;
                ScoreResult {
                    correct,
                    points: if correct { POINTS_CORRECT } else { 0 },
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
    fn scores_correct_home_win() {
        let events = [MatchEvent::FullTime {
            home_score: 2,
            away_score: 1,
        }];
        let prediction = OutcomePrediction {
            guess: Outcome::HomeWin,
        };
        assert_eq!(
            prediction.score(&events),
            ScoreResult {
                correct: true,
                points: POINTS_CORRECT
            }
        );
    }

    #[test]
    fn scores_incorrect_guess() {
        let events = [MatchEvent::FullTime {
            home_score: 2,
            away_score: 1,
        }];
        let prediction = OutcomePrediction {
            guess: Outcome::Draw,
        };
        assert_eq!(prediction.score(&events), ScoreResult::default());
    }

    #[test]
    fn no_result_yet_scores_zero() {
        let prediction = OutcomePrediction {
            guess: Outcome::HomeWin,
        };
        assert_eq!(prediction.score(&[]), ScoreResult::default());
    }
}
