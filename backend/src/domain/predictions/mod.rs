pub mod key_moment;
pub mod outcome;
pub mod player_performance;
pub mod scoreline;

use serde::{Deserialize, Serialize};

use crate::domain::scorable::{MatchEvent, Scorable, ScoreResult};
use key_moment::KeyMomentPrediction;
use outcome::OutcomePrediction;
use player_performance::PlayerPerformancePrediction;
use scoreline::ScorelinePrediction;

/// The `payload` JSONB column deserializes into one of these, tagged by the
/// `prediction_type` column (CLAUDE.md Section 6).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "prediction_type", rename_all = "snake_case")]
pub enum Prediction {
    Outcome(OutcomePrediction),
    Scoreline(ScorelinePrediction),
    KeyMoment(KeyMomentPrediction),
    PlayerPerformance(PlayerPerformancePrediction),
}

impl Prediction {
    /// Matches the `#[serde(tag = "prediction_type", rename_all = "snake_case")]` values
    /// above — kept in sync deliberately rather than deriving via reflection, since this
    /// enum only grows one variant at a time (CLAUDE.md Section 3).
    pub fn type_key(&self) -> &'static str {
        match self {
            Prediction::Outcome(_) => "outcome",
            Prediction::Scoreline(_) => "scoreline",
            Prediction::KeyMoment(_) => "key_moment",
            Prediction::PlayerPerformance(_) => "player_performance",
        }
    }
}

impl Scorable for Prediction {
    fn score(&self, events: &[MatchEvent]) -> ScoreResult {
        match self {
            Prediction::Outcome(p) => p.score(events),
            Prediction::Scoreline(p) => p.score(events),
            Prediction::KeyMoment(p) => p.score(events),
            Prediction::PlayerPerformance(p) => p.score(events),
        }
    }
}
