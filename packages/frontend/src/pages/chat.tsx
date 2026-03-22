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
} from "../components/ui";

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
  // Strip common prefixes and suffixes to get a compact label
  const parts = model.split("/");
  return parts[parts.length - 1];
}

function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New Chat";
  const text = first.content.slice(0, 40);
  return text.length < first.content.length ? text + "..." : text;
}

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
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    skillsApi.list().then(setSkillCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Persist chats to localStorage whenever they change
  useEffect(() => {
    saveChats(chats);
  }, [chats]);
  useEffect(() => {
    if (activeChatId) localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    else localStorage.removeItem(ACTIVE_CHAT_KEY);
  }, [activeChatId]);

  // Sync model selector when switching chats
  useEffect(() => {
    if (activeChat && activeChat.model) setSelectedModel(activeChat.model);
  }, [activeChatId]);

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
      // skill load failed — ignore
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

  async function handleSend() {
    const text = input.trim();
    if (!text || !selectedModel || streaming) return;
    trigger("nudge");

    // Create chat if none active
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

    // Build messages to send, prepending system message for active skills
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

    try {
      let fullContent = "";
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
          const content = fullContent;
          updateChat(chatId!, (c) => ({
            ...c,
            messages: [...updatedMessages, { role: "assistant", content }],
          }));
        }
      }
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

  function handleInputChange(value: string) {
    setInput(value);
    // Show skill picker when input starts with /
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
        // Select the first matching skill
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

  const [chatListOpen, setChatListOpen] = useState(false);

  return (
    <div className="flex h-full">
      {/* Desktop Sidebar -- Chat List */}
      <div className="hidden md:flex w-64 border-r border-gray-800 flex-col bg-gray-900/50">
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
                  ? "bg-gray-700/50 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
              }`}
            >
              <span className="flex-1 truncate">{chat.title}</span>
              {chat.model && (
                <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400 text-[10px] leading-tight">
                  {shortModelName(chat.model)}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity text-xs"
                title="Delete chat"
              >
                &times;
              </button>
            </div>
          ))}
          {chats.length === 0 && (
            <div className="px-3 py-4 text-xs text-gray-600 text-center">
              No chats yet
            </div>
          )}
        </div>
      </div>

      {/* Mobile Chat List Slide-over */}
      {chatListOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 md:hidden"
            onClick={() => setChatListOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-gray-950 flex flex-col md:hidden">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold">Chats</span>
              <button
                onClick={() => setChatListOpen(false)}
                className="text-gray-400 hover:text-white text-xs"
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
                      ? "bg-gray-700/50 text-white"
                      : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
                  }`}
                >
                  <span className="flex-1 truncate">{chat.title}</span>
                  {chat.model && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400 text-[10px] leading-tight">
                      {shortModelName(chat.model)}
                    </span>
                  )}
                </div>
              ))}
              {chats.length === 0 && (
                <div className="px-3 py-4 text-xs text-gray-600 text-center">
                  No chats yet
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-gray-800 p-4 flex flex-wrap items-center gap-2 md:gap-4">
          <button
            onClick={() => setChatListOpen(true)}
            className="md:hidden text-gray-400 hover:text-white text-sm font-medium"
          >
            Chats
          </button>
          <h2 className="text-lg font-semibold hidden md:block">
            {activeChat ? activeChat.title : "Chat"}
          </h2>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.id} ({m.owned_by === "local" ? "Local" : "Cloud"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(() => {
            const m = models.find((m) => m.id === selectedModel);
            if (!m) return null;
            return (
              <span className="flex items-center gap-2 text-xs flex-wrap">
                <span
                  className={`px-1.5 py-0.5 rounded whitespace-nowrap ${m.owned_by === "local" ? "bg-green-900/50 text-green-400" : "bg-purple-900/50 text-purple-400"}`}
                >
                  {m.owned_by === "local" ? "Local GPU" : "OpenRouter"}
                </span>
                {m.cost_per_million_tokens > 0 &&
                  (billingEnabled || m.owned_by !== "local") && (
                    <span className="text-gray-500 whitespace-nowrap">
                      ${m.cost_per_million_tokens.toFixed(2)}/M tokens
                    </span>
                  )}
              </span>
            );
          })()}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4 min-w-0">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
              Start a conversation
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-2xl w-fit rounded-xl px-4 py-3 text-sm whitespace-pre-wrap break-words ${msg.role === "user" ? "max-w-[85%]" : "max-w-[85%]"} ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-100"
                }`}
              >
                {msg.content}
                {msg.role === "assistant" &&
                  msg.content === "" &&
                  streaming && (
                    <span className="animate-pulse">
                      {queuePosition !== null && queuePosition > 0
                        ? `Position ${queuePosition} in queue...`
                        : "..."}
                    </span>
                  )}
              </div>
            </div>
          ))}
          <div ref={messagesEnd} />
        </div>

        <div className="border-t border-gray-800 p-4 mb-16 md:mb-0">
          <div className="max-w-4xl mx-auto w-full space-y-2">
            {/* Active skills pills */}
            {activeSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeSkills.map((skill) => (
                  <span
                    key={skill.name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 text-xs"
                  >
                    {skill.name}
                    <button
                      onClick={() => removeSkill(skill.name)}
                      className="hover:text-blue-100 text-blue-400"
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
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg shadow-lg max-h-48 overflow-auto z-10">
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
                        className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors"
                      >
                        <div className="text-sm text-white font-medium">
                          /{skill.name}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {skill.description}
                        </div>
                      </button>
                    ))}
                  {skillCatalog.filter(
                    (s) =>
                      s.name.toLowerCase().includes(skillFilter) &&
                      !activeSkills.some((a) => a.name === s.name),
                  ).length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">
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
                  onClick={handleSend}
                  disabled={streaming || !input.trim()}
                  className="rounded-xl px-4 md:px-6 whitespace-nowrap"
                  size="lg"
                >
                  {streaming ? "..." : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
