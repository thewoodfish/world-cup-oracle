use serde::{Deserialize, Serialize};

/// Normalized internal representation of a TxLINE soccer score event, derived from the
/// confirmed `SoccerData` fields (see CLAUDE.md Section 5): `PlayerId` identifies the
/// scorer/carded player, `PlayerInId`/`PlayerOutId` identify substitutions, `Participant`
/// identifies the team.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "event_type", rename_all = "snake_case")]
pub enum MatchEvent {
    Goal {
        participant: i32,
        scorer_player_id: Option<i32>,
        goal_type: Option<String>,
    },
    Card {
        participant: i32,
        player_id: Option<i32>,
        kind: CardKind,
    },
    Substitution {
        participant: i32,
        player_in_id: i32,
        player_out_id: i32,
    },
    Shot {
        participant: i32,
        player_id: Option<i32>,
        outcome: ShotOutcome,
    },
    Penalty {
        participant: i32,
    },
    ExtraTimeStarted,
    FullTime {
        home_score: u8,
        away_score: u8,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CardKind {
    Yellow,
    SecondYellow,
    Red,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ShotOutcome {
    OnTarget,
    OffTarget,
    Woodwork,
    Blocked,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ScoreResult {
    pub correct: bool,
    pub points: i32,
}

/// One prediction type = one `Scorable` impl. Adding a new prediction type means writing
/// one new struct + impl here, per CLAUDE.md Section 3 — no changes to ingestion,
/// storage, or the websocket layer required.
pub trait Scorable {
    fn score(&self, events: &[MatchEvent]) -> ScoreResult;
}

pub(crate) fn find_full_time(events: &[MatchEvent]) -> Option<(u8, u8)> {
    events.iter().find_map(|e| match e {
        MatchEvent::FullTime {
            home_score,
            away_score,
        } => Some((*home_score, *away_score)),
        _ => None,
    })
}
