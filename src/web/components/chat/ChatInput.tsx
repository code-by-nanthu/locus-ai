import { RefObject } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function ChatInput({
  inputRef,
  input,
  setInput,
  isGenerating,
  onSend,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (val: string) => void;
  isGenerating: boolean;
  onSend: () => void;
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
      <div className="h-10 bg-gradient-to-t from-canvas to-transparent" />
      <div className="bg-canvas px-4 sm:px-6 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[46rem] pointer-events-auto">
          <div
            className={cn(
              "relative rounded-[1.375rem] bg-raised border shadow-lift transition-[border-color,box-shadow] duration-150",
              isGenerating
                ? "border-line"
                : "border-line-strong focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/12"
            )}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Ask anything, or describe a task to run"
              disabled={isGenerating}
              rows={1}
              className="block w-full max-h-[200px] min-h-[52px] resize-none bg-transparent rounded-[1.375rem] py-[15px] pl-4 pr-14 text-[15px] leading-6 outline-none placeholder:text-ink-subtle disabled:opacity-50"
              style={{ height: '52px' }}
            />
            <button
              onClick={onSend}
              disabled={!input.trim() || isGenerating}
              aria-label="Send message"
              className={cn(
                "absolute right-2 bottom-2 h-9 w-9 inline-flex items-center justify-center rounded-full transition-all",
                "bg-accent text-accent-ink hover:bg-accent-hover active:scale-95",
                "disabled:bg-surface disabled:text-ink-subtle disabled:active:scale-100"
              )}
            >
              {isGenerating ? (
                <span className="spinner h-4 w-4" />
              ) : (
                <ArrowUp size={17} strokeWidth={2.5} />
              )}
            </button>
          </div>

          <div className="mt-2 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-ink-subtle">
            <span className="inline-flex items-center gap-1.5">
              <span className="kbd">Enter</span> to send
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="kbd">Shift</span>
              <span className="kbd">Enter</span> for a new line
            </span>
            <span className="hidden sm:inline">Commands need your approval before they run</span>
          </div>
        </div>
      </div>
    </div>
  );
}
