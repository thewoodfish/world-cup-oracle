export function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="hero-blob-a absolute left-1/4 top-0 h-72 w-72 rounded-full bg-primary/30 blur-3xl"
        aria-hidden
      />
      <div
        className="hero-blob-b absolute right-1/4 top-20 h-64 w-64 rounded-full bg-accent/25 blur-3xl"
        aria-hidden
      />
      <svg
        className="hero-pitch-lines absolute inset-x-0 top-0 h-full w-full opacity-60"
        aria-hidden
      >
        <defs>
          <pattern
            id="pitch-grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M40 0H0V40"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.06"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pitch-grid)" />
      </svg>
    </div>
  );
}
