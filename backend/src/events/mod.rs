use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

/// Wire messages pushed to clients over `/ws/match/{match_id}`, per CLAUDE.md Section 9.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsMessage {
    ScoreUpdate {
        user_id: Uuid,
        match_id: Uuid,
        prediction_type: String,
        points: i32,
        total: i32,
    },
    LeaderboardUpdate {
        match_id: Uuid,
        top: Vec<LeaderboardEntry>,
    },
    MatchEvent {
        match_id: Uuid,
        event_type: String,
        payload: serde_json::Value,
    },
    AchievementUnlocked {
        user_id: Uuid,
        achievement_key: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardEntry {
    pub user_id: Uuid,
    pub display_name: Option<String>,
    pub total: i32,
}

const ROOM_CAPACITY: usize = 256;

/// One `tokio::sync::broadcast` channel per match room, fanned out to every connected
/// websocket client for that match (CLAUDE.md architecture diagram / Section 9).
#[derive(Clone, Default)]
pub struct EventBus {
    rooms: Arc<RwLock<HashMap<Uuid, broadcast::Sender<WsMessage>>>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn subscribe(&self, match_id: Uuid) -> broadcast::Receiver<WsMessage> {
        let rooms = self.rooms.read().unwrap();
        if let Some(tx) = rooms.get(&match_id) {
            return tx.subscribe();
        }
        drop(rooms);

        let mut rooms = self.rooms.write().unwrap();
        let tx = rooms
            .entry(match_id)
            .or_insert_with(|| broadcast::channel(ROOM_CAPACITY).0);
        tx.subscribe()
    }

    /// No-op (send fails silently) if nobody is subscribed to this match yet — that's
    /// expected and fine, broadcast channels don't buffer for zero receivers.
    pub fn publish(&self, match_id: Uuid, message: WsMessage) {
        let rooms = self.rooms.read().unwrap();
        if let Some(tx) = rooms.get(&match_id) {
            let _ = tx.send(message);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn publish_reaches_subscriber() {
        let bus = EventBus::new();
        let match_id = Uuid::new_v4();
        let mut rx = bus.subscribe(match_id);

        bus.publish(
            match_id,
            WsMessage::AchievementUnlocked {
                user_id: Uuid::new_v4(),
                achievement_key: "first_blood".to_string(),
            },
        );

        let received = rx.recv().await.unwrap();
        assert!(matches!(received, WsMessage::AchievementUnlocked { .. }));
    }
}
