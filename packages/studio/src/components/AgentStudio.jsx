"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getTemplateAgents,
  getUserAgents,
  getUserConversations,
  getAgentBySlug,
  getAgentConversation,
  sendAgentChatMessage,
  pollAgentChatResult,
  createAgent,
} from "../muapi.js";
import en from "../messages/en/agentStudio.json";
import zh from "../messages/zh/agentStudio.json";
import ja from "../messages/ja-JP/agentStudio.json";
import ko from "../messages/ko-KR/agentStudio.json";
import zhTw from "../messages/zh-TW/agentStudio.json";
import es from "../messages/es/agentStudio.json";
import { resolveCopy } from "../i18nUtils";

// ─── Helpers ────────────────────────────────────────────────────────────────
function timeAgo(dateStr, copy) {
  if (!dateStr) return "";
  const utcStr =
    dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
  const diff = Math.floor((Date.now() - new Date(utcStr)) / 1000);
  if (diff < 60) return copy.time.justNow;
  if (diff < 3600) return copy.time.minutesAgo.replace("{n}", Math.floor(diff / 60));
  if (diff < 86400) return copy.time.hoursAgo.replace("{n}", Math.floor(diff / 3600));
  if (diff < 604800) return copy.time.daysAgo.replace("{n}", Math.floor(diff / 86400));
  return new Date(utcStr).toLocaleDateString();
}

// ─── Agent Card (grid) ───────────────────────────────────────────────────────
function AgentCard({ agent, onClick, onEdit, copy }) {
  return (
    <div className="group relative aspect-[4/5] rounded-xl cursor-pointer">
      <div
        onClick={() => onClick(agent)}
        className="absolute inset-0 rounded-xl overflow-hidden border border-line-subtle bg-canvas transition-all group-hover:border-line-accent/30 group-hover:scale-[1.02] shadow-elevation-4"
      >
        {agent.icon_url ? (
          <img
            src={agent.icon_url}
            alt={agent.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-page group-hover:scale-110"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1" className="opacity-20">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-micro font-bold text-brand uppercase tracking-wider mb-1 opacity-80">
            {agent.category || copy.card.defaultCategory}
          </div>
          <h3 className="text-sm font-bold text-ink truncate group-hover:text-brand transition-colors">
            {agent.name || copy.card.unnamedAgent}
          </h3>
          {agent.owner_username && (
            <p className="text-micro text-ink-subtle mt-1 uppercase tracking-tighter font-black">
              {copy.card.byPrefix} {agent.owner_username}
            </p>
          )}
        </div>
      </div>
      
      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(agent);
          }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-scrim border border-line flex items-center justify-center text-ink opacity-0 group-hover:opacity-100 transition-all hover:bg-brand hover:text-ink-on-accent hover:scale-110 z-10"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Conversation Card (My Chats) ────────────────────────────────────────────
function ConversationCard({ conv, onClick, copy }) {
  const displayTitle = conv.title || copy.card.newChat;
  const agentSlug = conv.agent_slug || conv.agent_id;
  return (
    <div
      onClick={() => onClick(agentSlug, conv.id)}
      className="group flex flex-col gap-3 bg-wash border border-line-subtle rounded-xl p-4 hover:border-line-accent/20 hover:bg-wash transition-all cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-wash border border-line-subtle shrink-0">
          {conv.agent_icon_url ? (
            <img src={conv.agent_icon_url} alt={conv.agent_name || "Agent"} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-subtle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-micro font-black text-brand uppercase tracking-wider truncate">
            {conv.agent_name || copy.card.unknownAgent}
          </p>
          <p className="text-sm font-bold text-ink truncate" title={displayTitle}>
            {displayTitle}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-line-subtle mt-auto text-micro text-ink-subtle font-medium">
        <span>{timeAgo(conv.updated_at, copy)}</span>
        {conv.message_count != null && <span>{conv.message_count} {copy.card.msgsSuffix}</span>}
      </div>
    </div>
  );
}

// Conversation history entries can carry `content` as a plain string or as a
// list of structured blocks (matches the shape agent_router.py's own last-message
// preview extraction already assumes for the "My Chats" list).
function textFromContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b) => (typeof b === "string" ? b : b?.text || "")).join("\n");
  }
  return "";
}

function ChatBubble({ message }) {
  const isUser = message.role === "user";
  const text = textFromContent(message.content);
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-brand text-ink-on-accent font-medium"
            : "bg-wash border border-line-subtle text-ink"
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{text}</span>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-pre:bg-scrim">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || "…"}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
const TABS = ["templates", "my-agents", "my-chats"];

export default function AgentStudio({ apiKey, locale = "en", signedIn = false, onRequireAuth }) {
  const router = useRouter();
  const params = useParams();
  const copy = resolveCopy(en, { 'zh-CN': zh, 'ja-JP': ja, 'ko-KR': ko, 'zh-TW': zhTw, es }, locale);

  const [activeMainTab, setActiveMainTab] = useState("templates");
  const [agents, setAgents] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [needsAuth, setNeedsAuth] = useState(false);

  // Deep-link routing. `router.push('/agents/...')` below is a real full navigation
  // away from the studio shell on muapi.ai (BYOK/dashboard) — AiAgent's own standalone
  // pages handle it there, unaffected. On a white-label custom domain the same push is
  // transparently rewritten by middleware.js back to this same catch-all shell route, so
  // reading it back out via useParams() here drives an inline view instead of navigating
  // anywhere — see docs/whitelabel_plan.md for the full routing writeup.
  const tabSegments = Array.isArray(params?.tab) ? params.tab : [];
  const agentsIdx = tabSegments.indexOf("agents");
  const urlAgentSlug = agentsIdx === -1 ? null : tabSegments[agentsIdx + 1] || null;
  const urlConversationId = agentsIdx === -1 ? null : tabSegments[agentsIdx + 2] || null;

  const [view, setView] = useState("list"); // 'list' | 'chat' | 'create'
  const [activeAgent, setActiveAgent] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState(null);

  const [createForm, setCreateForm] = useState({ name: "", description: "", system_prompt: "", welcome_message: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Navigate to the standalone /agents page — AiAgent handles its own routing there
  // (on a custom domain, this instead drives the inline view below via urlAgentSlug)
  const handleSelectAgent = useCallback(
    (agent) => {
      const id = agent.agent_id || agent.id;
      router.push(`/agents/${id}`);
    },
    [router]
  );

  const handleEditAgent = useCallback(
    (agent) => {
      const id = agent.agent_id || agent.id;
      router.push(`/agents/edit/${id}`);
    },
    [router]
  );

  const handleCreateAgent = useCallback(() => {
    router.push("/agents/create");
  }, [router]);

  const handleOpenConversation = useCallback(
    (agentSlug, convId) => {
      router.push(`/agents/${agentSlug}/${convId}`);
    },
    [router]
  );

  // Resolve the inline view from the URL. 'edit' isn't built inline yet (only used
  // from the standalone dashboard today) — treat it as "back to list" rather than
  // trying to load an agent named "edit" and showing a confusing error.
  useEffect(() => {
    if (!apiKey && !signedIn) return;
    if (!urlAgentSlug || urlAgentSlug === "edit") {
      setView("list");
      return;
    }
    if (urlAgentSlug === "create") {
      setView("create");
      return;
    }

    let cancelled = false;
    async function openFromUrl() {
      setChatLoading(true);
      setChatError(null);
      try {
        const agent = await getAgentBySlug(apiKey, urlAgentSlug);
        if (cancelled) return;
        setActiveAgent(agent);
        if (urlConversationId) {
          const conv = await getAgentConversation(apiKey, urlAgentSlug, urlConversationId);
          if (cancelled) return;
          setConversationId(conv.id);
          setChatMessages(conv.history || []);
        } else {
          setConversationId(null);
          setChatMessages([]);
        }
        setView("chat");
      } catch (err) {
        if (!cancelled) setChatError(err.message || copy.errors.loadAgentFailed);
      } finally {
        if (!cancelled) setChatLoading(false);
      }
    }
    openFromUrl();
    return () => { cancelled = true; };
  }, [apiKey, urlAgentSlug, urlConversationId]);

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || sending || !activeAgent) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    setChatError(null);
    try {
      const agentSlug = activeAgent.agent_id;
      const { request_id } = await sendAgentChatMessage(apiKey, agentSlug, {
        message: text,
        conversationId,
      });
      const result = await pollAgentChatResult(apiKey, request_id);
      // result.messages is only this turn's assistant/pulse entries, not the
      // full transcript (see AiAgent.jsx) — append, don't replace, or every
      // send wipes the user's own message and all prior history from view.
      const assistantMessage = (result.messages || []).find(
        (m) => m.role === "assistant" && m.content
      );
      setChatMessages((prev) => [
        ...prev,
        assistantMessage || { role: "assistant", content: "" },
      ]);
      if (result.conversation_id && result.conversation_id !== conversationId) {
        setConversationId(result.conversation_id);
        router.replace(`/agents/${agentSlug}/${result.conversation_id}`, { scroll: false });
      }
    } catch (err) {
      setChatError(err.message || copy.errors.sendFailed);
    } finally {
      setSending(false);
    }
  }, [apiKey, activeAgent, conversationId, chatInput, sending, router]);

  const handleCreateSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!createForm.name.trim() || !createForm.system_prompt.trim() || creating) return;
      setCreating(true);
      setCreateError(null);
      try {
        const created = await createAgent(apiKey, {
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
          system_prompt: createForm.system_prompt.trim(),
          welcome_message: createForm.welcome_message.trim() || null,
          skill_ids: [],
        });
        router.push(`/agents/${created.agent_id}`);
      } catch (err) {
        setCreateError(err.message || copy.errors.createFailed);
      } finally {
        setCreating(false);
      }
    },
    [apiKey, createForm, creating, router]
  );

  useEffect(() => {
    let cancelled = false;

    if (view !== "list") return () => { cancelled = true; };
    // /api/agents/* 按账号会话 cookie 鉴权，apiKey 只是可选的 BYOK；只看 apiKey 会让
    // 会话登录用户也走失败分支，而未登录用户看到的是 "Failed to load." + 永远无效的 Retry。
    if (!apiKey && !signedIn) {
      setAgents([]);
      setConversations([]);
      setError(null);
      setNeedsAuth(true);
      setLoading(false);
      return () => { cancelled = true; };
    }
    setNeedsAuth(false);

    async function load() {
      setLoading(true);
      setError(null);
      setAgents([]);
      setConversations([]);
      try {
        if (activeMainTab === "templates") {
          const data = await getTemplateAgents(apiKey);
          if (!cancelled) setAgents(data);
        } else if (activeMainTab === "my-agents") {
          const data = await getUserAgents(apiKey);
          if (!cancelled) setAgents(data);
        } else if (activeMainTab === "my-chats") {
          const data = await getUserConversations(apiKey);
          if (!cancelled) setConversations(data);
        }
      } catch (err) {
        console.error("AgentStudio load error:", err);
        if (!cancelled) setError(err.message || copy.errors.loadFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [apiKey, signedIn, activeMainTab, view, reloadToken]);

  // ── Render: Create ───────────────────────────────────────────────────────────
  if (view === "create") {
    return (
      <div className="h-full flex flex-col bg-canvas text-ink overflow-y-auto custom-scrollbar">
        <div className="flex-shrink-0 h-16 border-b border-line-subtle flex items-center gap-6 px-8 bg-scrim">
          <button
            onClick={() => router.push("/agents")}
            className="flex items-center gap-2 text-xs font-bold text-ink-subtle hover:text-ink transition-colors"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {copy.buttons.back}
          </button>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-brand">{copy.headings.createAgent}</h2>
        </div>

        <form onSubmit={handleCreateSubmit} className="max-w-2xl w-full mx-auto p-8 space-y-6">
          <div className="space-y-2">
            <label className="block text-micro font-black text-ink-subtle uppercase tracking-widest">{copy.labels.name}</label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={copy.placeholders.name}
              className="w-full bg-wash border border-line rounded-lg p-3 text-sm text-ink focus:border-line-accent/50 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-micro font-black text-ink-subtle uppercase tracking-widest">{copy.labels.description}</label>
            <input
              type="text"
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={copy.placeholders.description}
              className="w-full bg-wash border border-line rounded-lg p-3 text-sm text-ink focus:border-line-accent/50 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-micro font-black text-ink-subtle uppercase tracking-widest">{copy.labels.systemPrompt}</label>
            <textarea
              required
              value={createForm.system_prompt}
              onChange={(e) => setCreateForm((f) => ({ ...f, system_prompt: e.target.value }))}
              placeholder={copy.placeholders.systemPrompt}
              className="w-full bg-wash border border-line rounded-lg p-3 text-sm text-ink focus:border-line-accent/50 transition-colors min-h-[140px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-micro font-black text-ink-subtle uppercase tracking-widest">{copy.labels.welcomeMessage}</label>
            <input
              type="text"
              value={createForm.welcome_message}
              onChange={(e) => setCreateForm((f) => ({ ...f, welcome_message: e.target.value }))}
              placeholder={copy.placeholders.welcomeMessage}
              className="w-full bg-wash border border-line rounded-lg p-3 text-sm text-ink focus:border-line-accent/50 transition-colors"
            />
          </div>

          {createError && (
            <p className="text-xs font-bold text-danger">{createError}</p>
          )}

          <button
            type="submit"
            disabled={creating || !createForm.name.trim() || !createForm.system_prompt.trim()}
            className="w-full py-4 bg-brand text-ink-on-accent text-xs font-black uppercase tracking-[0.2em] rounded-xl hover:bg-surface-inverse transition-all disabled:opacity-40 flex items-center justify-center gap-3"
          >
            {creating ? (
              <>
                <div className="w-4 h-4 border-2 border-line-subtle border-t-black rounded-full animate-spin" />
                <span>{copy.buttons.creating}</span>
              </>
            ) : (
              <span>{copy.buttons.createAgentSubmit}</span>
            )}
          </button>
        </form>
      </div>
    );
  }

  // ── Render: Chat ─────────────────────────────────────────────────────────────
  if (view === "chat") {
    return (
      <div className="h-full flex flex-col bg-canvas text-ink">
        <div className="flex-shrink-0 h-16 border-b border-line-subtle flex items-center gap-4 px-8 bg-scrim">
          <button
            onClick={() => router.push("/agents")}
            className="flex items-center gap-2 text-xs font-bold text-ink-subtle hover:text-ink transition-colors"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {copy.buttons.back}
          </button>
          <div className="h-4 w-[1px] bg-wash-press" />
          {activeAgent && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-wash border border-line-subtle shrink-0">
                {activeAgent.icon_url ? (
                  <img src={activeAgent.icon_url} alt={activeAgent.name} className="w-full h-full object-cover" />
                ) : null}
              </div>
              <span className="text-sm font-bold text-ink">{activeAgent.name}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-4 max-w-3xl w-full mx-auto">
          {chatLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-line-subtle border-t-[#22d3ee] rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {chatMessages.length === 0 && activeAgent?.welcome_message && (
                <ChatBubble message={{ role: "assistant", content: activeAgent.welcome_message }} />
              )}
              {chatMessages.map((msg, i) => (
                <ChatBubble key={i} message={msg} />
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-wash border border-line-subtle rounded-2xl px-4 py-3">
                    <div className="w-4 h-4 border-2 border-line border-t-[#22d3ee] rounded-full animate-spin" />
                  </div>
                </div>
              )}
              {chatError && (
                <p className="text-xs font-bold text-danger">{chatError}</p>
              )}
            </>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-line-subtle p-6 bg-scrim">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
            className="max-w-3xl w-full mx-auto flex items-end gap-3"
          >
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={copy.placeholders.chatInput}
              rows={1}
              className="flex-1 bg-wash border border-line rounded-xl p-3 text-sm text-ink focus:border-line-accent/50 transition-colors resize-none max-h-40"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || sending}
              className="px-5 py-3 bg-brand text-ink-on-accent text-xs font-black uppercase tracking-widest rounded-xl hover:bg-surface-inverse transition-all disabled:opacity-40"
            >
              {copy.buttons.send}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Render: List ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-canvas text-ink">
      {/* Header */}
      <div className="flex-shrink-0 h-16 border-b border-line-subtle flex items-center justify-between px-8 bg-scrim">
        <div className="flex items-center gap-8 h-full">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-brand">
            {copy.headings.agents}
          </h2>
          <div className="flex gap-1 bg-wash p-1 rounded-xl">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveMainTab(tab)}
                className={`px-4 py-1.5 text-micro font-black uppercase tracking-widest rounded-lg transition-all ${
                  activeMainTab === tab
                    ? "bg-surface-inverse text-ink-inverse shadow-elevation-3"
                    : "text-ink-subtle hover:text-ink hover:bg-wash"
                }`}
              >
                {copy.tabs[tab] || tab.replace(/-/g, " ")}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={needsAuth ? onRequireAuth : handleCreateAgent}
          className="px-6 py-2 bg-brand text-ink-on-accent text-micro font-black uppercase tracking-widest rounded-lg hover:bg-warning transition-all active:scale-95 flex items-center gap-2"
        >
          <span className="text-sm">+</span>
          {copy.buttons.create}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-line-subtle border-t-[#22d3ee] rounded-full animate-spin" />
          </div>
        ) : needsAuth ? (
          <div className="h-full flex flex-col items-center justify-center text-ink-subtle gap-4 px-6 text-center">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <p className="text-micro font-black uppercase tracking-[0.3em]">{copy.auth.heading}</p>
            <p className="text-xs leading-relaxed max-w-sm">{copy.auth.description}</p>
            <button
              type="button"
              onClick={onRequireAuth}
              className="text-micro text-brand hover:text-ink border border-line-accent/20 hover:border-line-strong px-4 py-2 rounded-lg transition-colors"
            >
              {copy.auth.cta}
            </button>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-ink-subtle gap-4">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs font-bold uppercase tracking-widest">{error}</p>
            <button
              onClick={() => setReloadToken((t) => t + 1)}
              className="text-micro text-ink-subtle hover:text-ink border border-line px-4 py-2 rounded-lg transition-colors"
            >
              {copy.buttons.retry}
            </button>
          </div>
        ) : activeMainTab === "my-chats" ? (
          // ── My Chats view ─────────────────────────────────────────────────
          conversations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-subtle gap-4">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-micro font-black uppercase tracking-[0.3em]">{copy.empty.noChats}</p>
              <button
                onClick={() => setActiveMainTab("templates")}
                className="text-micro text-brand hover:text-ink border border-line-accent/20 hover:border-line-strong px-4 py-2 rounded-lg transition-colors"
              >
                {copy.buttons.browseTemplates}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-[1600px] mx-auto">
              {conversations.map((conv) => (
                <ConversationCard
                  key={conv.id}
                  conv={conv}
                  onClick={handleOpenConversation}
                  copy={copy}
                />
              ))}
            </div>
          )
        ) : (
          // ── Agents grid (templates / my-agents) ───────────────────────────
          agents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-subtle gap-4">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <p className="text-micro font-black uppercase tracking-[0.3em]">{copy.empty.noAgents}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 max-w-[1600px] mx-auto">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.agent_id || agent.id}
                  agent={agent}
                  onClick={handleSelectAgent}
                  copy={copy}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
