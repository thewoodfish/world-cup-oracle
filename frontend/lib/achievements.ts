export type AchievementMeta = {
  key: string;
  label: string;
  description: string;
  emoji: string;
};

/** Mirrors backend/src/domain/achievements.rs — keep in sync when a new key ships. */
export const ACHIEVEMENT_CATALOG: AchievementMeta[] = [
  {
    key: "first_blood",
    label: "First Blood",
    description: "Correctly called the outcome of your first tournament match.",
    emoji: "🩸",
  },
  {
    key: "perfect_match",
    label: "Perfect Match",
    description: "Got every prediction type right for a single match.",
    emoji: "💯",
  },
  {
    key: "streak",
    label: "On Fire",
    description: "Correct outcome picks 3 matches running.",
    emoji: "🔥",
  },
  {
    key: "underdog_eye",
    label: "Underdog Eye",
    description: "Called an outcome the odds didn't favor — and it hit.",
    emoji: "🐺",
  },
];

export function achievementMeta(key: string): AchievementMeta {
  return (
    ACHIEVEMENT_CATALOG.find((a) => a.key === key) ?? {
      key,
      label: key.replace(/_/g, " "),
      description: "",
      emoji: "🏆",
    }
  );
}
