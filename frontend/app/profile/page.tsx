"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { fetchProfile, type Profile } from "@/lib/api";
import { ACHIEVEMENT_CATALOG } from "@/lib/achievements";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { session, status } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    fetchProfile(session.token)
      .then(setProfile)
      .catch((err: Error) => setError(err.message));
  }, [session]);

  if (status !== "signed-in" || !session) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
        <p className="text-lg font-semibold">Sign in to see your profile</p>
        <p className="text-sm text-muted-foreground">
          Connect your wallet from the top right to track your achievements.
        </p>
      </div>
    );
  }

  const unlocked = new Set(profile?.achievements ?? []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
          {session.walletPubkey.slice(0, 2)}
        </div>
        <h1 className="font-mono text-lg font-semibold">
          {session.walletPubkey.slice(0, 6)}…{session.walletPubkey.slice(-6)}
        </h1>
        {profile && (
          <p className="text-xs text-muted-foreground">
            Playing since {new Date(profile.created_at).toLocaleDateString()}
          </p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Achievements
          </h2>
          <span className="text-xs text-muted-foreground">
            {unlocked.size} / {ACHIEVEMENT_CATALOG.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACHIEVEMENT_CATALOG.map((a, i) => {
            const isUnlocked = unlocked.has(a.key);
            return (
              <motion.div
                key={a.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card
                  className={cn(
                    "flex h-full flex-col items-center gap-1.5 p-4 text-center",
                    !isUnlocked && "opacity-50",
                  )}
                >
                  <span className="text-3xl">{isUnlocked ? a.emoji : "🔒"}</span>
                  <span className="text-xs font-semibold">
                    {isUnlocked ? a.label : "Locked"}
                  </span>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {isUnlocked ? a.description : "Keep predicting to unlock this one."}
                  </p>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {!profile && !error && (
        <p className="text-center text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
