import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { modelPicker } from "../lib/api";
import type {
  ModelPickerResponse,
  ModelPickerIntent,
  ModelPickerLocalRec,
  ModelPickerCloudRec,
} from "../lib/api";
import { MODEL_PICKER_CONFIG } from "../data/model-picker";

export interface PickedModelMeta {
  costPerMillionTokens: number;
  ownedBy: string;
  visionSupport: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (modelId: string, meta: PickedModelMeta) => void;
  availableModelIds: string[];
}

type SpeedPref = "instant" | "quality";
type PrivacyPref = "anywhere" | "local-only";
type Step = 1 | 2 | 3;

// ── Static fallback (used when backend is unavailable) ────────────────────

function toFallbackIntent(entry: (typeof MODEL_PICKER_CONFIG)[0]): ModelPickerIntent {
  const cloud = entry.recommendations.find((r) => r.type === "Cloud");
  const local = entry.recommendations.find((r) => r.type === "Local");
  return {
    id: entry.intent.toLowerCase().replace(/\W+/g, "-"),
    label: entry.intent,
    tags: entry.tags,
    cloud: {
      type: "cloud",
      id: cloud?.id ?? "",
      name: cloud?.name ?? "",
      provider: cloud?.provider ?? "",
      cost_per_1m: cloud?.cost_per_1M ?? "$0.00",
      cost_per_1m_input_usd: 0,
      cost_per_1m_output_usd: 0,
      context_length: null,
      benchmark_score: null,
      benchmark_label: "",
      in_catalog: false,
      why: cloud?.why ?? "",
    },
    local: local
      ? {
          type: "local",
          id: local.id,
          name: local.name,
          provider: local.provider,
          cost_per_1m: "$0.00",
          vram_required_gb: parseFloat(local.vram_required?.split(" ")[0] ?? "0"),
          vram_spare_gb: 0,
          params_b: 0,
          tokens_per_sec: 0,
          daily_electricity_cost: 0,
          available: false,
          why: local.why,
        }
      : null,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[#6F6B66] hover:text-[#2D2B28] transition-colors shrink-0"
      aria-label="Back"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-4">
      {([1, 2, 3] as Step[]).map((s) => (
        <div
          key={s}
          className={`rounded-full transition-all ${
            s === step
              ? "w-4 h-1.5 bg-[#C15F3C]"
              : s < step
              ? "w-1.5 h-1.5 bg-[#C15F3C]/40"
              : "w-1.5 h-1.5 bg-[#E5E1DB]"
          }`}
        />
      ))}
    </div>
  );
}

function CloudCard({
  rec,
  onSelect,
}: {
  rec: ModelPickerCloudRec;
  onSelect: (meta: PickedModelMeta) => void;
}) {
  return (
    <div className="border border-[#E5E1DB] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          Cloud
        </span>
        {!rec.in_catalog && (
          <span className="text-xs text-[#B1ADA1]">not configured</span>
        )}
      </div>

      <div>
        <div className="font-semibold text-[#2D2B28] text-sm leading-snug">{rec.name}</div>
        <div className="text-xs text-[#6F6B66] mt-0.5">{rec.provider}</div>
        <div className="font-mono text-xs text-[#2D2B28] bg-[#F4F3EE] rounded px-1.5 py-0.5 mt-2 truncate">
          {rec.id}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6F6B66]">
        <span>
          <span className="font-medium text-[#2D2B28]">Cost:</span>{" "}
          {rec.cost_per_1m === "$0.00 / $0.00"
            ? "Free"
            : `${rec.cost_per_1m} / 1M tokens`}
        </span>
        {rec.context_length && (
          <span>
            <span className="font-medium text-[#2D2B28]">Context:</span>{" "}
            {(rec.context_length / 1000).toFixed(0)}k tokens
          </span>
        )}
        {rec.benchmark_score !== null && rec.benchmark_label && (
          <span>
            <span className="font-medium text-[#2D2B28]">{rec.benchmark_label}:</span>{" "}
            {typeof rec.benchmark_score === "number"
              ? `${rec.benchmark_score.toFixed(1)}%`
              : rec.benchmark_score}
          </span>
        )}
      </div>

      <p className="text-xs text-[#6F6B66] leading-relaxed border-t border-[#E5E1DB] pt-2">
        {rec.why}
      </p>

      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        onClick={() =>
          onSelect({
            // Use weighted avg (3:1 input:output) to match the billing display
            costPerMillionTokens: rec.cost_per_1m_input_usd * 0.75 + rec.cost_per_1m_output_usd * 0.25,
            ownedBy: "openrouter",
            visionSupport: false,
          })
        }
      >
        Use this model
      </Button>
    </div>
  );
}

function LocalCard({
  rec,
  gpuVramGb,
  currency,
  onSelect,
}: {
  rec: ModelPickerLocalRec;
  gpuVramGb: number;
  currency?: string;
  onSelect: (meta: PickedModelMeta) => void;
}) {
  const fits = rec.vram_required_gb <= gpuVramGb;
  const curr = currency ?? "NZD";
  return (
    <div className="border border-[#E5E1DB] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
          Local GPU
        </span>
        <span
          className={`text-xs font-medium ${
            rec.available ? "text-green-600" : "text-[#B1ADA1]"
          }`}
        >
          {rec.available ? "loaded" : "not loaded"}
        </span>
      </div>

      <div>
        <div className="font-semibold text-[#2D2B28] text-sm leading-snug">{rec.name}</div>
        <div className="text-xs text-[#6F6B66] mt-0.5">{rec.provider}</div>
        <div className="font-mono text-xs text-[#2D2B28] bg-[#F4F3EE] rounded px-1.5 py-0.5 mt-2 truncate">
          {rec.id}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#6F6B66]">
        <span>
          <span className="font-medium text-[#2D2B28]">Cost:</span> Free
        </span>
        {rec.vram_required_gb > 0 && (
          <span>
            <span className="font-medium text-[#2D2B28]">VRAM:</span>{" "}
            {rec.vram_required_gb} GB
            {fits && rec.vram_spare_gb > 0 && (
              <span className="text-green-600"> ({rec.vram_spare_gb} GB spare)</span>
            )}
          </span>
        )}
        {rec.tokens_per_sec > 0 && (
          <span>
            <span className="font-medium text-[#2D2B28]">Speed:</span>{" "}
            ~{rec.tokens_per_sec} tok/s
          </span>
        )}
        {rec.daily_electricity_cost > 0 && (
          <span>
            <span className="font-medium text-[#2D2B28]">Electricity:</span>{" "}
            ~{curr === "NZD" ? "NZ" : ""}${rec.daily_electricity_cost.toFixed(2)}/day
          </span>
        )}
      </div>

      <p className="text-xs text-[#6F6B66] leading-relaxed border-t border-[#E5E1DB] pt-2">
        {rec.why}
      </p>

      <Button
        size="sm"
        variant={rec.available ? "primary" : "secondary"}
        className="w-full"
        onClick={() =>
          onSelect({ costPerMillionTokens: 0, ownedBy: "local", visionSupport: false })
        }
      >
        Use this model
      </Button>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────

export function ModelPickerModal({ open, onClose, onSelect, availableModelIds }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [selectedIntent, setSelectedIntent] = useState<ModelPickerIntent | null>(null);
  const [speedPref, setSpeedPref] = useState<SpeedPref>("quality");
  const [privacyPref, setPrivacyPref] = useState<PrivacyPref>("anywhere");

  const [data, setData] = useState<ModelPickerResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch live data when modal opens
  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    modelPicker
      .getRecommendations()
      .then(setData)
      .catch(() => {/* silently fall back to static data */})
      .finally(() => setLoading(false));
  }, [open, data]);

  // Derive intents: live data if available, static fallback otherwise
  const intents: ModelPickerIntent[] =
    data?.intents ?? MODEL_PICKER_CONFIG.map(toFallbackIntent);

  const gpuVramGb = data?.gpu_vram_gb ?? 16;
  const isLive = !!data;

  function reset() {
    setStep(1);
    setSelectedIntent(null);
    setSpeedPref("quality");
    setPrivacyPref("anywhere");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSelect(id: string, meta: PickedModelMeta) {
    reset();
    onSelect(id, meta);
  }

  // Which recommendations to show on step 3
  const showCloud = privacyPref === "anywhere";
  const showLocal = true; // always show local option

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl w-full p-0 overflow-hidden">
        <div className="p-6">
          <StepDots step={step} />

          {/* ── Step 1: Goal ─────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <DialogHeader className="mb-5">
                <DialogTitle>Help me choose a model</DialogTitle>
                <p className="text-sm text-[#6F6B66] mt-1">
                  What are you working on?
                  {isLive && (
                    <span className="ml-1.5 text-xs text-green-600">● live pricing</span>
                  )}
                  {loading && (
                    <span className="ml-1.5 text-xs text-[#B1ADA1]">loading…</span>
                  )}
                </p>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {intents.map((intent) => (
                  <button
                    key={intent.id}
                    onClick={() => {
                      setSelectedIntent(intent);
                      setStep(2);
                    }}
                    className="text-left border border-[#E5E1DB] rounded-xl p-4 hover:border-[#C15F3C] hover:bg-[#FBF8F4] transition-colors group"
                  >
                    <div className="font-medium text-[#2D2B28] group-hover:text-[#C15F3C] transition-colors mb-2">
                      {intent.label}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F3EE] text-[#6F6B66] border border-[#E5E1DB]">
                        {intent.tags.difficulty}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F3EE] text-[#6F6B66] border border-[#E5E1DB]">
                        {intent.tags.latency_pref}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Step 2: Speed ─────────────────────────────────────────── */}
          {step === 2 && selectedIntent && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <BackButton onClick={() => setStep(1)} />
                <DialogHeader className="flex-1 min-w-0">
                  <DialogTitle>How fast do you need it?</DialogTitle>
                  <p className="text-sm text-[#6F6B66] mt-0.5">{selectedIntent.label}</p>
                </DialogHeader>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    {
                      value: "quality" as SpeedPref,
                      label: "Best quality",
                      sub: "I'll wait for a great answer",
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ),
                    },
                    {
                      value: "instant" as SpeedPref,
                      label: "Instant",
                      sub: "Fast response, lower latency",
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                      ),
                    },
                  ] as const
                ).map(({ value, label, sub, icon }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setSpeedPref(value);
                      setStep(3);
                    }}
                    className="flex items-start gap-3 border border-[#E5E1DB] rounded-xl p-4 hover:border-[#C15F3C] hover:bg-[#FBF8F4] transition-colors text-left group"
                  >
                    <span className="text-[#6F6B66] group-hover:text-[#C15F3C] mt-0.5 shrink-0">
                      {icon}
                    </span>
                    <div>
                      <div className="font-medium text-[#2D2B28] group-hover:text-[#C15F3C]">
                        {label}
                      </div>
                      <div className="text-xs text-[#6F6B66] mt-0.5">{sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Step 3: Privacy + Results ─────────────────────────────── */}
          {step === 3 && selectedIntent && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <BackButton onClick={() => setStep(2)} />
                <DialogHeader className="flex-1 min-w-0">
                  <DialogTitle className="truncate">{selectedIntent.label}</DialogTitle>
                  <p className="text-sm text-[#6F6B66] mt-0.5">
                    {selectedIntent.tags.difficulty} ·{" "}
                    {speedPref === "instant" ? "Instant response" : "High quality"}
                  </p>
                </DialogHeader>
              </div>

              {/* Privacy toggle */}
              <div className="flex items-center gap-2 mb-4 p-2 bg-[#F4F3EE] rounded-lg">
                {(
                  [
                    { value: "anywhere" as PrivacyPref, label: "Cloud + Local" },
                    { value: "local-only" as PrivacyPref, label: "Local only (privacy)" },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setPrivacyPref(value)}
                    className={`flex-1 text-xs py-1.5 px-2 rounded-md font-medium transition-colors ${
                      privacyPref === value
                        ? "bg-white text-[#2D2B28] shadow-sm border border-[#E5E1DB]"
                        : "text-[#6F6B66] hover:text-[#2D2B28]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Recommendation cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {showCloud && (
                  <CloudCard
                    rec={selectedIntent.cloud}
                    onSelect={(meta) => handleSelect(selectedIntent.cloud.id, meta)}
                  />
                )}
                {showLocal && selectedIntent.local ? (
                  <LocalCard
                    rec={selectedIntent.local}
                    gpuVramGb={gpuVramGb}
                    onSelect={(meta) => handleSelect(selectedIntent.local!.id, meta)}
                  />
                ) : showLocal && !selectedIntent.local ? (
                  <div className="border border-dashed border-[#E5E1DB] rounded-xl p-4 flex items-center justify-center text-center">
                    <p className="text-xs text-[#B1ADA1]">
                      No local model fits in {gpuVramGb} GB VRAM for this task.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Data source badge */}
              <p className="text-xs text-[#B1ADA1] text-center mt-3">
                {isLive
                  ? `Pricing live from OpenRouter${
                      data?.cache_age_seconds != null
                        ? ` · cached ${Math.floor(data.cache_age_seconds / 60)}m ago`
                        : ""
                    }${data?.benchmarks_enabled ? " · benchmarks from Artificial Analysis" : ""}`
                  : "Using cached recommendations — backend unavailable"}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
