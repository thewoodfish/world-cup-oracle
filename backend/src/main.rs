mod api;
mod auth;
mod config;
mod db;
mod domain;
mod events;
mod ingestion;
mod models;
mod scoring;
mod ws;

use std::sync::Arc;

use axum::Router;
use axum::http::{HeaderValue, Method, header};
use axum::routing::get;
use sqlx::PgPool;
use tower_http::cors::CorsLayer;

use config::Config;
use events::EventBus;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub event_bus: EventBus,
    pub config: Arc<Config>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::from_env()?;
    let pool = db::connect(&config.database_url).await?;
    sqlx::migrate!().run(&pool).await?;

    let state = AppState {
        pool,
        event_bus: EventBus::new(),
        config: Arc::new(config.clone()),
    };

    maybe_spawn_replay(&state);
    spawn_txline_ingestion(&state);

    let cors = CorsLayer::new()
        .allow_origin(
            config
                .frontend_origin
                .parse::<HeaderValue>()
                .expect("FRONTEND_ORIGIN must be a valid header value"),
        )
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    let app = Router::new()
        .route("/health", get(health))
        .route("/ws/match/{match_id}", get(ws::match_ws_handler))
        .merge(api::router())
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    tracing::info!("listening on {}", config.bind_addr);
    axum::serve(listener, app).await?;

    Ok(())
}

/// No live World Cup match falls inside the build window (CLAUDE.md Section 5, item 4),
/// so replay is the primary way to drive real data through the pipeline end to end.
/// Opt-in via env so a plain `cargo run` doesn't require a fixture file to exist.
fn maybe_spawn_replay(state: &AppState) {
    let (Ok(path), Ok(match_id)) = (
        std::env::var("REPLAY_FIXTURE_PATH"),
        std::env::var("REPLAY_MATCH_ID"),
    ) else {
        return;
    };
    let Ok(match_id) = match_id.parse() else {
        tracing::warn!("REPLAY_MATCH_ID is not a valid UUID, skipping replay");
        return;
    };
    let pace_ms: u64 = std::env::var("REPLAY_PACE_MS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1000);

    let pool = state.pool.clone();
    let bus = state.event_bus.clone();
    tokio::spawn(async move {
        let path = std::path::Path::new(&path);
        tracing::info!(?path, %match_id, "starting fixture replay");
        if let Err(err) = ingestion::replay::replay_fixture(
            path,
            match_id,
            &pool,
            &bus,
            std::time::Duration::from_millis(pace_ms),
        )
        .await
        {
            tracing::error!(?err, "fixture replay failed");
        }
    });
}

/// Real TxLINE ingestion, end to end (CLAUDE.md Section 5, items 2-4): confirms auth,
/// syncs the real World Cup schedule into `matches`, then opens a live SSE stream per
/// fixture so `France v Spain` (Jul 14) and `England v Argentina` (Jul 15) score live as
/// they're played — not just replayed from a recorded fixture. Best-effort: logs and
/// backs off rather than crashing the server if TxLINE is unreachable or unconfigured,
/// per CLAUDE.md Section 13.
fn spawn_txline_ingestion(state: &AppState) {
    let config = state.config.clone();
    let pool = state.pool.clone();
    let bus = state.event_bus.clone();
    tokio::spawn(async move {
        let client = ingestion::TxLineClient::new(config.txline_base_url.clone());
        let activation: Box<dyn ingestion::ActivationStrategy> =
            Box::new(ingestion::PreProvisionedActivation {
                api_key: config.txline_api_key.clone(),
            });

        let jwt = match client.authenticate_guest().await {
            Ok(jwt) => {
                tracing::info!("txline guest auth check succeeded");
                jwt
            }
            Err(err) => {
                tracing::warn!(?err, "txline guest auth check failed (non-fatal)");
                return;
            }
        };

        let api_token = match activation.activate(&jwt).await {
            Ok(token) => token,
            Err(err) => {
                tracing::warn!(
                    ?err,
                    "no TXLINE_API_KEY configured yet — run backend/ops/txline-activate/activate.js once with a devnet-funded keypair"
                );
                return;
            }
        };

        let synced =
            match ingestion::schedule::sync_world_cup_matches(&pool, &client, &jwt, &api_token)
                .await
            {
                Ok(synced) => {
                    tracing::info!(
                        count = synced.len(),
                        "synced real World Cup schedule from TxLINE"
                    );
                    synced
                }
                Err(err) => {
                    tracing::warn!(?err, "failed to sync World Cup schedule from TxLINE");
                    return;
                }
            };

        for (match_id, fixture_id) in synced {
            let client = ingestion::TxLineClient::new(config.txline_base_url.clone());
            let pool = pool.clone();
            let bus = bus.clone();
            tokio::spawn(async move {
                ingestion::live::stream_fixture(&client, fixture_id, match_id, pool, bus).await;
            });
        }
    });
}

async fn health() -> &'static str {
    "ok"
}
