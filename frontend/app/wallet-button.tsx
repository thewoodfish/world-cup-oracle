"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

function shortAddress(pubkey: string) {
  return `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`;
}

export function WalletButton() {
  const { connected, publicKey } = useWallet();
  const { status, error, signIn } = useAuth();

  if (!connected || !publicKey) {
    return <WalletMultiButton />;
  }

  if (status === "signed-in") {
    return (
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="font-medium">{shortAddress(publicKey.toBase58())}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={() => void signIn()} disabled={status === "signing"}>
        {status === "signing" && <Loader2 className="h-4 w-4 animate-spin" />}
        Sign in with {shortAddress(publicKey.toBase58())}
      </Button>
      {status === "error" && error && (
        <p className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
