"use client";

import { motion } from "framer-motion";
import { Radio, Sparkles, Target, TrendingUp, Trophy, Wallet } from "lucide-react";

import { HeroBackground } from "@/components/hero-background";
import { WalletButton } from "./wallet-button";
import { MatchList } from "./match-list";

const STEPS = [
  {
    icon: Wallet,
    title: "Connect",
    body: "Sign in with your Solana wallet — no crypto knowledge required.",
  },
  {
    icon: Target,
    title: "Predict",
    body: "Outcome, scoreline, key moments, player performance — before kickoff.",
  },
  {
    icon: TrendingUp,
    title: "Watch it move",
    body: "Your score updates live as TxLINE streams every real match event.",
  },
];

const STATS = [
  { icon: Radio, label: "Real-time via TxLINE" },
  { icon: Target, label: "4 prediction types" },
  { icon: Trophy, label: "Achievements & leaderboard" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-background">
      <main className="flex w-full max-w-2xl flex-1 flex-col items-center gap-16 px-6 py-20">
        <header className="relative flex w-full flex-col items-center gap-4 text-center">
          <HeroBackground />

          <motion.span
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Live · Powered by TxLINE
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="flex items-center gap-3 text-4xl font-bold tracking-tight text-foreground"
          >
            World Cup Oracle
            <motion.span
              className="animate-float-ball inline-block text-3xl"
              aria-hidden
            >
              ⚽
            </motion.span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-md text-lg text-muted-foreground"
          >
            Predict outcomes, scorelines, key moments and player performances —
            then watch your score move live as the match plays.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <WalletButton />
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          >
            {STATS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              >
                <Icon className="h-3.5 w-3.5 text-primary" />
                {label}
              </li>
            ))}
          </motion.ul>
        </header>

        <section className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
              whileHover={{ y: -2 }}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <step.icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
              </div>
              <span className="font-semibold">{step.title}</span>
              <p className="text-xs text-muted-foreground">{step.body}</p>
            </motion.div>
          ))}
        </section>

        <section className="flex w-full flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Matches
          </h2>
          <MatchList />
        </section>
      </main>
    </div>
  );
}
