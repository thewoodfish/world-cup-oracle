"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { WalletButton } from "@/app/wallet-button";

const LINKS = [
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
];

export function NavHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-1.5 font-bold tracking-tight">
          <span aria-hidden>⚽</span>
          <span className="hidden sm:inline">World Cup Oracle</span>
        </Link>
        <nav className="ml-2 flex items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
