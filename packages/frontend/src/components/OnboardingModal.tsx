import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui";
import type { HealthResponse } from "../lib/api";

interface OnboardingModalProps {
  open: boolean;
  role: "admin" | "user";
  nodeName: string;
  health: HealthResponse | null;
  billingEnabled: boolean;
  onComplete: () => void;
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mt-4">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`inline-block rounded-full transition-all duration-200 ${
            i === current
              ? "w-4 h-2 bg-[#C15F3C]"
              : "w-2 h-2 bg-[#E5E1DB]"
          }`}
        />
      ))}
    </div>
  );
}

function AdminOnboarding({
  nodeName,
  health,
  billingEnabled,
  onComplete,
}: {
  nodeName: string;
  health: HealthResponse | null;
  billingEnabled: boolean;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const inferenceEnabled = health?.services?.includes("inference") ?? true;
  const renderEnabled = health?.services?.includes("render") ?? false;

  const steps = [
    {
      title: "Welcome, Admin",
      content: (
        <div className="space-y-3 text-sm text-[#6F6B66]">
          <p>
            You're the administrator of <strong className="text-[#2D2B28]">{nodeName}</strong>.
            GPUShare turns your GPU into a shared compute node that trusted users can access for AI inference and 3D rendering.
          </p>
          <p>
            Usage is billed at electricity cost — no markup, no subscriptions.
            Everyone pays only for the power their jobs consume.
          </p>
        </div>
      ),
    },
    {
      title: "Electricity-Based Pricing",
      content: (
        <div className="space-y-3 text-sm text-[#6F6B66]">
          <p>
            All costs are derived from your electricity rate. Set the{" "}
            <code className="bg-[#F4F3EE] px-1 py-0.5 rounded text-xs text-[#2D2B28]">
              ELECTRICITY_RATE_KWH
            </code>{" "}
            environment variable to your local rate (in your currency) to keep pricing accurate.
          </p>
          {billingEnabled ? (
            <div className="bg-[#E8F5E9] border border-[#C8E6C9] rounded-lg p-3">
              <p className="text-[#2E7D32] font-medium text-xs">Billing is enabled</p>
              <p className="text-[#4CAF50] text-xs mt-0.5">
                Stripe is connected. Users can top up their balance and get charged automatically.
              </p>
            </div>
          ) : (
            <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-lg p-3">
              <p className="text-[#F57F17] font-medium text-xs">Billing is disabled</p>
              <p className="text-[#F9A825] text-xs mt-0.5">
                Configure <code className="text-xs">STRIPE_SECRET_KEY</code> and{" "}
                <code className="text-xs">BILLING_ENABLED=true</code> to enable billing.
                Until then, adjust user balances manually from the Admin panel.
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Adding Users",
      content: (
        <div className="space-y-3 text-sm text-[#6F6B66]">
          <p>
            Control who can join from the{" "}
            <strong className="text-[#2D2B28]">Admin panel</strong>. You can:
          </p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-[#C15F3C] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[9px] font-bold">1</span>
              </span>
              <span>
                Create <strong className="text-[#2D2B28]">invite links</strong> to share with specific people
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-[#C15F3C] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[9px] font-bold">2</span>
              </span>
              <span>
                <strong className="text-[#2D2B28]">Approve or reject</strong> signup requests when <code className="text-xs bg-[#F4F3EE] px-1 rounded">REQUIRE_APPROVAL=true</code>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-[#C15F3C] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[9px] font-bold">3</span>
              </span>
              <span>
                <strong className="text-[#2D2B28]">Adjust balances</strong> and set spending limits per user
              </span>
            </li>
          </ul>
        </div>
      ),
    },
    {
      title: "Available Services",
      content: (
        <div className="space-y-3 text-sm text-[#6F6B66]">
          <p>Your node currently provides:</p>
          <div className="space-y-2">
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${inferenceEnabled ? "border-[#C8E6C9] bg-[#E8F5E9]" : "border-[#E5E1DB] bg-[#F4F3EE] opacity-60"}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${inferenceEnabled ? "bg-[#4CAF50]" : "bg-[#B1ADA1]"}`} />
              <div>
                <p className={`font-medium text-xs ${inferenceEnabled ? "text-[#2E7D32]" : "text-[#6F6B66]"}`}>
                  AI Inference {inferenceEnabled ? "(active)" : "(disabled)"}
                </p>
                <p className="text-xs text-[#6F6B66] mt-0.5">
                  Chat with local Ollama models or cloud models via OpenRouter
                </p>
              </div>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${renderEnabled ? "border-[#C8E6C9] bg-[#E8F5E9]" : "border-[#E5E1DB] bg-[#F4F3EE] opacity-60"}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${renderEnabled ? "bg-[#4CAF50]" : "bg-[#B1ADA1]"}`} />
              <div>
                <p className={`font-medium text-xs ${renderEnabled ? "text-[#2E7D32]" : "text-[#6F6B66]"}`}>
                  3D Rendering {renderEnabled ? "(active)" : "(disabled)"}
                </p>
                <p className="text-xs text-[#6F6B66] mt-0.5">
                  Upload Blender files and render frames using the GPU
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs">
            Enable or disable services per-user from the Admin panel, or globally via the{" "}
            <code className="bg-[#F4F3EE] px-1 rounded">SERVICES_ENABLED</code> env var.
          </p>
        </div>
      ),
    },
    {
      title: "You're all set",
      content: (
        <div className="space-y-3 text-sm text-[#6F6B66]">
          <p>Here's what to do next:</p>
          <div className="space-y-2">
            {[
              { label: "Create invite links for your users", to: "/admin" },
              { label: "Check system stats and GPU status", to: "/admin" },
              { label: "Configure your spending limits in Account", to: "/account" },
            ].map(({ label, to }) => (
              <div key={label} className="flex items-center gap-2">
                <svg viewBox="0 0 20 20" className="w-4 h-4 text-[#C15F3C] flex-shrink-0" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.172l7.879-7.879a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs pt-1">
            You can replay this guide anytime from <strong className="text-[#2D2B28]">Account → Onboarding</strong>.
          </p>
        </div>
      ),
      isLast: true,
    },
  ];

  const current = steps[step];
  const total = steps.length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{current.title}</DialogTitle>
        <DialogDescription asChild>
          <div className="mt-3">{current.content}</div>
        </DialogDescription>
      </DialogHeader>

      <StepDots total={total} current={step} />

      <div className="flex items-center justify-between mt-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onComplete}
          className="text-[#B1ADA1] hover:text-[#6F6B66] text-xs"
        >
          Skip
        </Button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {current.isLast ? (
            <Link to="/admin" onClick={onComplete}>
              <Button variant="primary" size="sm">
                Go to Admin
              </Button>
            </Link>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setStep(step + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function UserOnboarding({
  nodeName,
  health,
  billingEnabled,
  onComplete,
}: {
  nodeName: string;
  health: HealthResponse | null;
  billingEnabled: boolean;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const renderEnabled = health?.services?.includes("render") ?? false;

  const allSteps = [
    {
      id: "welcome",
      title: `Welcome to ${nodeName}`,
      content: (
        <div className="space-y-3 text-sm text-[#6F6B66]">
          <p>
            This is a private GPU compute node shared with trusted users. You can use it to:
          </p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-lg leading-none">💬</span>
              <span>
                <strong className="text-[#2D2B28]">Chat with AI models</strong> — run local
                Ollama models or access cloud models, all billed at electricity cost
              </span>
            </li>
            {renderEnabled && (
              <li className="flex items-start gap-2">
                <span className="text-lg leading-none">🎨</span>
                <span>
                  <strong className="text-[#2D2B28]">Render 3D files</strong> — upload Blender
                  scenes and get rendered frames back as a download
                </span>
              </li>
            )}
          </ul>
        </div>
      ),
    },
    ...(billingEnabled
      ? [
          {
            id: "billing",
            title: "Credits & Billing",
            content: (
              <div className="space-y-3 text-sm text-[#6F6B66]">
                <p>
                  Usage is billed at electricity rates — typically a few cents per chat session.
                  You'll need a positive balance to use the GPU.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-[#C15F3C] flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[9px] font-bold">1</span>
                    </span>
                    <span>Go to your <strong className="text-[#2D2B28]">Account page</strong></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-[#C15F3C] flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[9px] font-bold">2</span>
                    </span>
                    <span>Add a <strong className="text-[#2D2B28]">payment method</strong> or top up your balance</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-[#C15F3C] flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[9px] font-bold">3</span>
                    </span>
                    <span>Set a <strong className="text-[#2D2B28]">spending limit</strong> so you never overspend</span>
                  </div>
                </div>
                <p className="text-xs">
                  Your admin can also add credits to your account directly.
                </p>
              </div>
            ),
          },
        ]
      : []),
    {
      id: "chat",
      title: "Chat with AI",
      content: (
        <div className="space-y-3 text-sm text-[#6F6B66]">
          <p>
            The <strong className="text-[#2D2B28]">Chat page</strong> lets you talk to any
            available AI model. Models run locally on the GPU for privacy and low cost.
          </p>
          <div className="bg-[#F4F3EE] rounded-lg p-3 space-y-1.5">
            <p className="font-medium text-xs text-[#2D2B28]">Tips</p>
            <ul className="text-xs space-y-1">
              <li>— Pick a model from the selector in the top bar</li>
              <li>— Use <strong>Auto</strong> mode to route short prompts to a fast model and long ones to a powerful model</li>
              <li>— Your usage and cost appear in Account → Usage</li>
            </ul>
          </div>
        </div>
      ),
    },
    ...(renderEnabled
      ? [
          {
            id: "render",
            title: "3D Rendering",
            content: (
              <div className="space-y-3 text-sm text-[#6F6B66]">
                <p>
                  The <strong className="text-[#2D2B28]">Render page</strong> lets you submit
                  Blender scenes for GPU rendering. You get a download link when it's done.
                </p>
                <div className="bg-[#F4F3EE] rounded-lg p-3 space-y-1.5">
                  <p className="font-medium text-xs text-[#2D2B28]">How it works</p>
                  <ul className="text-xs space-y-1">
                    <li>— Upload a <code>.blend</code> file</li>
                    <li>— Set frame range, resolution, and render engine</li>
                    <li>— The GPU renders your frames and zips them</li>
                    <li>— Download the result via a 7-day link</li>
                  </ul>
                </div>
              </div>
            ),
          },
        ]
      : []),
    {
      id: "done",
      title: "You're ready",
      content: (
        <div className="space-y-3 text-sm text-[#6F6B66]">
          <p>That's everything you need to know. Here's a quick summary:</p>
          <div className="space-y-1.5">
            {[
              billingEnabled && "Add credits in Account before you start",
              "Select a model and start chatting in Chat",
              renderEnabled && "Upload .blend files to render on the GPU",
              "Track your usage and costs in Account",
            ]
              .filter(Boolean)
              .map((item) => (
                <div key={item as string} className="flex items-center gap-2">
                  <svg viewBox="0 0 20 20" className="w-4 h-4 text-[#C15F3C] flex-shrink-0" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.172l7.879-7.879a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>{item as string}</span>
                </div>
              ))}
          </div>
          <p className="text-xs pt-1">
            Replay this guide anytime from <strong className="text-[#2D2B28]">Account → Onboarding</strong>.
          </p>
        </div>
      ),
      isLast: true,
    },
  ];

  const current = allSteps[step];
  const total = allSteps.length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{current.title}</DialogTitle>
        <DialogDescription asChild>
          <div className="mt-3">{current.content}</div>
        </DialogDescription>
      </DialogHeader>

      <StepDots total={total} current={step} />

      <div className="flex items-center justify-between mt-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onComplete}
          className="text-[#B1ADA1] hover:text-[#6F6B66] text-xs"
        >
          Skip
        </Button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {current.isLast ? (
            <Link to="/chat" onClick={onComplete}>
              <Button variant="primary" size="sm">
                Start chatting
              </Button>
            </Link>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setStep(step + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export function OnboardingModal({
  open,
  role,
  nodeName,
  health,
  billingEnabled,
  onComplete,
}: OnboardingModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onComplete(); }}>
      <DialogContent className="max-w-md">
        {role === "admin" ? (
          <AdminOnboarding
            nodeName={nodeName}
            health={health}
            billingEnabled={billingEnabled}
            onComplete={onComplete}
          />
        ) : (
          <UserOnboarding
            nodeName={nodeName}
            health={health}
            billingEnabled={billingEnabled}
            onComplete={onComplete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
