import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { MODEL_PICKER_CONFIG } from "../data/model-picker";
import type { ModelPickerEntry } from "../data/model-picker";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (modelId: string) => void;
  availableModelIds: string[];
}

export function ModelPickerModal({ open, onClose, onSelect, availableModelIds }: Props) {
  const [selected, setSelected] = useState<ModelPickerEntry | null>(null);

  function handleClose() {
    setSelected(null);
    onClose();
  }

  function handleSelect(id: string) {
    setSelected(null);
    onSelect(id);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-xl w-full p-0 overflow-hidden">
        {selected === null ? (
          /* Step 1 — Intent selection */
          <div className="p-6">
            <DialogHeader className="mb-5">
              <DialogTitle>Help me choose a model</DialogTitle>
              <p className="text-sm text-[#6F6B66] mt-1">
                What are you working on?
              </p>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              {MODEL_PICKER_CONFIG.map((entry) => (
                <button
                  key={entry.intent}
                  onClick={() => setSelected(entry)}
                  className="text-left border border-[#E5E1DB] rounded-xl p-4 hover:border-[#C15F3C] hover:bg-[#FBF8F4] transition-colors group"
                >
                  <div className="font-medium text-[#2D2B28] group-hover:text-[#C15F3C] transition-colors mb-2">
                    {entry.intent}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F3EE] text-[#6F6B66] border border-[#E5E1DB]">
                      {entry.tags.difficulty}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F3EE] text-[#6F6B66] border border-[#E5E1DB]">
                      {entry.tags.latency_pref}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Step 2 — Recommendations */
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={() => setSelected(null)}
                className="text-[#6F6B66] hover:text-[#2D2B28] transition-colors shrink-0"
                aria-label="Back"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <DialogHeader className="flex-1 min-w-0">
                <DialogTitle className="truncate">{selected.intent}</DialogTitle>
                <p className="text-sm text-[#6F6B66] mt-0.5">
                  {selected.tags.difficulty} · {selected.tags.latency_pref}
                </p>
              </DialogHeader>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selected.recommendations.map((rec) => {
                const available = availableModelIds.includes(rec.id);
                return (
                  <div
                    key={rec.id}
                    className="border border-[#E5E1DB] rounded-xl p-4 flex flex-col gap-3"
                  >
                    {/* Badge row */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          rec.type === "Local"
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {rec.type === "Local" ? "Local GPU" : "Cloud"}
                      </span>
                      {!available && (
                        <span className="text-xs text-[#B1ADA1]">not loaded</span>
                      )}
                    </div>

                    {/* Model info */}
                    <div className="flex-1">
                      <div className="font-semibold text-[#2D2B28] text-sm leading-snug">
                        {rec.name}
                      </div>
                      <div className="text-xs text-[#6F6B66] mt-0.5">{rec.provider}</div>
                      <div className="font-mono text-xs text-[#2D2B28] bg-[#F4F3EE] rounded px-1.5 py-0.5 mt-2 truncate">
                        {rec.id}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6F6B66]">
                      <span>
                        <span className="font-medium text-[#2D2B28]">Cost:</span>{" "}
                        {rec.cost_per_1M === "$0.00" ? "Free" : `${rec.cost_per_1M}/1M tokens`}
                      </span>
                      {rec.vram_required && (
                        <span>
                          <span className="font-medium text-[#2D2B28]">VRAM:</span>{" "}
                          {rec.vram_required}
                        </span>
                      )}
                    </div>

                    {/* Why */}
                    <p className="text-xs text-[#6F6B66] leading-relaxed border-t border-[#E5E1DB] pt-2">
                      {rec.why}
                    </p>

                    {/* CTA */}
                    <Button
                      size="sm"
                      variant={available ? "primary" : "secondary"}
                      className="w-full"
                      onClick={() => handleSelect(rec.id)}
                    >
                      Use this model
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
