use serde::{Deserialize, Serialize};

use crate::domain::scorable::{CardKind, MatchEvent, Scorable, ScoreResult};

const POINTS_CORRECT: i32 = 15;

/// v1 keeps to 2-3 concrete, TxLINE-verifiable moment types per CLAUDE.md Section 7 —
/// deliberately not a freeform moment picker.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KeyMomentType {
    RedCard,
    Penalty,
    ExtraTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyMomentPrediction {
    pub moment: KeyMomentType,
    /// The user's yes/no guess for whether this moment occurs.
    pub guess_occurs: bool,
}

fn moment_occurred(moment: KeyMomentType, events: &[MatchEvent]) -> bool {
    events.iter().any(|e| match (moment, e) {
        (KeyMomentType::RedCard, MatchEvent::Card { kind, .. }) => {
            matches!(kind, CardKind::Red | CardKind::SecondYellow)
        }
        (KeyMomentType::Penalty, MatchEvent::Penalty { .. }) => true,
        (KeyMomentType::ExtraTime, MatchEvent::ExtraTimeStarted) => true,
        _ => false,
    })
}

impl Scorable for KeyMomentPrediction {
    fn score(&self, events: &[MatchEvent]) -> ScoreResult {
        let occurred = moment_occurred(self.moment, events);
        let correct = occurred == self.guess_occurs;
        ScoreResult {
            correct,
            points: if correct { POINTS_CORRECT } else { 0 },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn red_card_predicted_and_occurs() {
        let events = [MatchEvent::Card {
            participant: 1,
            player_id: Some(42),
            kind: CardKind::Red,
        }];
        let prediction = KeyMomentPrediction {
            moment: KeyMomentType::RedCard,
            guess_occurs: true,
        };
        assert!(prediction.score(&events).correct);
    }

    #[test]
    fn penalty_predicted_but_no_penalty_occurs() {
        let prediction = KeyMomentPrediction {
            moment: KeyMomentType::Penalty,
            guess_occurs: true,
        };
        assert_eq!(prediction.score(&[]).points, 0);
    }

    #[test]
    fn correctly_predicts_no_extra_time() {
        let prediction = KeyMomentPrediction {
            moment: KeyMomentType::ExtraTime,
            guess_occurs: false,
        };
        assert!(prediction.score(&[]).correct);
    }
}
