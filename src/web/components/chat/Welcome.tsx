import { ChevronRight } from 'lucide-react';

export function Welcome({
  onPick,
  starters,
  loading,
}: {
  onPick: (text: string) => void;
  starters: string[];
  loading: boolean;
}) {
  return (
    <div className="min-h-full flex items-center justify-center px-5 pb-44 pt-10">
      <div className="w-full max-w-[36rem] text-center rise">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-canvas font-mono text-base">
          &gt;_
        </span>
        <h2 className="mt-5 text-[26px] sm:text-[30px] font-semibold tracking-[-0.02em] leading-tight flex items-center justify-center gap-3">
          What are we working on?
          {loading && <span className="spinner h-5 w-5 border-ink/30 border-t-ink/100 mt-1" />}
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
          Locus reads your files and runs commands on this machine. You approve
          anything that touches the system.
        </p>

        <div className="mt-7 grid gap-2 sm:grid-cols-2 text-left">
          {starters.map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(s)}
              className="group h-full px-3.5 py-3 rounded-xl bg-raised border border-line hover:border-line-strong transition-colors flex items-start justify-between gap-3"
            >
              <span className="text-[13px] leading-snug text-ink-muted group-hover:text-ink transition-colors">
                {s}
              </span>
              <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
