/// v1 achievement set from CLAUDE.md Section 8. Each rule is a pure function over facts
/// the caller (score/event stream listener) supplies — no DB access here, matching the
/// "rule-based listeners" principle without hardcoding a query layer into the domain.
pub struct AchievementContext {
    /// Every prediction type the user had active for this match was scored correct.
    pub all_predictions_correct_this_match: bool,
    /// Correctly predicted the outcome or scorer of the first goal of this match.
    pub correctly_predicted_first_goal_or_outcome: bool,
    /// Whether this is the first tournament match the user has participated in.
    pub is_users_first_tournament_match: bool,
    /// Count of consecutive prior matches (including this one) with a correct outcome
    /// prediction.
    pub consecutive_correct_outcome_streak: u32,
    /// The user picked the outcome that pre-match odds did not favor, and it hit.
    pub picked_correct_underdog_outcome: bool,
}

pub const FIRST_BLOOD: &str = "first_blood";
pub const PERFECT_MATCH: &str = "perfect_match";
pub const STREAK: &str = "streak";
pub const UNDERDOG_EYE: &str = "underdog_eye";

const STREAK_THRESHOLD: u32 = 3;

/// Returns the achievement keys newly unlocked given this context. Callers are
/// responsible for filtering out achievements the user already has (see the
/// `achievements` table's per-user uniqueness constraint).
pub fn evaluate(ctx: &AchievementContext) -> Vec<&'static str> {
    let mut unlocked = Vec::new();

    if ctx.is_users_first_tournament_match && ctx.correctly_predicted_first_goal_or_outcome {
        unlocked.push(FIRST_BLOOD);
    }
    if ctx.all_predictions_correct_this_match {
        unlocked.push(PERFECT_MATCH);
    }
    if ctx.consecutive_correct_outcome_streak >= STREAK_THRESHOLD {
        unlocked.push(STREAK);
    }
    if ctx.picked_correct_underdog_outcome {
        unlocked.push(UNDERDOG_EYE);
    }

    unlocked
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_ctx() -> AchievementContext {
        AchievementContext {
            all_predictions_correct_this_match: false,
            correctly_predicted_first_goal_or_outcome: false,
            is_users_first_tournament_match: false,
            consecutive_correct_outcome_streak: 0,
            picked_correct_underdog_outcome: false,
        }
    }

    #[test]
    fn no_facts_unlocks_nothing() {
        assert!(evaluate(&base_ctx()).is_empty());
    }

    #[test]
    fn streak_unlocks_at_threshold() {
        let ctx = AchievementContext {
            consecutive_correct_outcome_streak: 3,
            ..base_ctx()
        };
        assert_eq!(evaluate(&ctx), vec![STREAK]);
    }

    #[test]
    fn perfect_match_and_underdog_can_stack() {
        let ctx = AchievementContext {
            all_predictions_correct_this_match: true,
            picked_correct_underdog_outcome: true,
            ..base_ctx()
        };
        let unlocked = evaluate(&ctx);
        assert_eq!(unlocked, vec![PERFECT_MATCH, UNDERDOG_EYE]);
    }
}
