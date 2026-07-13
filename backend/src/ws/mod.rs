use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::Response;
use uuid::Uuid;

use crate::AppState;

/// `/ws/match/{match_id}` — CLAUDE.md Section 9. Auth (wallet-signed session token) is
/// not enforced yet in this scaffold; wire it in once the session layer from
/// `POST /auth/wallet` exists.
pub async fn match_ws_handler(
    ws: WebSocketUpgrade,
    Path(match_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, match_id, state))
}

async fn handle_socket(mut socket: WebSocket, match_id: Uuid, state: AppState) {
    let mut rx = state.event_bus.subscribe(match_id);

    loop {
        tokio::select! {
            broadcast_msg = rx.recv() => {
                match broadcast_msg {
                    Ok(msg) => {
                        let Ok(text) = serde_json::to_string(&msg) else { continue };
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => continue, // clients don't send app-level messages in v1
                    Some(Err(_)) => break,
                }
            }
        }
    }
}
