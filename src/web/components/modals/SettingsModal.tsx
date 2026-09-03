import { Settings, ChevronDown, AlertTriangle } from 'lucide-react';

export function SettingsModal({
  open,
  onClose,
  providers,
  modalProvider,
  setModalProvider,
  modalBaseUrl,
  setModalBaseUrl,
  modalModel,
  setModalModel,
  availableModels,
  isSavingConfig,
  onFetchModels,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  providers: Record<string, { label: string; defaultUrl: string }>;
  modalProvider: string;
  setModalProvider: (val: string) => void;
  modalBaseUrl: string;
  setModalBaseUrl: (val: string) => void;
  modalModel: string;
  setModalModel: (val: string) => void;
  availableModels: string[];
  isSavingConfig: boolean;
  onFetchModels: (provider: string, baseUrl?: string) => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/45 dark:bg-black/65 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-modal="true"
        className="pop w-full sm:max-w-md bg-raised border border-line rounded-t-2xl sm:rounded-2xl shadow-panel overflow-hidden"
      >
        <div className="p-5 sm:p-6 pb-4">
          <div className="flex items-center gap-3 mb-5">
            <span className="h-9 w-9 shrink-0 rounded-lg bg-accent-soft border border-accent-line flex items-center justify-center">
              <Settings size={17} className="text-accent" />
            </span>
            <h2 className="text-[17px] font-semibold tracking-tight">Model Settings</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-ink mb-1.5">Provider</label>
              <div className="relative">
                <select
                  value={modalProvider}
                  onChange={(e) => {
                    const p = e.target.value;
                    setModalProvider(p);
                    setModalBaseUrl(providers[p]?.defaultUrl || '');
                    onFetchModels(p, providers[p]?.defaultUrl);
                  }}
                  className="w-full h-10 pl-3 pr-9 rounded-xl bg-surface border border-line focus:border-accent focus:ring-4 focus:ring-accent/15 outline-none text-[14px] text-ink appearance-none cursor-pointer"
                >
                  {Object.entries(providers).map(([key, data]) => (
                    <option key={key} value={key}>
                      {data.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-ink mb-1.5 flex justify-between">
                <span>Base URL (Port)</span>
                <button
                  className="text-accent hover:underline text-xs"
                  onClick={() => onFetchModels(modalProvider, modalBaseUrl)}
                  title="Refresh models"
                >
                  Refresh
                </button>
              </label>
              <input
                type="text"
                value={modalBaseUrl}
                onChange={(e) => setModalBaseUrl(e.target.value)}
                onBlur={() => onFetchModels(modalProvider, modalBaseUrl)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onFetchModels(modalProvider, modalBaseUrl);
                }}
                className="w-full h-10 px-3 rounded-xl bg-surface border border-line focus:border-accent focus:ring-4 focus:ring-accent/15 outline-none text-[14px] text-ink font-mono"
                placeholder="http://localhost:..."
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-ink mb-1.5">Model</label>
              <div className="relative">
                <select
                  value={modalModel}
                  onChange={(e) => setModalModel(e.target.value)}
                  className="w-full h-10 pl-3 pr-9 rounded-xl bg-surface border border-line focus:border-accent focus:ring-4 focus:ring-accent/15 outline-none text-[14px] text-ink disabled:opacity-50 appearance-none cursor-pointer"
                  disabled={availableModels.length === 0}
                >
                  {availableModels.length === 0 && <option value="">No models found...</option>}
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
                />
              </div>
              {availableModels.length === 0 && (
                <p className="mt-2 text-xs text-warn flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  Make sure {modalProvider === 'ollama' ? 'Ollama' : 'LM Studio'} is running locally.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line bg-surface/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm font-medium text-ink-muted hover:text-ink hover:bg-raised transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSavingConfig || !modalModel}
            className="h-9 px-4 rounded-lg text-sm font-medium bg-accent text-accent-ink hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSavingConfig && (
              <span className="ring-spin h-3.5 w-3.5 border-accent-ink border-t-transparent" />
            )}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
