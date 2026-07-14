"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { useCountdown } from "@/lib/use-countdown";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative h-10 w-10 overflow-hidden rounded-md bg-foreground/5">
        <motion.span
          key={value}
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold tabular-nums"
        >
          {pad(value)}
        </motion.span>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function Countdown({
  targetIso,
  className,
}: {
  targetIso: string;
  className?: string;
}) {
  const { days, hours, minutes, seconds, isPast } = useCountdown(targetIso);

  if (isPast) {
    return (
      <span className={cn("text-sm font-semibold text-live", className)}>
        Kickoff has passed
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Unit value={days} label="days" />
      <span className="pb-4 text-muted-foreground">:</span>
      <Unit value={hours} label="hrs" />
      <span className="pb-4 text-muted-foreground">:</span>
      <Unit value={minutes} label="min" />
      <span className="pb-4 text-muted-foreground">:</span>
      <Unit value={seconds} label="sec" />
    </div>
  );
}
