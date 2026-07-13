// One-time TxLINE devnet activation (CLAUDE.md Section 5, item 3). Run manually
// (or re-run on token expiry) — this is deliberately NOT part of the Rust request path.
//
// What it does:
//   1. Creates the caller's Token-2022 associated token account if it doesn't exist.
//   2. Calls the txoracle program's `subscribe(service_level_id=1, weeks=4)` instruction.
//      Row 1 is the confirmed free World Cup tier (pricePerWeekToken = 0, verified live
//      against devnet on 2026-07-12) — a devnet SOL network fee still applies even though
//      the TxL token cost is waived.
//   3. Signs `${txSig}:${leagues.join(",")}:${jwt}` with the wallet's keypair and exchanges
//      it for a long-lived X-Api-Token via POST /api/token/activate.
//
// Usage:
//   solana-keygen new --outfile ./activation-keypair.json   # first time only
//   solana airdrop 1 <pubkey> --url https://api.devnet.solana.com   # or fund via
//     https://faucet.solana.com if the CLI airdrop is rate-limited
//   npm install
//   ANCHOR_WALLET=./activation-keypair.json node activate.js
//
// Put the printed X-Api-Token into backend/.env as TXLINE_API_KEY.
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} = require("@solana/web3.js");
const {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} = require("@solana/spl-token");
const nacl = require("tweetnacl");
const axios = require("axios");
const idl = require("./txoracle.json");

const PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TOKEN_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
const API_BASE_URL = "https://txline-dev.txodds.com/api";
const JWT_URL = "https://txline-dev.txodds.com/auth/guest/start";
const SERVICE_LEVEL_ID = 1; // confirmed free tier: pricePerWeekToken = 0
const WEEKS = 4; // must be a multiple of 4
const SELECTED_LEAGUES = [];

async function main() {
  const walletPath = process.env.ANCHOR_WALLET;
  if (!walletPath) throw new Error("Set ANCHOR_WALLET to the keypair JSON path");
  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(path.resolve(walletPath), "utf8")),
  );
  const user = Keypair.fromSecretKey(secretKey);
  console.log("Wallet:", user.publicKey.toBase58());

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new anchor.Wallet(user);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);

  const balance = await connection.getBalance(user.publicKey);
  console.log("Balance:", balance / 1e9, "SOL");
  if (balance === 0) {
    throw new Error(
      "Wallet has 0 SOL on devnet. Fund it via https://faucet.solana.com then re-run.",
    );
  }

  const userTokenAccountAddress = getAssociatedTokenAddressSync(
    TOKEN_MINT,
    user.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  console.log("User token account:", userTokenAccountAddress.toBase58());

  const existing = await connection.getAccountInfo(userTokenAccountAddress);
  if (!existing) {
    console.log("Creating Token-2022 associated token account...");
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        user.publicKey,
        userTokenAccountAddress,
        user.publicKey,
        TOKEN_MINT,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [user], {
      commitment: "confirmed",
    });
    console.log("ATA created:", sig);
  }
  const userTokenAccount = await getAccount(
    connection,
    userTokenAccountAddress,
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );

  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    PROGRAM_ID,
  );
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    PROGRAM_ID,
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TOKEN_MINT,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  console.log(`Subscribing on-chain: level ${SERVICE_LEVEL_ID}, ${WEEKS} weeks...`);
  const tx = await program.methods
    .subscribe(SERVICE_LEVEL_ID, WEEKS)
    .accounts({
      user: user.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: TOKEN_MINT,
      userTokenAccount: userTokenAccount.address,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = user.publicKey;
  tx.sign(user);

  const txSig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(
    {
      signature: txSig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );
  console.log("Subscribe tx confirmed:", txSig);

  console.log("Acquiring guest JWT...");
  const jwtResp = await axios.post(JWT_URL);
  const jwt = jwtResp.data.token;

  const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, user.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  console.log("Activating API token...");
  const activationResp = await axios.post(
    `${API_BASE_URL}/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  const apiToken = activationResp.data.token || activationResp.data;

  console.log("\n=== SUCCESS ===");
  console.log("Put this in backend/.env as TXLINE_API_KEY:");
  console.log(apiToken);
}

main().catch((err) => {
  if (err.response) {
    console.error("HTTP", err.response.status, err.response.data);
  } else {
    console.error(err);
  }
  process.exit(1);
});
