import { useState, useEffect, useRef, useCallback } from "react";
import { useWebHaptics } from "../lib/haptics";
import { inference, skills as skillsApi, getHealth } from "../lib/api";
import type { ChatMessage } from "@shared/types/inference";
import type { ModelInfo } from "@shared/types/inference";
import type { SkillSummary, SkillDetail } from "@shared/types/skills";
import {
  Button,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Badge,
  RelativeTime,
} from "../components/ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ActiveSkill {
  name: string;
  description: string;
  content: string;
}

interface Chat {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  activeSkills: ActiveSkill[];
  createdAt: number;
}

const CHATS_KEY = "gpushare_chats";
const ACTIVE_CHAT_KEY = "gpushare_active_chat";

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChats(chats: Chat[]) {
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function shortModelName(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1];
}

function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New Chat";
  const text = first.content.slice(0, 40);
  return text.length < first.content.length ? text + "..." : text;
}

const QUICK_PROMPTS = [
  "Explain how transformers work in simple terms",
  "Write a Python script to resize images in bulk",
  "Compare PostgreSQL vs SQLite for small projects",
  "Help me debug a CORS error in my API",
];

const FOLLOW_UP_SUGGESTIONS = [
  "Tell me more",
  "Give me an example",
  "Summarise that",
];

export function ChatPage() {
  const { trigger } = useWebHaptics();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_CHAT_KEY),
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [skillCatalog, setSkillCatalog] = useState<SkillSummary[]>([]);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skillFilter, setSkillFilter] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastElapsedSeconds, setLastElapsedSeconds] = useState<number | null>(
    null,
  );
  const [lastTokenCount, setLastTokenCount] = useState<number | null>(null);
  const [messageReactions, setMessageReactions] = useState<
    Record<string, "up" | "down">
  >({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamStartTime = useRef<number | null>(null);
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];
  const activeSkills = activeChat?.activeSkills ?? [];

  useEffect(() => {
    inference
      .listModels()
      .then((res) => {
        setModels(res.data);
        if (res.data.length > 0 && !selectedModel)
          setSelectedModel(res.data[0].id);
      })
      .catch(() => {});
    getHealth()
      .then((h) =>
        setBillingEnabled(h.integrations.billing && h.integrations.stripe),
      )
      .catch(() => {});
    skillsApi
      .list()
      .then(setSkillCatalog)
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    saveChats(chats);
  }, [chats]);
  useEffect(() => {
    if (activeChatId) localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    else localStorage.removeItem(ACTIVE_CHAT_KEY);
  }, [activeChatId]);

  useEffect(() => {
    if (activeChat && activeChat.model) setSelectedModel(activeChat.model);
  }, [activeChatId]);

  // Elapsed time timer during streaming
  useEffect(() => {
    if (streaming) {
      streamStartTime.current = Date.now();
      setElapsedSeconds(0);
      setLastElapsedSeconds(null);
      setLastTokenCount(null);
      elapsedInterval.current = setInterval(() => {
        if (streamStartTime.current) {
          setElapsedSeconds(
            Math.floor((Date.now() - streamStartTime.current) / 1000),
          );
        }
      }, 1000);
    } else {
      if (elapsedInterval.current) {
        clearInterval(elapsedInterval.current);
        elapsedInterval.current = null;
      }
      if (streamStartTime.current) {
        setLastElapsedSeconds(
          Math.floor((Date.now() - streamStartTime.current) / 1000),
        );
        streamStartTime.current = null;
      }
    }
    return () => {
      if (elapsedInterval.current) {
        clearInterval(elapsedInterval.current);
        elapsedInterval.current = null;
      }
    };
  }, [streaming]);

  const updateChat = useCallback(
    (chatId: string, updater: (chat: Chat) => Chat) => {
      setChats((prev) => prev.map((c) => (c.id === chatId ? updater(c) : c)));
    },
    [],
  );

  function createNewChat() {
    trigger("nudge");
    const chat: Chat = {
      id: generateId(),
      title: "New Chat",
      model: selectedModel,
      messages: [],
      activeSkills: [],
      createdAt: Date.now(),
    };
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setInput("");
    setLastElapsedSeconds(null);
    setLastTokenCount(null);
  }

  async function activateSkill(skillName: string) {
    if (activeSkills.some((s) => s.name === skillName)) return;
    try {
      const detail = await skillsApi.get(skillName);
      const chatId = activeChatId;
      if (!chatId) return;
      updateChat(chatId, (c) => ({
        ...c,
        activeSkills: [...(c.activeSkills ?? []), detail],
      }));
      trigger("nudge");
    } catch {
      // skill load failed
    }
  }

  function removeSkill(skillName: string) {
    if (!activeChatId) return;
    updateChat(activeChatId, (c) => ({
      ...c,
      activeSkills: (c.activeSkills ?? []).filter((s) => s.name !== skillName),
    }));
  }

  function deleteChat(chatId: string) {
    trigger("buzz");
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      const remaining = chats.filter((c) => c.id !== chatId);
      setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || !selectedModel || streaming) return;
    trigger("nudge");

    let chatId = activeChatId;
    if (!chatId) {
      const chat: Chat = {
        id: generateId(),
        title: "New Chat",
        model: selectedModel,
        messages: [],
        activeSkills: [],
        createdAt: Date.now(),
      };
      setChats((prev) => [chat, ...prev]);
      setActiveChatId(chat.id);
      chatId = chat.id;
    }

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];

    const currentSkills = activeSkills;
    let messagesToSend: ChatMessage[] = updatedMessages;
    if (currentSkills.length > 0) {
      const systemContent = currentSkills
        .map((s) => `## ${s.name}\n\n${s.content}`)
        .join("\n\n---\n\n");
      messagesToSend = [
        { role: "system", content: systemContent },
        ...updatedMessages,
      ];
    }

    updateChat(chatId, (c) => ({
      ...c,
      model: selectedModel,
      messages: [...updatedMessages, { role: "assistant", content: "" }],
      title:
        c.messages.length === 0
          ? deriveTitle([...c.messages, userMsg])
          : c.title,
    }));

    setInput("");
    setStreaming(true);
    setLastElapsedSeconds(null);
    setLastTokenCount(null);

    try {
      let fullContent = "";
      let tokenCount = 0;
      const stream = inference.chatCompletionStream({
        model: selectedModel,
        messages: messagesToSend,
        stream: true,
      });

      for await (const chunk of stream) {
        if ("queue_position" in chunk) {
          setQueuePosition(chunk.queue_position);
          continue;
        }
        setQueuePosition(null);

        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          tokenCount += 1;
          const content = fullContent;
          updateChat(chatId!, (c) => ({
            ...c,
            messages: [...updatedMessages, { role: "assistant", content }],
          }));
        }

        // Capture usage from the final chunk if available
        if ((chunk as any).usage?.completion_tokens) {
          tokenCount = (chunk as any).usage.completion_tokens;
        }
      }

      setLastTokenCount(tokenCount > 0 ? tokenCount : null);
      trigger("success");
    } catch (err) {
      trigger("error");
      const errorContent =
        err instanceof Error ? err.message : "Error generating response";
      updateChat(chatId!, (c) => ({
        ...c,
        messages: [
          ...updatedMessages,
          { role: "assistant", content: `Error: ${errorContent}` },
        ],
      }));
    } finally {
      setStreaming(false);
      setQueuePosition(null);
    }
  }

  function handleRegenerate() {
    if (streaming) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg || !activeChatId) return;

    // Remove the last assistant message
    updateChat(activeChatId, (c) => {
      const msgs = [...c.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
        msgs.pop();
      }
      if (msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
        msgs.pop();
      }
      return { ...c, messages: msgs };
    });

    // Re-send the last user message
    setTimeout(() => {
      handleSend(lastUserMsg.content);
    }, 50);
  }

  function handleCopy(content: string, index: number) {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  function toggleReaction(msgKey: string, reaction: "up" | "down") {
    setMessageReactions((prev) => {
      if (prev[msgKey] === reaction) {
        const next = { ...prev };
        delete next[msgKey];
        return next;
      }
      return { ...prev, [msgKey]: reaction };
    });
  }

  function handleInputChange(value: string) {
    setInput(value);
    if (value.startsWith("/") && skillCatalog.length > 0) {
      setShowSkillPicker(true);
      setSkillFilter(value.slice(1).toLowerCase());
    } else {
      setShowSkillPicker(false);
    }
  }

  function handleSkillSelect(skill: SkillSummary) {
    setShowSkillPicker(false);
    setInput("");
    activateSkill(skill.name);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && showSkillPicker) {
      setShowSkillPicker(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showSkillPicker) {
        const filtered = skillCatalog.filter(
          (s) =>
            s.name.toLowerCase().includes(skillFilter) &&
            !activeSkills.some((a) => a.name === s.name),
        );
        if (filtered.length > 0) {
          handleSkillSelect(filtered[0]);
          return;
        }
      }
      handleSend();
    }
  }

  function handleQuickPrompt(prompt: string) {
    setInput(prompt);
    // Auto-send on next tick so state is updated
    setTimeout(() => {
      handleSend(prompt);
    }, 0);
  }

  const [chatListOpen, setChatListOpen] = useState(false);

  // Determine if we should show follow-up suggestions
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const showFollowUps =
    !streaming &&
    !input.trim() &&
    lastMsg?.role === "assistant" &&
    lastMsg.content !== "";

  // Model badge helpers
  function getModelBadge(m: ModelInfo) {
    if (m.owned_by === "local") {
      return (
        <Badge className="bg-[#E8F5E9] text-[#2E7D32] text-[10px] leading-tight px-1.5 py-0.5">
          Local GPU
        </Badge>
      );
    }
    return (
      <Badge className="bg-[#EDE7F6] text-[#5E35B1] text-[10px] leading-tight px-1.5 py-0.5">
        Cloud
      </Badge>
    );
  }

  function getColdStartBadge(m: ModelInfo) {
    if (m.owned_by === "local" && !m.loaded) {
      return (
        <Badge className="bg-[#FFF3E0] text-[#E65100] text-[10px] leading-tight px-1.5 py-0.5">
          Cold start
        </Badge>
      );
    }
    return null;
  }

  const currentModel = models.find((m) => m.id === selectedModel);

  return (
    <div className="flex h-full">
      {/* Desktop Sidebar -- Chat List */}
      <div className="hidden md:flex w-64 border-r border-[#E5E1DB] flex-col bg-white">
        <div className="p-3">
          <Button onClick={createNewChat} className="w-full">
            + New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                chat.id === activeChatId
                  ? "bg-[#F4F3EE] text-[#2D2B28]"
                  : "text-[#6F6B66] hover:bg-[#F4F3EE] hover:text-[#2D2B28]"
              }`}
            >
              <div className="flex-1 min-w-0">
                <span className="block truncate">{chat.title}</span>
                <RelativeTime
                  date={new Date(chat.createdAt)}
                  className="block text-[10px] text-[#B1ADA1] leading-tight mt-0.5"
                />
              </div>
              {chat.model && (
                <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[#EDEAE3] text-[#8A8580] text-[10px] leading-tight">
                  {shortModelName(chat.model)}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-[#B1ADA1] hover:text-[#C62828] transition-opacity text-xs"
                title="Delete chat"
              >
                &times;
              </button>
            </div>
          ))}
          {chats.length === 0 && (
            <div className="px-3 py-4 text-xs text-[#B1ADA1] text-center">
              No chats yet
            </div>
          )}
        </div>
      </div>

      {/* Mobile Chat List Slide-over */}
      {chatListOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30 md:hidden"
            onClick={() => setChatListOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-white flex flex-col md:hidden">
            <div className="p-3 border-b border-[#E5E1DB] flex items-center justify-between">
              <span className="text-sm font-semibold">Chats</span>
              <button
                onClick={() => setChatListOpen(false)}
                className="text-[#6F6B66] hover:text-[#2D2B28] text-xs"
              >
                Close
              </button>
            </div>
            <div className="p-3">
              <Button
                onClick={() => {
                  createNewChat();
                  setChatListOpen(false);
                }}
                className="w-full"
              >
                + New Chat
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setChatListOpen(false);
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                    chat.id === activeChatId
                      ? "bg-[#F4F3EE] text-[#2D2B28]"
                      : "text-[#6F6B66] hover:bg-[#F4F3EE] hover:text-[#2D2B28]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="block truncate">{chat.title}</span>
                    <RelativeTime
                      date={new Date(chat.createdAt)}
                      className="block text-[10px] text-[#B1ADA1] leading-tight mt-0.5"
                    />
                  </div>
                  {chat.model && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[#EDEAE3] text-[#8A8580] text-[10px] leading-tight">
                      {shortModelName(chat.model)}
                    </span>
                  )}
                </div>
              ))}
              {chats.length === 0 && (
                <div className="px-3 py-4 text-xs text-[#B1ADA1] text-center">
                  No chats yet
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-[#E5E1DB] p-4 flex flex-wrap items-center gap-2 md:gap-4 bg-white">
          <button
            onClick={() => setChatListOpen(true)}
            className="md:hidden text-[#6F6B66] hover:text-[#2D2B28] text-sm font-medium"
          >
            Chats
          </button>
          <h2 className="text-lg font-semibold hidden md:block">
            {activeChat ? activeChat.title : "Chat"}
          </h2>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="max-w-full">
              <div className="flex items-center gap-2">
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex items-center gap-2">
                    {m.id}
                    {getModelBadge(m)}
                    {getColdStartBadge(m)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(() => {
            const m = models.find((m) => m.id === selectedModel);
            if (!m) return null;
            return (
              <span className="flex items-center gap-2 text-xs flex-wrap">
                {getModelBadge(m)}
                {getColdStartBadge(m)}
                {m.cost_per_million_tokens > 0 &&
                  (billingEnabled || m.owned_by !== "local") && (
                    <span className="text-[#B1ADA1] whitespace-nowrap">
                      ${m.cost_per_million_tokens.toFixed(2)}/M tokens
                    </span>
                  )}
              </span>
            );
          })()}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4 min-w-0 bg-[#F4F3EE]">
          {/* Empty state with quick-start chips */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <h3 className="text-xl font-semibold text-[#2D2B28]">
                What can I help you with?
              </h3>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="px-3 py-2 rounded-full border border-[#E5E1DB] bg-white text-sm text-[#6F6B66] hover:bg-[#EDEAE3] hover:text-[#2D2B28] transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => {
            const isLastAssistant =
              msg.role === "assistant" && i === messages.length - 1;
            const msgReactionKey = `${activeChatId}-${i}`;

            return (
              <div key={i}>
                <div
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`group relative max-w-2xl w-fit rounded-xl px-4 py-3 text-sm break-words ${msg.role === "user" ? "max-w-[85%]" : "max-w-[85%]"} ${
                      msg.role === "user"
                        ? "bg-[#C15F3C] text-white whitespace-pre-wrap"
                        : "bg-white text-[#2D2B28] border border-[#E5E1DB]"
                    }`}
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : msg.content === "" && streaming ? (
                      <span className="animate-pulse text-[#B1ADA1]">
                        {queuePosition !== null && queuePosition > 0
                          ? `Position ${queuePosition} in queue...`
                          : `Generating\u2026 ${elapsedSeconds}s`}
                      </span>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        className="prose prose-sm max-w-none prose-pre:bg-[#F4F3EE] prose-pre:text-[#2D2B28] prose-code:text-[#C15F3C] prose-code:bg-[#F4F3EE] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-[''] prose-code:after:content-['']"
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}

                    {/* Per-message action bar for assistant messages */}
                    {msg.role === "assistant" && msg.content !== "" && (
                      <div className="absolute -bottom-8 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => handleCopy(msg.content, i)}
                          className="px-1.5 py-1 rounded text-xs bg-white border border-[#E5E1DB] text-[#6F6B66] hover:text-[#2D2B28] hover:border-[#B1ADA1] transition-colors"
                          title="Copy"
                        >
                          {copiedIndex === i ? "Copied" : "Copy"}
                        </button>
                        {isLastAssistant && (
                          <button
                            onClick={handleRegenerate}
                            className="px-1.5 py-1 rounded text-xs bg-white border border-[#E5E1DB] text-[#6F6B66] hover:text-[#2D2B28] hover:border-[#B1ADA1] transition-colors"
                            title="Regenerate"
                          >
                            Regenerate
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Generated in Xs indicator after last assistant message */}
                {isLastAssistant &&
                  !streaming &&
                  lastElapsedSeconds !== null &&
                  msg.content !== "" && (
                    <div className="flex justify-start mt-1">
                      <span className="text-[10px] text-[#B1ADA1]">
                        Generated in {lastElapsedSeconds}s
                        {lastTokenCount !== null &&
                          ` \u00B7 ${lastTokenCount} tokens`}
                      </span>
                    </div>
                  )}

                {/* Streaming elapsed indicator */}
                {isLastAssistant && streaming && msg.content !== "" && (
                  <div className="flex justify-start mt-1">
                    <span className="text-[10px] text-[#B1ADA1] animate-pulse">
                      Generating\u2026 {elapsedSeconds}s
                    </span>
                  </div>
                )}

                {/* Follow-up suggestion chips after last assistant message */}
                {isLastAssistant && showFollowUps && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {FOLLOW_UP_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSend(suggestion)}
                        className="px-3 py-1.5 rounded-full border border-[#E5E1DB] bg-white text-xs text-[#6F6B66] hover:bg-[#EDEAE3] hover:text-[#2D2B28] transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEnd} />
        </div>

        <div className="border-t border-[#E5E1DB] p-4 mb-16 md:mb-0 bg-white">
          <div className="max-w-4xl mx-auto w-full space-y-2">
            {/* Active skills pills */}
            {activeSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeSkills.map((skill) => (
                  <span
                    key={skill.name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFF3E0] text-[#C15F3C] text-xs"
                  >
                    {skill.name}
                    <button
                      onClick={() => removeSkill(skill.name)}
                      className="hover:text-[#A84E30] text-[#C15F3C]"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Skill picker dropdown */}
            <div className="relative">
              {showSkillPicker && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-[#E5E1DB] rounded-lg shadow-lg max-h-48 overflow-auto z-10">
                  {skillCatalog
                    .filter(
                      (s) =>
                        s.name.toLowerCase().includes(skillFilter) &&
                        !activeSkills.some((a) => a.name === s.name),
                    )
                    .map((skill) => (
                      <button
                        key={skill.name}
                        onClick={() => handleSkillSelect(skill)}
                        className="w-full text-left px-3 py-2 hover:bg-[#F4F3EE] transition-colors"
                      >
                        <div className="text-sm text-[#2D2B28] font-medium">
                          /{skill.name}
                        </div>
                        <div className="text-xs text-[#8A8580] truncate">
                          {skill.description}
                        </div>
                      </button>
                    ))}
                  {skillCatalog.filter(
                    (s) =>
                      s.name.toLowerCase().includes(skillFilter) &&
                      !activeSkills.some((a) => a.name === s.name),
                  ).length === 0 && (
                    <div className="px-3 py-2 text-xs text-[#B1ADA1]">
                      No matching skills
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    skillCatalog.length > 0
                      ? "Type a message or / for skills..."
                      : "Type a message..."
                  }
                  rows={1}
                  className="flex-1 min-w-0 rounded-xl"
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={streaming || !input.trim()}
                  className="rounded-xl px-4 md:px-6 whitespace-nowrap"
                  size="lg"
                >
                  {streaming ? `${elapsedSeconds}s` : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
