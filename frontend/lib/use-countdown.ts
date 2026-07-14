"use client";

import { useEffect, useState } from "react";

export type CountdownParts = {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
};

function computeParts(targetMs: number): CountdownParts {
  const totalMs = targetMs - Date.now();
  const isPast = totalMs <= 0;
  const abs = Math.abs(totalMs);
  return {
    totalMs,
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1000),
    isPast,
  };
}

export function useCountdown(targetIso: string): CountdownParts {
  const targetMs = new Date(targetIso).getTime();
  const [parts, setParts] = useState<CountdownParts>(() => computeParts(targetMs));

  useEffect(() => {
    const id = setInterval(() => setParts(computeParts(targetMs)), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  return parts;
}
