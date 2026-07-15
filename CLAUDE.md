# CLAUDE.md — World Cup Oracle

This file is the source of truth for Claude Code (and any future contributor) working on this repo. Read this in full before writing code. Keep it updated as decisions change — stale docs are worse than none.

## 1. Project Summary

**World Cup Oracle** is a real-time prediction game built for the TxODDS "Consumer and Fan Experiences" World Cup Hackathon track on Superteam Earn.

Before each match, users submit predictions across four categories (outcome, scoreline, key moments, player performance). As the match plays, TxLINE's live data feed drives real-time scoring, leaderboard movement, and achievement unlocks. Sign-in is via Solana wallet, giving each player a persistent, cross-tournament profile.

**Core loop:** connect wallet → predict before kickoff → watch score update live as match events land → see leaderboard position shift → unlock achievements → repeat across 104 games.

**Hackathon deadline:** Submissions close **July 19, 2026, 23:59 UTC**. Winners announced July 29, 2026.

**Prizes:** 1st $10,000 USDT / 2nd $4,000 USDT / 3rd $2,000 USDT.

**Non-negotiables from the sponsor rules — do not violate these:**
- Must use TxLINE data as a **live input** (not just historical/mock data in the final product).
- Must use **Solana** for sign-in.
- Must be a **live, functional product** — mockups/wireframes/pitch decks are automatically disqualified.
- Demo video (≤5 min) is the primary judged artifact — assume judges may review with **no live match happening**, so the video must fully carry the story.
- Public repo required.
- Team size max 3.

## 2. Judging Criteria (design against these explicitly)

1. **Fan Accessibility & UX** — must be usable by a non-technical mainstream sports fan, not just crypto-native users.
2. **Real-Time Responsiveness** — the app must visibly and fluidly react to live match events.
3. **Originality & Value Creation** — genuinely new interaction model, not a repackaged feed.
4. **Commercial & Monetization Path** — there should be a legible business model, even if not built.
5. **Completeness & Execution** — a small-scope but fully working feature beats a large half-working one.

Every architectural decision below is made to protect all five of these simultaneously under a hard 8-day deadline.

## 3. Architecture Philosophy

**Do not build four bespoke prediction systems.** Build one generic, event-driven prediction/scoring engine where each prediction type is a configuration + scoring function, not a parallel codebase. This is the only way "don't cut anything" (all 4 prediction types + achievements + leaderboards) is achievable solo in 8 days.

```
TxLINE live feed
      │
      ▼
 Ingestion Service (Rust) ── normalizes events into internal MatchEvent enum
      │
      ▼
 Event Bus (in-process pub/sub, or Redis pub/sub if multi-instance)
      │
      ├──▶ Scoring Engine ──▶ per-prediction-type scoring fn ──▶ Score deltas
      │                                                              │
      ├──▶ Achievement Engine (rule-based listeners)                 │
      │                                                              ▼
      └──▶ Websocket Broadcaster ◀───────────────────────── Postgres (scores, leaderboard)
                    │
                    ▼
              Next.js frontend (live UI)
```

**Key principle:** adding a new prediction type or achievement rule should require writing one new function, not touching ingestion, storage, or the websocket layer.

## 4. Tech Stack

- **Backend:** Rust, Axum (preferred over Rocket for this — better async websocket ergonomics via `axum::extract::ws`)
- **Database:** Postgres (via `sqlx`, compile-time checked queries)
- **Realtime transport:** WebSocket, broadcast channel (`tokio::sync::broadcast`) fanned out per match room
- **Frontend:** Next.js (App Router) + Tailwind
- **Solana:** `@solana/wallet-adapter` for sign-in only. No on-chain program required unless time permits — keep it to a signed message + persistent profile row in Postgres. Do not over-engineer on-chain state; it buys no judging points here and burns days you don't have.
- **Deployment:** backend on Fly.io or Railway (needs persistent websocket support — avoid serverless functions for the ws layer); frontend on Vercel.
- **TxLINE integration:** feed is consumed via **SSE** (Server-Sent Events), reconciled against REST snapshots on connect; auth is a two-step Guest JWT → Solana-signed token activation (see Section 5 for full detail and source links). Ingestion Service is an SSE client + snapshot reconciler, not a websocket or poll loop.

## 5. Open Questions — Day 1 Findings (2026-07-12)

1. **TxLINE feed granularity for player-level events** — **RESOLVED AND VERIFIED LIVE 2026-07-13.** Per the OpenAPI spec (`SoccerData` schema in https://txline.txodds.com/docs/docs.yaml), individual players are identified via `PlayerId` on goal/card events and `PlayerInId`/`PlayerOutId` on substitution events. Confirmed for real (not just from the spec) against `/api/scores/historical/18209181` (France 2-0 Morocco) — `PlayerId: 453928` really does appear on a real `goal` event's `Data`. Player performance predictions stay in scope as designed. **Important correction the OpenAPI spec doesn't mention** — see item 2 below.
2. **TxLINE feed transport** — **RESOLVED AND IMPLEMENTED 2026-07-13.** SSE, not websocket, not polling — `backend/src/ingestion/live.rs` now connects `/api/scores/stream?fixtureId=...` for real and reconnects with a fresh guest JWT every 20 minutes (`reqwest-eventsource`'s built-in retry reuses a stale JWT otherwise). Schedule sync (`backend/src/ingestion/schedule.rs`) pulls real fixtures from `/api/fixtures/snapshot?competitionId=72` into `matches` on startup. **Confirmed live and running as of 2026-07-13**: both semi-finals (France v Spain, England v Argentina) are synced and their live streams are open, waiting for kickoff.
   - **The real wire format disagrees with the OpenAPI spec, and this cost real debugging time — trust live payloads over docs here.** The spec describes the `Scores` stream/historical schema as camelCase (`fixtureId`, `action`, `dataSoccer`...). The actual payload (confirmed via `/api/scores/historical/{fixtureId}`, which is *also* documented as returning a JSON array but actually streams SSE-formatted `data: {...}` lines) is PascalCase throughout (`FixtureId`, `Action`, `Data`, `Score`) — see the doc comment on `backend/src/ingestion/soccer.rs::RawSoccerEvent` for the full verified shape. Two things that will bite anyone re-deriving this from the spec instead of live data:
     - Every action streams in 2-3 stages sharing one `Id` (unconfirmed → confirmed → confirmed-with-richer-`Data`, e.g. a goal's `PlayerId` only shows up on the last stage). We only act on `Confirmed != false`.
     - The final/running score is **not** in `Data` — it's `Score.Participant{1,2}.Total.Goals` (absent, not zero, if that side hasn't scored). `game_finalised` events don't carry a score in `Data` at all.
   - Real, ground-truth event/action names captured live from a full match: `goal`, `yellow_card`, `red_card` (not observed but consistent with `yellow_card`'s naming), `penalty` (a direct top-level action, not solely VAR-derived — though `var` with `Data.Type=="Penalty"` also appears and is kept as an additional path), `substitution`, `shot`, `var`/`var_end`, `game_finalised`, `halftime_finalised`. `soccer.rs` has unit tests pinned to real captured payloads for each of these.
   - **Real incident, 2026-07-14/15: a ~14-hour local network outage during the France v Spain semi-final dropped the SSE connection 44 minutes after kickoff and every reconnect just resumed live-tailing from "now," permanently losing the rest of the match.** `/api/scores/historical/{fixtureId}` could not have backfilled that gap even if we'd tried mid-match — it's documented as only serving fixtures that started 6+ hours ago (post-match analysis, not mid-match gap recovery). **Fixed properly** in `live.rs`: track the last processed SSE message `id` and send it as `Last-Event-ID` on every reconnect (TxLINE documents support for this per the SSE spec), so TxLINE replays whatever was missed instead of silently skipping ahead. Untested against a real multi-hour outage yet (the France v Spain gap was backfilled after the fact via the now-available historical endpoint, once 6+ hours had passed) — worth watching during the England v Argentina window on 2026-07-15.
   - **Schedule sync only returns fixtures from "today" onward** — `/api/fixtures/snapshot` defaults `startEpochDay` to the current UTC day, so a match ages out of the live snapshot the day after it's played (confirmed: the count dropped from 2 to 1 the morning after France v Spain). Harmless for us since `sync_world_cup_matches` only upserts and never deletes, so our own `matches` table keeps the historical row — but don't expect a re-sync to "find" a past match if the row were ever lost.
3. **Auth model** — **RESOLVED AND ACTIVATED 2026-07-13.** Two-step credential flow: (a) `POST /auth/guest/start` → Guest JWT, sent as `Authorization: Bearer <jwt>`; (b) activate a real API token via `POST /api/token/activate`, which requires **signing and submitting a Solana transaction** (subscription purchase) even on the free World Cup tier — Solana tx fees apply even though the TxL token cost is waived. Resulting token is sent as `X-Api-Token`.
   - **Both docs and prod/devnet domains matter and are different**: `https://txline.txodds.com/api/` is production/mainnet, `https://txline-dev.txodds.com/api/` is devnet — do not mix them (a devnet-signed activation will not work against prod). `backend/.env` now correctly points `TXLINE_BASE_URL` at the devnet domain to match the devnet-signed activation below.
   - **The on-chain step is a real Anchor program call**, not a generic transfer: program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` ("txoracle"), instruction `subscribe(service_level_id: u16, weeks: u8)`. PDAs: `pricing_matrix` = seeds `["pricing_matrix"]`, `token_treasury_pda` = seeds `["token_treasury_v2"]`, `token_treasury_vault` = Token-2022 ATA of `(token_mint, token_treasury_pda)`. Token mint `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG`, token program is **Token-2022**, not classic SPL Token. **Confirmed live against devnet on 2026-07-12:** pricing-matrix row `service_level_id=1` has `price_per_week_token=0` — that's the free World Cup tier used below (`weeks` must be a multiple of 4). After `subscribe` confirms, sign `${txSig}:${leagues.join(",")}:${jwt}` (raw ed25519, same primitive as the frontend wallet-login signature) and POST `{txSig, walletSignature, leagues}` to `/api/token/activate` with the guest JWT bearer.
   - **Implemented as an out-of-band ops script, not hand-rolled in Rust**: `backend/ops/txline-activate/activate.js` (needs a funded devnet keypair — `solana-keygen new` + `solana airdrop`, or https://faucet.solana.com if the CLI airdrop is rate-limited, which it was for us on 2026-07-12). This matches "build as a one-time/renew-on-expiry setup step, not per-request" — reusing TxLINE's own proven `@coral-xyz/anchor`/`@solana/spl-token` reference logic (from `github.com/txodds/tx-on-chain`) is far lower-risk than hand-encoding Anchor instructions against `solana-sdk` under hackathon time pressure. The Rust side (`ingestion::PreProvisionedActivation`) just reads the resulting token from `TXLINE_API_KEY` in `.env`.
   - **Activated and confirmed working 2026-07-13**: devnet tx `xPi6rN1gHKWAstdiTd3Yjam5DNetXvi4GJtN3HCTDcbSeVrqB66DQL8MPz7GUT4yAGb3GD6KVnFf6TB1u8tfeL6`, `TXLINE_API_KEY` now set in `backend/.env`, backend startup diagnostic (`spawn_txline_guest_auth_check`) passes end to end. **This token is a devnet credential tied to a throwaway keypair — expect to re-run activation** if it expires or if the project moves to the prod domain for the actual submission. No rate limits documented on the TxLINE API free tier itself. Free tier offers both 60s-delayed and real-time World Cup data at no TxL token cost — **use real-time**.
4. **Match schedule during build window** — **CORRECTED 2026-07-12 (evening): the original Day 1 finding below was wrong.** Re-checked `/documentation/scores/schedule` directly and it goes well past the quarter-finals:
   - Quarter-finals **already played** with final scores on record: France 2–0 Morocco, Spain 2–1 Belgium, England 2–1 Norway, Argentina 3–1 Switzerland.
   - **Semi-finals are real, upcoming fixtures inside the build window**: **France vs Spain (Jul 14)** and **England vs Argentina (Jul 15)** — both land before the Jul 19 deadline. No final fixture is listed yet (presumably unconfirmed until the semis resolve).
   - **Plan accordingly:** a real live match (France v Spain) is reachable just 2 days out. Getting the real SSE ingestion path (Section 5 items 2–3) working before Jul 14 is now the top priority — it turns "TxLINE as a live input" from a replay-only demo into an actual live one, which matters directly for the sponsor's non-negotiable rule and the Real-Time Responsiveness judging criterion. Keep the fixture-replay path (CLAUDE.md Section 11, `ingestion::replay`) as the fallback/demo-safety-net either way — the completed quarter-finals are now also usable as *real* historical event logs to replay (once we can pull their event history from TxLINE), not fabricated test data.
   - ~~Original (incorrect) Day 1 finding, kept for the record: "the last scheduled fixture is the France vs. Morocco quarter-final on July 9, 2026 — before this project even started. There is no live World Cup match between now (Jul 12) and the Jul 19 deadline." This undersold what the schedule endpoint actually returns.~~
   - **Current implementation status (as of this correction): none of this is wired up yet.** `spawn_txline_guest_auth_check` in `main.rs` only does a guest-JWT handshake as a startup diagnostic; token activation is stubbed (`UnimplementedActivation`, still blocked on a funded devnet Solana keypair per item 3); nothing pulls the real schedule into `matches`; `ingestion::replay` only replays a hand-provided local JSON file. Building real schedule sync + activation is now the most urgent gap given the Jul 14 semi-final.

5. **Pre-match odds snapshot mechanism** — **RESOLVED: confirmed via OpenAPI spec.** `GET /api/odds/snapshot/{fixtureId}?asOf=<unix_ms>` returns historical odds as of a given point in time ("If the `asOf` parameter is provided, the snapshots are taken at that point in time from historical data"); omitting `asOf` returns the live snapshot. Each `OddsPayload` carries a `Ts` timestamp. **Implication:** "Underdog Eye" is viable as designed — at prediction submission time, call this endpoint with `asOf` set to the current timestamp (pre-kickoff) to capture the odds the user's pick was made against, store it alongside the prediction, and compare favorite/underdog at scoring time. No fallback needed; keep it in v1 scope per Section 8.

**Still open / lower priority:**
- TxLINE's own score feed is anchored against on-chain Merkle roots on Solana for cryptographic verification — this is TxLINE's internal integrity mechanism, not something we build. Doesn't change our Section 14 decision to skip an on-chain program for *our* app.

Source docs:
- Quickstart: https://txline.txodds.com/documentation/quickstart
- World Cup docs: https://txline.txodds.com/documentation/worldcup
- Full doc index: https://txline-docs.txodds.com/llms.txt
- Soccer feed schema: https://txline.txodds.com/documentation/scores/soccer-feed
- Subscription tiers: https://txline.txodds.com/documentation/subscription-tiers
- OpenAPI spec: https://txline.txodds.com/docs/docs.yaml

## 6. Data Model (confirmed after Day 1 TxLINE investigation — see Section 5)

```sql
users (
  id UUID PK,
  wallet_pubkey TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ
)

matches (
  id UUID PK,
  txline_match_id TEXT UNIQUE NOT NULL,
  home_team TEXT, away_team TEXT,
  kickoff_at TIMESTAMPTZ,
  status TEXT -- scheduled | live | finished
)

predictions (
  id UUID PK,
  user_id UUID FK,
  match_id UUID FK,
  prediction_type TEXT, -- outcome | scoreline | key_moment | player_performance
  payload JSONB, -- shape depends on prediction_type, validated at API layer
  submitted_at TIMESTAMPTZ,
  is_lock BOOLEAN DEFAULT false, -- "Lock of the Day" (Section 7a), added 2026-07-14
  UNIQUE(user_id, match_id, prediction_type) -- one prediction per type per match per user, adjust if multiple key-moment predictions allowed per match
  -- + partial unique index on (user_id, match_id) WHERE is_lock, enforcing at most one lock per match
)

match_events (
  id UUID PK,
  match_id UUID FK,
  txline_event_id TEXT,
  event_type TEXT, -- goal | card | sub | shot | save | odds_shift | full_time | ...
  payload JSONB, -- raw normalized event
  occurred_at TIMESTAMPTZ
)

scores (
  id UUID PK,
  user_id UUID FK,
  match_id UUID FK,
  prediction_type TEXT,
  points INT,
  last_updated_at TIMESTAMPTZ
)

achievements (
  id UUID PK,
  user_id UUID FK,
  achievement_key TEXT,
  unlocked_at TIMESTAMPTZ
)
```

`prediction_type` + `payload` (JSONB) keeps the schema generic — no per-type tables. Validate `payload` shape in the API layer via a Rust enum with serde, not at the DB level.

## 7. Prediction Types (v1 scope — all four, kept intentionally simple)

1. **Outcome** — home win / draw / away win. Scored on full-time result.
2. **Scoreline** — exact final score. Scored on exact match; partial credit optional (e.g., correct outcome but wrong score = partial points) if time allows, exact-only if not.
3. **Key moments** — e.g., "will there be a red card," "will there be a penalty," "will the match go to extra time" (knockout stage). Pick 2–3 concrete, TxLINE-verifiable moment types — do not build a freeform moment picker, that's a UX and scoring nightmare under time pressure.
4. **Player performance** — confirmed scoreable via `PlayerId` + `Goal=true` on soccer score events (Section 5). v1: "will Player X score a goal" (binary). Finer-grained stats (shots on target via the `shot` action's `Data.Outcome`, rating thresholds) are a stretch goal only if time allows — don't scope them in for v1.

Each type = one Rust struct implementing a shared `Scorable` trait:
```rust
trait Scorable {
    fn score(&self, events: &[MatchEvent]) -> ScoreResult;
}
```

### 7a. "Lock of the Day" (added 2026-07-14, engagement pass)

One prediction per match can be flagged `is_lock` — the pick the user is staking double points on (CHATGPT.md's emotional-loop brief: "every day has a dramatic decision"). Since every `Scorable` impl already scores 0-or-full-points, a lock is just `points * 2` on that row — no separate win/lose branch needed. Enforced server-side: `predictions.is_lock`, with a partial unique index (`idx_predictions_one_lock_per_match`) guaranteeing at most one per `(user_id, match_id)`; setting a new lock atomically clears any previous one in the same transaction (`POST /predictions`, `is_lock: bool` field). Verified live: exclusivity, doubling, and normal (non-locked) scoring all confirmed correct via a real replay dry run before shipping.

### 7b. Outcome consensus (added 2026-07-14, engagement pass)

`GET /predictions/consensus?match_id=` returns real aggregate counts (`home_win`/`draw`/`away_win`) across all submitted outcome predictions for a match — no auth required, it's a count not per-user data. Powers "62% picked France" / "🔥 bold pick" copy in the outcome step. Deliberately not fabricated — if nobody's predicted yet, the UI says so rather than inventing a percentage.

## 8. Achievements (v1 scope)

Keep to a small, clearly defined rule set that reacts to the same event/score stream — do not build a generic achievement DSL under time pressure. Suggested v1 set:
- "First Blood" — correctly predict the first goal-scorer or outcome of the tournament's first match you participate in.
- "Perfect Match" — get all active prediction types correct for a single match.
- "Streak" — correct outcome predictions across 3+ consecutive matches.
- "Underdog Eye" — correctly predict an outcome where the pre-match odds favored the opponent (odds captured via `GET /api/odds/snapshot/{fixtureId}?asOf=<prediction_ts>`, confirmed in Section 5, item 5).

## 9. Websocket Contract

- Client connects to `/ws/match/{match_id}` after authenticating (wallet-signed session token).
- Server pushes:
```json
{ "type": "score_update", "user_id": "...", "match_id": "...", "prediction_type": "...", "points": 5, "total": 42 }
{ "type": "leaderboard_update", "match_id": "...", "top": [ { "user_id": "...", "display_name": "...", "total": 120 } ] }
{ "type": "match_event", "match_id": "...", "event_type": "goal", "payload": { ... } }
{ "type": "achievement_unlocked", "user_id": "...", "achievement_key": "perfect_match" }
```
- Reconnect handling required — mobile fans on flaky connections is the expected real-world use case; frontend must gracefully resync state (fetch current score snapshot via REST) on reconnect rather than relying solely on the ws stream.

## 10. REST API (minimum surface)

- `POST /auth/wallet` — verify signed message, issue session
- `GET /matches` — upcoming + live + recent
- `POST /predictions` — submit prediction (validated against match kickoff cutoff — no predictions after kickoff)
- `GET /predictions/mine?match_id=`
- `GET /leaderboard/global`
- `GET /leaderboard/match/{match_id}`
- `GET /users/me/profile` — stats, achievements, history

## 11. Day-by-Day Plan (Jul 11 → Jul 19 UTC)

- **Day 1 (Jul 11):** ~~Resolve TxLINE open questions~~ — done, see Section 5 findings (2026-07-12). Scaffold Rust/Axum backend, Next.js frontend, Solana wallet adapter sign-in. Provision Postgres.
- **Day 2 (Jul 12):** Player-ID attribution confirmed (Section 5, item 1) — player performance stays in scope as designed. Build generic prediction engine + full data model. Stand up server-side TxLINE auth (guest JWT → Solana-signed token activation) and get SSE ingestion pulling real/replayed events into `match_events`.
- **Day 3 (Jul 13):** Implement `Scorable` for all 4 prediction types. Websocket layer broadcasting live score updates.
- **Day 4 (Jul 14):** Frontend: prediction submission flow (all 4 types), live match view with real-time updates.
- **Day 5 (Jul 15):** Leaderboard (global + per-match, live-updating) + achievement engine with v1 rule set.
- **Day 6 (Jul 16):** Persistent profile UX, cross-tournament stat aggregation, error/reconnect handling, general UX polish.
- **Day 7 (Jul 17):** End-to-end test against a real live match if schedule allows, else replay recorded data through the full pipeline. Start demo video script.
- **Day 8 (Jul 18):** Record demo video, write technical doc (core idea, TxLINE endpoints used, feedback notes), deploy to stable public URL. Buffer day — do not start anything new.
- **Jul 19 (submission day):** Final bug fixes only. Submit before 23:59 UTC. Do not touch scope after Day 8 ends.

## 12. Submission Checklist (do not miss any of these)

- [ ] Demo video (≤5 min, Loom/YouTube): shows problem, live app walkthrough, how TxLINE powers the backend
- [ ] Deployed, working link OR functional API endpoint for judges
- [ ] Public repo
- [ ] Brief technical doc: core idea, business/technical highlights, list of specific TxLINE endpoints used
- [ ] Feedback section: TxLINE API experience — what worked, where you hit friction
- [ ] Confirm Solana sign-in is functional in the deployed build, not just local
- [ ] Confirm the app actually consumes TxLINE as a **live** input in the deployed build, not mocked data

## 13. Engineering Conventions

- Rust: `cargo fmt` + `cargo clippy -- -D warnings` clean before any commit that touches backend.
- Commit early and often — given the compressed timeline, small reversible commits matter more than clean history right now. Squash before submission if needed.
- No speculative abstraction beyond the `Scorable` trait and event-bus pattern already specified above — resist the urge to generalize further under time pressure.
- Secrets (TxLINE API key, DB URL, Solana RPC endpoint) via `.env`, never committed. Add `.env.example`.
- If TxLINE rate limits or feed instability are hit, log and degrade gracefully (show last-known state in UI) rather than crashing the websocket layer — judges may be testing live.

## 14. Explicitly Out of Scope for v1 (revisit only if Day 6–7 have slack)

- On-chain program / on-chain score storage (Postgres is sufficient and faster to ship; on-chain adds no judging-criteria value here)
- Freeform/user-generated prediction moments
- Mobile app (responsive web is sufficient for "fan accessibility")
- Social features beyond the leaderboard (friend groups, private leagues) — mentioned as a "Group Sweepstake" idea in the original brief but is a different product; don't scope-creep into it
