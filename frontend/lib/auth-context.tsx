"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { API_BASE_URL } from "./api";

const SIGN_IN_MESSAGE = "Sign in to World Cup Oracle";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

type Session = { token: string; userId: string; walletPubkey: string };

type AuthState = {
  session: Session | null;
  status: "idle" | "signing" | "signed-in" | "error";
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function storageKey(pubkey: string) {
  return `wco:session:${pubkey}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);

  // Reset local session state whenever the wallet disconnects or switches
  // accounts, so a stale token is never sent under a different pubkey.
  useEffect(() => {
    if (!connected || !publicKey) {
      setSession(null);
      setStatus("idle");
      return;
    }
    const cached =
      typeof window !== "undefined"
        ? window.localStorage.getItem(storageKey(publicKey.toBase58()))
        : null;
    if (cached) {
      const parsed: Session = JSON.parse(cached);
      setSession(parsed);
      setStatus("signed-in");
    } else {
      setStatus("idle");
    }
  }, [connected, publicKey]);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError("This wallet doesn't support message signing.");
      setStatus("error");
      return;
    }
    setStatus("signing");
    setError(null);
    try {
      const signature = await signMessage(
        new TextEncoder().encode(SIGN_IN_MESSAGE),
      );
      const res = await fetch(`${API_BASE_URL}/auth/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_pubkey: publicKey.toBase58(),
          message: SIGN_IN_MESSAGE,
          signature: bytesToBase64(signature),
        }),
      });
      if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
      const data: { token: string; user_id: string } = await res.json();
      const next: Session = {
        token: data.token,
        userId: data.user_id,
        walletPubkey: publicKey.toBase58(),
      };
      window.localStorage.setItem(
        storageKey(next.walletPubkey),
        JSON.stringify(next),
      );
      setSession(next);
      setStatus("signed-in");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setStatus("error");
    }
  }, [publicKey, signMessage]);

  const signOut = useCallback(() => {
    if (publicKey) {
      window.localStorage.removeItem(storageKey(publicKey.toBase58()));
    }
    setSession(null);
    setStatus("idle");
    void disconnect();
  }, [publicKey, disconnect]);

  const value = useMemo(
    () => ({ session, status, error, signIn, signOut }),
    [session, status, error, signIn, signOut],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
