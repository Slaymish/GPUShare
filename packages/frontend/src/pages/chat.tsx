import { useState, useEffect, useRef, useCallback } from 'react';
import { inference, getHealth } from '../lib/api';
import type { ChatMessage } from '@shared/types/inference';
import type { ModelInfo } from '@shared/types/inference';

interface Chat {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: number;
}

const CHATS_KEY = 'gpu_node_chats';
const ACTIVE_CHAT_KEY = 'gpu_node_active_chat';

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChats(chats: Chat[]) {
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'New Chat';
  const text = first.content.slice(0, 40);
  return text.length < first.content.length ? text + '...' : text;
}

export function ChatPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_CHAT_KEY)
  );
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const activeChat = chats.find(c => c.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];

  useEffect(() => {
    inference.listModels().then(res => {
      setModels(res.data);
      if (res.data.length > 0 && !selectedModel) setSelectedModel(res.data[0].id);
    }).catch(() => {});
    getHealth().then(h => setBillingEnabled(h.integrations.billing && h.integrations.stripe)).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persist chats to localStorage whenever they change
  useEffect(() => { saveChats(chats); }, [chats]);
  useEffect(() => {
    if (activeChatId) localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    else localStorage.removeItem(ACTIVE_CHAT_KEY);
  }, [activeChatId]);

  // Sync model selector when switching chats
  useEffect(() => {
    if (activeChat && activeChat.model) setSelectedModel(activeChat.model);
  }, [activeChatId]);

  const updateChat = useCallback((chatId: string, updater: (chat: Chat) => Chat) => {
    setChats(prev => prev.map(c => c.id === chatId ? updater(c) : c));
  }, []);

  function createNewChat() {
    const chat: Chat = {
      id: generateId(),
      title: 'New Chat',
      model: selectedModel,
      messages: [],
      createdAt: Date.now(),
    };
    setChats(prev => [chat, ...prev]);
    setActiveChatId(chat.id);
    setInput('');
  }

  function deleteChat(chatId: string) {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (activeChatId === chatId) {
      const remaining = chats.filter(c => c.id !== chatId);
      setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !selectedModel || streaming) return;

    // Create chat if none active
    let chatId = activeChatId;
    if (!chatId) {
      const chat: Chat = {
        id: generateId(),
        title: 'New Chat',
        model: selectedModel,
        messages: [],
        createdAt: Date.now(),
      };
      setChats(prev => [chat, ...prev]);
      setActiveChatId(chat.id);
      chatId = chat.id;
    }

    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];

    updateChat(chatId, c => ({
      ...c,
      model: selectedModel,
      messages: [...updatedMessages, { role: 'assistant', content: '' }],
      title: c.messages.length === 0 ? deriveTitle([...c.messages, userMsg]) : c.title,
    }));

    setInput('');
    setStreaming(true);

    try {
      let fullContent = '';
      const stream = inference.chatCompletionStream({
        model: selectedModel,
        messages: updatedMessages,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          const content = fullContent;
          updateChat(chatId!, c => ({
            ...c,
            messages: [...updatedMessages, { role: 'assistant', content }],
          }));
        }
      }
    } catch (err) {
      const errorContent = err instanceof Error ? err.message : 'Error generating response';
      updateChat(chatId!, c => ({
        ...c,
        messages: [...updatedMessages, { role: 'assistant', content: `Error: ${errorContent}` }],
      }));
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar — Chat List */}
      <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-900/50">
        <div className="p-3">
          <button
            onClick={createNewChat}
            className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                chat.id === activeChatId
                  ? 'bg-gray-700/50 text-white'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <span className="flex-1 truncate">{chat.title}</span>
              <button
                onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity text-xs"
                title="Delete chat"
              >
                &times;
              </button>
            </div>
          ))}
          {chats.length === 0 && (
            <div className="px-3 py-4 text-xs text-gray-600 text-center">No chats yet</div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="border-b border-gray-800 p-4 flex items-center gap-4">
          <h2 className="text-lg font-semibold">
            {activeChat ? activeChat.title : 'Chat'}
          </h2>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.id} ({m.owned_by === 'local' ? 'Local' : 'Cloud'})
              </option>
            ))}
          </select>
          {(() => {
            const m = models.find(m => m.id === selectedModel);
            if (!m) return null;
            return (
              <span className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded ${m.owned_by === 'local' ? 'bg-green-900/50 text-green-400' : 'bg-purple-900/50 text-purple-400'}`}>
                  {m.owned_by === 'local' ? 'Local GPU' : 'OpenRouter'}
                </span>
                {billingEnabled && m.cost_per_million_tokens > 0 && (
                  <span className="text-gray-500">${m.cost_per_million_tokens.toFixed(2)}/M tokens</span>
                )}
              </span>
            );
          })()}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
              Start a conversation
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}>
                {msg.content}
                {msg.role === 'assistant' && msg.content === '' && streaming && (
                  <span className="animate-pulse">...</span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEnd} />
        </div>

        <div className="border-t border-gray-800 p-4">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={streaming || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl px-6 py-3 text-sm font-medium transition-colors"
            >
              {streaming ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
