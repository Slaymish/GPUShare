import { useState, useEffect, useRef, useCallback } from "react";
import { useWebHaptics } from "../lib/haptics";
import { inference, skills as skillsApi, getHealth, mcpServers } from "../lib/api";
import type { ChatMessage, ContentPart, ToolCall, ToolDefinition } from "@shared/types/inference";
import type { ModelInfo } from "@shared/types/inference";
import type { McpToolInfo } from "@shared/types/mcp";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Skeleton,
} from "../components/ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isGuest } from "../lib/auth";
import { ModelPickerModal } from "../components/ModelPickerModal";
import type { PickedModelMeta } from "../components/ModelPickerModal";

interface Attachment {
  name: string;
  mimeType: string;
  dataUrl: string;       // full data: URL (images only)
  textContent?: string;  // set for text files
}

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

function stripImageData(chats: Chat[]): Chat[] {
  return chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((msg) => {
      if (typeof msg.content === "string") return msg;
      return {
        ...msg,
        content: msg.content.map((part) =>
          part.type === "image_url"
            ? { type: "image_url" as const, image_url: { url: "[image not stored]" } }
            : part,
        ),
      };
    }),
  }));
}

function saveChats(chats: Chat[]) {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(stripImageData(chats)));
  } catch {
    // localStorage quota exceeded — save without assistant message content as fallback
    try {
      const trimmed = stripImageData(chats).map((c) => ({
        ...c,
        messages: c.messages.filter((m) => m.role !== "assistant"),
      }));
      localStorage.setItem(CHATS_KEY, JSON.stringify(trimmed));
    } catch {
      // nothing more we can do
    }
  }
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
  const raw =
    typeof first.content === "string"
      ? first.content
      : (first.content.find((p) => p.type === "text")?.text ?? "Attachment");
  return raw.length > 40 ? raw.slice(0, 40) + "..." : raw;
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
  const [showModelPicker, setShowModelPicker] = useState(false);
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolInfo[]>([]);
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [executingTools, setExecutingTools] = useState<string[]>([]);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamStartTime = useRef<number | null>(null);
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];
  const activeSkills = activeChat?.activeSkills ?? [];

  useEffect(() => {
    const userIsGuest = isGuest();
    inference
      .listModels()
      .then((res) => {
        // Filter models for guest users: only free cloud models
        const availableModels = userIsGuest
          ? res.data.filter(
              (m) => m.owned_by !== "local" && m.cost_per_million_tokens === 0,
            )
          : res.data;

        setModels(availableModels);
        if (availableModels.length > 0 && !selectedModel)
          setSelectedModel(availableModels[0].id);
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
    // Load MCP tools
    mcpServers
      .listTools()
      .then((res) => setMcpTools(res.tools || []))
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

  // Drop image attachments if user switches to a model without vision support
  useEffect(() => {
    const supportsVision = !!models.find((m) => m.id === selectedModel)?.vision_support;
    if (!supportsVision) {
      setAttachments((prev) => prev.filter((a) => !a.mimeType.startsWith("image/")));
    }
  }, [selectedModel, models]);

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

  function handleFileSelect(files: FileList) {
    const remaining = 5 - attachments.length;
    if (remaining <= 0) return;
    const supportsVision = !!models.find((m) => m.id === selectedModel)?.vision_support;
    const filtered = Array.from(files).filter(
      (f) => supportsVision || !f.type.startsWith("image/"),
    );
    const toAdd = filtered.slice(0, remaining);
    const promises = toAdd.map(
      (file) =>
        new Promise<Attachment>((resolve, reject) => {
          if (file.size > 10 * 1024 * 1024) {
            reject(new Error(`${file.name} exceeds 10 MB limit`));
            return;
          }
          const reader = new FileReader();
          if (file.type.startsWith("image/")) {
            reader.onload = () =>
              resolve({
                name: file.name,
                mimeType: file.type,
                dataUrl: reader.result as string,
              });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          } else {
            reader.onload = () =>
              resolve({
                name: file.name,
                mimeType: file.type || "text/plain",
                dataUrl: "",
                textContent: reader.result as string,
              });
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
          }
        }),
    );
    Promise.allSettled(promises).then((results) => {
      const loaded = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<Attachment>).value);
      setAttachments((prev) => [...prev, ...loaded]);
    });
  }

  function buildMessageContent(
    text: string,
    atts: Attachment[],
  ): string | ContentPart[] {
    if (atts.length === 0) return text;
    const parts: ContentPart[] = [];
    for (const att of atts) {
      if (att.mimeType.startsWith("image/")) {
        parts.push({ type: "image_url", image_url: { url: att.dataUrl } });
      } else if (att.textContent !== undefined) {
        const ext = att.name.split(".").pop() ?? "";
        parts.push({
          type: "text",
          text: `\`\`\`${ext}\n// ${att.name}\n${att.textContent}\n\`\`\``,
        });
      }
    }
    if (text) parts.push({ type: "text", text });
    return parts;
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    const currentAttachments = overrideText ? [] : attachments;
    if ((!text && currentAttachments.length === 0) || !selectedModel || streaming)
      return;
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

    const userMsg: ChatMessage = {
      role: "user",
      content: buildMessageContent(text, currentAttachments),
    };
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
    setAttachments([]);
    setStreaming(true);
    setLastElapsedSeconds(null);
    setLastTokenCount(null);

    // Build tool definitions from MCP tools
    const toolDefs: ToolDefinition[] | undefined =
      mcpEnabled && mcpTools.length > 0
        ? mcpTools.map((t) => ({
            type: "function" as const,
            function: {
              name: `${t.server_name}__${t.name}`,
              description: t.description || undefined,
              parameters: (t.parameters as Record<string, unknown>) || undefined,
            },
          }))
        : undefined;

    // Tool call loop: stream response, execute tool calls, repeat
    let conversationMessages = [...messagesToSend];
    let loopMessages = [...updatedMessages];
    const MAX_TOOL_ROUNDS = 10;

    try {
      let tokenCount = 0;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let fullContent = "";
        let pendingToolCalls: ToolCall[] = [];
        // Track tool calls being assembled from stream deltas
        const toolCallAccumulator: Record<number, { id: string; name: string; arguments: string }> = {};

        const stream = inference.chatCompletionStream({
          model: selectedModel,
          messages: conversationMessages,
          stream: true,
          ...(toolDefs ? { tools: toolDefs } : {}),
        });

        for await (const chunk of stream) {
          if ("queue_position" in chunk) {
            setQueuePosition(chunk.queue_position);
            continue;
          }
          setQueuePosition(null);

          const choice = chunk.choices[0];
          const delta = choice?.delta;

          // Accumulate text content
          if (delta?.content) {
            fullContent += delta.content;
            tokenCount += 1;
            const content = fullContent;
            updateChat(chatId!, (c) => ({
              ...c,
              messages: [...loopMessages, { role: "assistant", content }],
            }));
          }

          // Accumulate tool calls from stream
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallAccumulator[idx]) {
                toolCallAccumulator[idx] = {
                  id: tc.id || `call_${Date.now()}_${idx}`,
                  name: tc.function?.name || "",
                  arguments: "",
                };
              }
              if (tc.id) toolCallAccumulator[idx].id = tc.id;
              if (tc.function?.name) toolCallAccumulator[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCallAccumulator[idx].arguments += tc.function.arguments;
            }
          }

          // Capture usage from the final chunk
          if ((chunk as any).usage?.completion_tokens) {
            tokenCount = (chunk as any).usage.completion_tokens;
          }
        }

        // Convert accumulated tool calls to proper format
        pendingToolCalls = Object.values(toolCallAccumulator).map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        }));

        // If no tool calls, we're done
        if (pendingToolCalls.length === 0) {
          break;
        }

        // Add assistant message with tool calls to conversation
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: fullContent || "",
          tool_calls: pendingToolCalls,
        };
        loopMessages = [...loopMessages, assistantMsg];
        conversationMessages = [...conversationMessages, assistantMsg];

        // Show tool execution status
        updateChat(chatId!, (c) => ({
          ...c,
          messages: [...loopMessages, { role: "assistant", content: "" }],
        }));

        // Execute each tool call
        for (const tc of pendingToolCalls) {
          const funcName = tc.function.name;
          // Parse server_name__tool_name format
          const sepIdx = funcName.indexOf("__");
          if (sepIdx < 0) continue;

          const serverName = funcName.slice(0, sepIdx);
          const toolName = funcName.slice(sepIdx + 2);

          // Find the matching MCP tool to get the server_id
          const matchingTool = mcpTools.find(
            (t) => t.server_name === serverName && t.name === toolName,
          );
          if (!matchingTool) {
            // Add error result
            const errorMsg: ChatMessage = {
              role: "tool",
              content: `Tool not found: ${funcName}`,
              tool_call_id: tc.id,
              name: funcName,
            };
            loopMessages = [...loopMessages, errorMsg];
            conversationMessages = [...conversationMessages, errorMsg];
            continue;
          }

          setExecutingTools((prev) => [...prev, toolName]);

          try {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}");
            } catch {
              // malformed args
            }

            const result = await mcpServers.callTool({
              server_id: matchingTool.server_id,
              tool_name: toolName,
              arguments: args,
            });

            const toolMsg: ChatMessage = {
              role: "tool",
              content:
                typeof result.result === "string"
                  ? result.result
                  : JSON.stringify(result.result),
              tool_call_id: tc.id,
              name: funcName,
            };
            loopMessages = [...loopMessages, toolMsg];
            conversationMessages = [...conversationMessages, toolMsg];
          } catch (err) {
            const toolMsg: ChatMessage = {
              role: "tool",
              content: `Error: ${err instanceof Error ? err.message : "Tool execution failed"}`,
              tool_call_id: tc.id,
              name: funcName,
            };
            loopMessages = [...loopMessages, toolMsg];
            conversationMessages = [...conversationMessages, toolMsg];
          } finally {
            setExecutingTools((prev) => prev.filter((t) => t !== toolName));
          }
        }

        // Update chat to show tool results, then loop for next model response
        updateChat(chatId!, (c) => ({
          ...c,
          messages: [...loopMessages, { role: "assistant", content: "" }],
        }));
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
          ...loopMessages,
          { role: "assistant", content: `Error: ${errorContent}` },
        ],
      }));
    } finally {
      setStreaming(false);
      setQueuePosition(null);
      setExecutingTools([]);
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

    // Re-send the last user message (text only for regenerate)
    setTimeout(() => {
      const text =
        typeof lastUserMsg.content === "string"
          ? lastUserMsg.content
          : (lastUserMsg.content.find((p) => p.type === "text")?.text ?? "");
      handleSend(text);
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
  const currentModelSupportsVision = !!models.find((m) => m.id === selectedModel)?.vision_support;

  function getVisionIcon() {
    return (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#5E35B1]" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <title>Supports image input</title>
        <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5M4.5 3h15A1.5 1.5 0 0121 4.5v15A1.5 1.5 0 0119.5 21H4.5A1.5 1.5 0 013 19.5v-15A1.5 1.5 0 014.5 3zm6.75 6.75a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    );
  }

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
    <TooltipProvider delayDuration={400}>
    <div className="flex h-full md:flex-row flex-col">
      {/* Desktop Sidebar -- Chat List */}
      <div className="hidden md:flex w-64 border-r border-[#E5E1DB] flex-col bg-white">
        <div className="p-3">
          <Button onClick={createNewChat} className="w-full">
            + New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
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
        </ScrollArea>
      </div>

      {/* Mobile Chat List Slide-over */}
      <Sheet open={chatListOpen} onOpenChange={setChatListOpen}>
        <SheetContent side="left" className="w-72 md:hidden">
          <SheetHeader>
            <SheetTitle>Chats</SheetTitle>
            <SheetClose className="text-[#6F6B66] hover:text-[#2D2B28] text-xs">
              Close
            </SheetClose>
          </SheetHeader>
          <div className="p-3 shrink-0">
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
          <ScrollArea className="flex-1">
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
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 md:relative">
        <div className="border-b border-[#E5E1DB] p-4 flex flex-wrap items-center gap-2 md:gap-4 bg-white shrink-0">
          <div className="md:hidden flex items-center gap-2 flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setChatListOpen(true)}
                  className="text-[#6F6B66] hover:text-[#2D2B28] shrink-0"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent>Chat history</TooltipContent>
            </Tooltip>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {activeChat ? activeChat.title : "New Chat"}
              </div>
              {activeChat &&
                (() => {
                  const m = models.find(
                    (model) => model.id === activeChat.model,
                  );
                  if (!m) return null;
                  return (
                    <div className="flex items-center gap-1 text-[10px] text-[#B1ADA1] truncate">
                      <span>{shortModelName(activeChat.model)}</span>
                      <span>
                        {m.owned_by === "local" ? "Local GPU" : "Cloud"}
                      </span>
                      {m.cost_per_million_tokens > 0 && (
                        <span>
                          ${m.cost_per_million_tokens.toFixed(2)}/M tokens
                        </span>
                      )}
                    </div>
                  );
                })()}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={createNewChat}
                  className="text-[#6F6B66] hover:text-[#2D2B28] shrink-0"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent>New chat</TooltipContent>
            </Tooltip>
          </div>
          <h2 className="text-lg font-semibold hidden md:block">
            {activeChat ? activeChat.title : "Chat"}
          </h2>
          <div className="flex items-center gap-2 min-w-0">
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
                      {m.vision_support && getVisionIcon()}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowModelPicker(true)}
                  className="text-[#6F6B66] hover:text-[#2D2B28] transition-colors shrink-0"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <circle cx="12" cy="17" r=".5" fill="currentColor" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent>Help me choose a model</TooltipContent>
            </Tooltip>
          </div>
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
          {mcpTools.length > 0 && (
            <button
              onClick={() => setMcpEnabled(!mcpEnabled)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] border transition-colors ${
                mcpEnabled
                  ? "bg-[#EDE7F6] text-[#5E35B1] border-[#D1C4E9]"
                  : "bg-[#F4F3EE] text-[#B1ADA1] border-[#E5E1DB]"
              }`}
              title={mcpEnabled ? "MCP tools active — click to disable" : "MCP tools disabled — click to enable"}
            >
              <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              {mcpTools.length} tools
            </button>
          )}
        </div>

        <ScrollArea className="flex-1 min-w-0 bg-[#F4F3EE]">
        <div className="p-4 space-y-4 md:pb-4 pb-[180px]">
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

            // Render tool call messages (assistant with tool_calls)
            if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
              return (
                <div key={i}>
                  <div className="flex justify-start">
                    <div className="max-w-[85%] space-y-1.5">
                      {msg.content && (
                        <div className="bg-white text-[#2D2B28] border border-[#E5E1DB] rounded-xl px-4 py-3 text-sm">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none prose-pre:bg-[#F4F3EE] prose-pre:text-[#2D2B28] prose-code:text-[#C15F3C] prose-code:bg-[#F4F3EE] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-[''] prose-code:after:content-['']">
                            {msg.content as string}
                          </ReactMarkdown>
                        </div>
                      )}
                      {msg.tool_calls.map((tc) => (
                        <div key={tc.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#EDE7F6] border border-[#D1C4E9] text-xs">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#5E35B1] shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                          </svg>
                          <span className="text-[#5E35B1] font-medium">{tc.function.name.replace("__", " / ")}</span>
                          <span className="text-[#8A8580] truncate max-w-[200px]">
                            {(() => {
                              try {
                                const args = JSON.parse(tc.function.arguments || "{}");
                                const keys = Object.keys(args);
                                if (keys.length === 0) return "";
                                return keys.map(k => `${k}: ${JSON.stringify(args[k]).slice(0, 30)}`).join(", ");
                              } catch { return tc.function.arguments; }
                            })()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            // Render tool result messages
            if (msg.role === "tool") {
              return (
                <div key={i}>
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-lg bg-[#F3E5F5] border border-[#CE93D8] px-3 py-2 text-xs">
                      <div className="flex items-center gap-1.5 text-[#7B1FA2] font-medium mb-1">
                        <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {(msg.name || "").replace("__", " / ")} result
                      </div>
                      <pre className="whitespace-pre-wrap text-[#2D2B28] max-h-32 overflow-auto font-mono text-[10px]">
                        {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            }

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
                      typeof msg.content === "string" ? (
                        msg.content
                      ) : (
                        <div className="flex flex-col gap-2">
                          {msg.content
                            .filter((p) => p.type === "image_url")
                            .map((p, pi) => (
                              <img
                                key={pi}
                                src={p.image_url!.url}
                                alt="attachment"
                                className="max-w-xs max-h-48 rounded-lg object-contain bg-black/10"
                              />
                            ))}
                          {msg.content
                            .filter((p) => p.type === "text")
                            .map((p, pi) => (
                              <span key={pi} className="whitespace-pre-wrap">
                                {p.text}
                              </span>
                            ))}
                        </div>
                      )
                    ) : msg.content === "" && streaming ? (
                      <div className="space-y-2 py-1">
                        {queuePosition !== null && queuePosition > 0 ? (
                          <span className="text-[#B1ADA1] text-sm">Position {queuePosition} in queue...</span>
                        ) : executingTools.length > 0 ? (
                          <span className="text-[#B1ADA1] text-sm">Running tool: {executingTools[0]}...</span>
                        ) : (
                          <>
                            <Skeleton className="h-3 w-48" />
                            <Skeleton className="h-3 w-64" />
                            <Skeleton className="h-3 w-32" />
                          </>
                        )}
                      </div>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        className="prose prose-sm max-w-none prose-pre:bg-[#F4F3EE] prose-pre:text-[#2D2B28] prose-code:text-[#C15F3C] prose-code:bg-[#F4F3EE] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-[''] prose-code:after:content-['']"
                      >
                        {msg.content as string}
                      </ReactMarkdown>
                    )}

                    {/* Per-message action bar for assistant messages */}
                    {msg.role === "assistant" && msg.content !== "" && (
                      <div className="absolute -bottom-8 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => handleCopy(msg.content as string, i)}
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
                      Generating… {elapsedSeconds}s
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
        </ScrollArea>

        <div className="border-t border-[#E5E1DB] p-4 bg-white shrink-0 md:relative fixed bottom-0 left-0 right-0 md:left-auto md:right-auto z-30">
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
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-[#E5E1DB] rounded-lg shadow-lg z-10 overflow-hidden">
                  <ScrollArea className="max-h-48">
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
                  </ScrollArea>
                </div>
              )}
              {/* Attachment preview strip */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachments.map((att, i) => (
                    <div
                      key={i}
                      className="relative flex items-center gap-1.5 bg-white border border-[#E5E1DB] rounded-lg px-2 py-1.5 text-xs text-[#6F6B66]"
                    >
                      {att.mimeType.startsWith("image/") ? (
                        <img
                          src={att.dataUrl}
                          alt={att.name}
                          className="w-8 h-8 rounded object-cover"
                        />
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                      <span className="max-w-[100px] truncate">{att.name}</span>
                      <button
                        onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                        className="text-[#B1ADA1] hover:text-[#C62828] ml-0.5"
                        title="Remove"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={
                  currentModelSupportsVision
                    ? "image/*,text/*,.py,.js,.ts,.tsx,.jsx,.json,.csv,.md,.txt,.log,.yaml,.yml,.toml,.xml,.html,.css,.sh,.env"
                    : "text/*,.py,.js,.ts,.tsx,.jsx,.json,.csv,.md,.txt,.log,.yaml,.yml,.toml,.xml,.html,.css,.sh,.env"
                }
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFileSelect(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={streaming || attachments.length >= 5}
                      className="shrink-0 p-2 rounded-xl border border-[#E5E1DB] bg-white text-[#6F6B66] hover:text-[#2D2B28] hover:border-[#B1ADA1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {currentModelSupportsVision ? "Attach file or image" : "Attach file (select a vision model for images)"}
                  </TooltipContent>
                </Tooltip>
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
                  disabled={streaming || (!input.trim() && attachments.length === 0)}
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
      <ModelPickerModal
        open={showModelPicker}
        onClose={() => setShowModelPicker(false)}
        onSelect={(id, meta: PickedModelMeta) => {
          setSelectedModel(id);
          // If the chosen model isn't in the loaded list (e.g. not in OPENROUTER_MODELS),
          // inject a synthetic entry so it appears in the Select and can be inferred against.
          setModels((prev) => {
            if (prev.find((m) => m.id === id)) return prev;
            return [
              ...prev,
              {
                id,
                object: "model",
                owned_by: meta.ownedBy,
                cost_per_million_tokens: meta.costPerMillionTokens,
                loaded: false,
                vision_support: meta.visionSupport,
              },
            ];
          });
          setShowModelPicker(false);
        }}
        availableModelIds={models.map((m) => m.id)}
      />
    </div>
    </TooltipProvider>
  );
}
