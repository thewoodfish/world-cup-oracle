ALTER TABLE predictions ADD COLUMN is_lock BOOLEAN NOT NULL DEFAULT false;

-- At most one "Lock of the Day" per user per match (CHATGPT.md's 2x-or-nothing pick).
CREATE UNIQUE INDEX idx_predictions_one_lock_per_match
    ON predictions (user_id, match_id)
    WHERE is_lock;
