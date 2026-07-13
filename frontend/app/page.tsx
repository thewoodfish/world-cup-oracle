import { WalletButton } from "./wallet-button";
import { MatchList } from "./match-list";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-background">
      <main className="flex w-full max-w-2xl flex-1 flex-col items-center gap-10 px-6 py-20">
        <header className="flex w-full flex-col items-center gap-4 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            Live · Powered by TxLINE
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            World Cup Oracle
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            Predict outcomes, scorelines, key moments and player performances —
            then watch your score move live as the match plays.
          </p>
          <WalletButton />
        </header>

        <section className="flex w-full flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Matches
          </h2>
          <MatchList />
        </section>
      </main>
    </div>
  );
}
