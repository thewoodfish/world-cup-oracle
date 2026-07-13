use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub bind_addr: String,
    pub txline_base_url: String,
    pub txline_api_key: Option<String>,
    pub solana_rpc_url: String,
    pub session_jwt_secret: String,
    pub frontend_origin: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            database_url: env::var("DATABASE_URL")?,
            bind_addr: env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string()),
            txline_base_url: env::var("TXLINE_BASE_URL")
                .unwrap_or_else(|_| "https://txline.txodds.com".to_string()),
            txline_api_key: env::var("TXLINE_API_KEY").ok(),
            solana_rpc_url: env::var("SOLANA_RPC_URL")
                .unwrap_or_else(|_| "https://api.devnet.solana.com".to_string()),
            session_jwt_secret: env::var("SESSION_JWT_SECRET")?,
            frontend_origin: env::var("FRONTEND_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
        })
    }
}
