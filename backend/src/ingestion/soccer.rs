use serde::Deserialize;

use crate::domain::scorable::{CardKind, MatchEvent, ShotOutcome};

/// Mirrors the real TxLINE `Scores` SSE/historical payload shape — verified live against
/// the France v Morocco quarter-final (`fixtureId=18209181`) on 2026-07-13 via
/// `/api/scores/historical/{fixtureId}`, not just the OpenAPI spec (which turned out to
/// disagree with the wire format on casing and on where the final score lives). Confirmed
/// live:
/// - The envelope is PascalCase end to end (`FixtureId`, `Action`, `Data`, `Score`...),
///   not the camelCase `Scores` schema the OpenAPI doc describes.
/// - Every action streams in 2-3 stages sharing the same `Id`: an unconfirmed message,
///   a confirmed one, then sometimes a further confirmed one with richer `Data` (e.g. a
///   goal's `PlayerId` only appears on the last stage). We only act on `Confirmed` (or
///   its absence, for actions like `game_finalised` that don't carry the flag at all).
/// - The final score is **not** on `Data` — it's `Score.Participant{1,2}.Total.Goals`
///   (the key is entirely absent, not zero, when that side hasn't scored).
/// - `penalty`/`yellow_card`/`red_card` are their own top-level `Action`s, not solely
///   derived from a `var` review — though `var` with `Data.Type == "Penalty"` also
///   appears live and is kept as an additional path.
#[derive(Debug, Deserialize)]
pub struct RawSoccerEvent {
    #[serde(rename = "Action")]
    pub action: String,
    #[serde(rename = "Confirmed")]
    pub confirmed: Option<bool>,
    #[serde(rename = "Participant")]
    pub participant: Option<i32>,
    #[serde(rename = "Data")]
    pub data: Option<RawSoccerEventData>,
    #[serde(rename = "Score")]
    pub score: Option<RawScoreBlock>,
}

#[derive(Debug, Deserialize)]
pub struct RawSoccerEventData {
    #[serde(rename = "Outcome")]
    pub outcome: Option<String>,
    #[serde(rename = "Type")]
    pub var_type: Option<String>,
    #[serde(rename = "GoalType")]
    pub goal_type: Option<String>,
    #[serde(rename = "PlayerId")]
    pub player_id: Option<i32>,
    #[serde(rename = "PlayerInId")]
    pub player_in_id: Option<i32>,
    #[serde(rename = "PlayerOutId")]
    pub player_out_id: Option<i32>,
    #[serde(rename = "Participant")]
    pub participant: Option<i32>,
}

/// Both sides are optional: a live `corner` event was observed with `"Score":{}` —
/// entirely empty, neither participant present — so treat missing as "no data yet"
/// rather than a parse error.
#[derive(Debug, Deserialize)]
pub struct RawScoreBlock {
    #[serde(rename = "Participant1")]
    pub participant1: Option<RawScoreSide>,
    #[serde(rename = "Participant2")]
    pub participant2: Option<RawScoreSide>,
}

#[derive(Debug, Deserialize)]
pub struct RawScoreSide {
    #[serde(rename = "Total")]
    pub total: Option<RawScoreTotal>,
}

#[derive(Debug, Deserialize)]
pub struct RawScoreTotal {
    #[serde(rename = "Goals")]
    pub goals: Option<u8>,
}

pub fn map_soccer_event(raw: &RawSoccerEvent) -> Option<MatchEvent> {
    // Skip the initial "unconfirmed" stage of a multi-stage action; `Confirmed` is absent
    // entirely for some actions (e.g. `game_finalised`), which we still want to process.
    if raw.confirmed == Some(false) {
        return None;
    }

    let participant = raw
        .participant
        .or_else(|| raw.data.as_ref().and_then(|d| d.participant))
        .unwrap_or_default();

    match raw.action.as_str() {
        "goal" => Some(MatchEvent::Goal {
            participant,
            scorer_player_id: raw.data.as_ref().and_then(|d| d.player_id),
            goal_type: raw.data.as_ref().and_then(|d| d.goal_type.clone()),
        }),
        "yellow_card" => Some(MatchEvent::Card {
            participant,
            player_id: raw.data.as_ref().and_then(|d| d.player_id),
            kind: CardKind::Yellow,
        }),
        "red_card" => Some(MatchEvent::Card {
            participant,
            player_id: raw.data.as_ref().and_then(|d| d.player_id),
            kind: CardKind::Red,
        }),
        "penalty" => Some(MatchEvent::Penalty { participant }),
        "substitution" => {
            let data = raw.data.as_ref()?;
            Some(MatchEvent::Substitution {
                participant,
                player_in_id: data.player_in_id?,
                player_out_id: data.player_out_id?,
            })
        }
        "shot" => {
            let outcome = match raw.data.as_ref()?.outcome.as_deref()? {
                "OnTarget" => ShotOutcome::OnTarget,
                "OffTarget" => ShotOutcome::OffTarget,
                "Woodwork" => ShotOutcome::Woodwork,
                "Blocked" => ShotOutcome::Blocked,
                _ => return None,
            };
            Some(MatchEvent::Shot {
                participant,
                player_id: raw.data.as_ref().and_then(|d| d.player_id),
                outcome,
            })
        }
        "var" => match raw.data.as_ref()?.var_type.as_deref()? {
            "Penalty" => Some(MatchEvent::Penalty { participant }),
            "RedCard" | "SecondYellowCard" => Some(MatchEvent::Card {
                participant,
                player_id: raw.data.as_ref().and_then(|d| d.player_id),
                kind: CardKind::Red,
            }),
            _ => None,
        },
        "extra_time_started" => Some(MatchEvent::ExtraTimeStarted),
        "game_finalised" => {
            let score = raw.score.as_ref()?;
            Some(MatchEvent::FullTime {
                home_score: score
                    .participant1
                    .as_ref()
                    .and_then(|p| p.total.as_ref())
                    .and_then(|t| t.goals)
                    .unwrap_or(0),
                away_score: score
                    .participant2
                    .as_ref()
                    .and_then(|p| p.total.as_ref())
                    .and_then(|t| t.goals)
                    .unwrap_or(0),
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real payloads captured from `/api/scores/historical/18209181` (France 2-0 Morocco,
    /// 2026-07-09 World Cup quarter-final) on 2026-07-13.
    const GOAL_UNCONFIRMED: &str = r#"{"Action":"goal","Confirmed":false,"Participant":1}"#;
    const GOAL_CONFIRMED_NO_PLAYER: &str =
        r#"{"Action":"goal","Confirmed":true,"Participant":1,"Data":{"GoalType":"Shot"}}"#;
    const GOAL_CONFIRMED_WITH_PLAYER: &str = r#"{"Action":"goal","Confirmed":true,"Participant":1,
        "Data":{"GoalType":"Shot","PlayerId":453928}}"#;
    const SUBSTITUTION_ENRICHED: &str = r#"{"Action":"substitution","Confirmed":true,
        "Data":{"Participant":2,"PlayerInId":223984,"PlayerOutId":10092630}}"#;
    const YELLOW_CARD_ENRICHED: &str =
        r#"{"Action":"yellow_card","Confirmed":true,"Participant":2,"Data":{"PlayerId":415057}}"#;
    const PENALTY: &str = r#"{"Action":"penalty","Confirmed":true,"Participant":1,"Data":null}"#;
    const GAME_FINALISED: &str = r#"{"Action":"game_finalised",
        "Score":{"Participant1":{"Total":{"Goals":2}},"Participant2":{"Total":{"Corners":5}}}}"#;

    fn parse(s: &str) -> RawSoccerEvent {
        serde_json::from_str(s).unwrap()
    }

    #[test]
    fn unconfirmed_goal_is_skipped() {
        assert_eq!(map_soccer_event(&parse(GOAL_UNCONFIRMED)), None);
    }

    #[test]
    fn confirmed_goal_without_player_id_still_maps() {
        let event = map_soccer_event(&parse(GOAL_CONFIRMED_NO_PLAYER)).unwrap();
        assert_eq!(
            event,
            MatchEvent::Goal {
                participant: 1,
                scorer_player_id: None,
                goal_type: Some("Shot".to_string()),
            }
        );
    }

    #[test]
    fn enriched_goal_carries_player_id() {
        let event = map_soccer_event(&parse(GOAL_CONFIRMED_WITH_PLAYER)).unwrap();
        assert_eq!(
            event,
            MatchEvent::Goal {
                participant: 1,
                scorer_player_id: Some(453928),
                goal_type: Some("Shot".to_string()),
            }
        );
    }

    #[test]
    fn substitution_reads_player_ids_from_data() {
        let event = map_soccer_event(&parse(SUBSTITUTION_ENRICHED)).unwrap();
        assert_eq!(
            event,
            MatchEvent::Substitution {
                participant: 2,
                player_in_id: 223984,
                player_out_id: 10092630,
            }
        );
    }

    #[test]
    fn yellow_card_maps_with_player_id() {
        let event = map_soccer_event(&parse(YELLOW_CARD_ENRICHED)).unwrap();
        assert_eq!(
            event,
            MatchEvent::Card {
                participant: 2,
                player_id: Some(415057),
                kind: CardKind::Yellow,
            }
        );
    }

    #[test]
    fn penalty_is_a_direct_top_level_action() {
        let event = map_soccer_event(&parse(PENALTY)).unwrap();
        assert_eq!(event, MatchEvent::Penalty { participant: 1 });
    }

    #[test]
    fn full_time_reads_score_from_score_block_not_data() {
        let event = map_soccer_event(&parse(GAME_FINALISED)).unwrap();
        assert_eq!(
            event,
            MatchEvent::FullTime {
                home_score: 2,
                away_score: 0,
            }
        );
    }

    /// Real bug caught during a full-match replay dry run (2026-07-13, event #60 of the
    /// France v Morocco quarter-final): a `corner` event carried `"Score":{}` — completely
    /// empty, neither side present, not just missing `Total`/`Goals`. This must not error.
    #[test]
    fn empty_score_block_does_not_panic_or_error() {
        let raw: RawSoccerEvent =
            serde_json::from_str(r#"{"Action":"corner","Confirmed":true,"Score":{}}"#).unwrap();
        assert_eq!(map_soccer_event(&raw), None);
    }
}
