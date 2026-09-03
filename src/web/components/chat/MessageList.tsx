import { RefObject } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Message, StreamingToolState } from '../../types.js';
import { Welcome } from './Welcome.js';
import { MessageBubble } from './MessageBubble.js';
import { ThinkingRow } from './ThinkingRow.js';

export function MessageList({
  mainScrollRef,
  chatEndRef,
  onScroll,
  isFreshChat,
  visibleHistory,
  streamingContent,
  streamingTool,
  isGenerating,
  currentSessionId,
  starters,
  startersLoading,
  onPickStarter,
  onRetry,
}: {
  mainScrollRef: RefObject<HTMLElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  isFreshChat: boolean;
  visibleHistory: Message[];
  streamingContent: string;
  streamingTool: StreamingToolState | null;
  isGenerating: boolean;
  currentSessionId: string | null;
  starters: string[];
  startersLoading: boolean;
  onPickStarter: (prompt: string) => void;
  onRetry: () => void;
}) {
  return (
    <main
      ref={mainScrollRef as any}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto overscroll-contain"
    >
      {isFreshChat ? (
        <Welcome onPick={onPickStarter} starters={starters} loading={startersLoading} />
      ) : (
        <div className="mx-auto w-full max-w-[46rem] px-4 sm:px-6 py-7 pb-44 flex flex-col gap-6">
          {visibleHistory.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {/* Active Streaming Content */}
          {streamingContent && (
            <MessageBubble msg={{ role: 'assistant', content: streamingContent, isTemp: true }} />
          )}

          {/* Active Streaming Tool */}
          {streamingTool && (
            <MessageBubble msg={{ role: 'tool', name: streamingTool.name, content: streamingTool.args, isTemp: true }} />
          )}

          {isGenerating && !streamingContent && !streamingTool && <ThinkingRow />}

          {/* Retry Turn Button (W-5) */}
          {!isGenerating && visibleHistory.length >= 2 && currentSessionId && visibleHistory[visibleHistory.length - 1]?.role === 'assistant' && (
            <div className="flex justify-end pt-1">
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-ink-subtle hover:text-ink hover:bg-raised border border-line transition-colors"
                title="Retry last turn"
              >
                <RotateCcw size={13} />
                Retry turn
              </button>
            </div>
          )}

          <div ref={chatEndRef as any} />
        </div>
      )}
    </main>
  );
}
