"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DollarSign,
  Layers,
  Globe,
  Calculator,
  Plus,
  LogOut,
  User,
  Compass,
  FileText,
  MessageSquare,
  X,
  Send,
  Bot,
} from "lucide-react";
import { TerminalProvider, useTerminal } from "../../context/TerminalContext";
import LogoMark from "../../components/visuals/LogoMark";
import { api } from "../../lib/api";

function CopilotMessageRow({
  msg,
  onSuggestClick,
}: {
  msg: any;
  onSuggestClick: (action: string) => void;
}) {
  const [isToolsExpanded, setIsToolsExpanded] = useState(false);

  return (
    <div
      className={`flex flex-col gap-1.5 max-w-[85%] ${msg.sender === "user" ? "self-end" : "self-start"}`}
    >
      <div
        className={`p-3 rounded-md text-xs leading-relaxed ${
          msg.sender === "user"
            ? "bg-accent-intelligence/15 text-text-primary border border-accent-intelligence/20 font-sans"
            : "bg-bg-base border border-border-subtle text-text-secondary font-sans"
        }`}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {msg.text}
      </div>

      {msg.toolsUsed && msg.toolsUsed.length > 0 && (
        <div className="mt-1 self-start w-full">
          <button
            onClick={() => setIsToolsExpanded(!isToolsExpanded)}
            type="button"
            className="flex items-center gap-1 text-[9px] font-mono text-text-muted hover:text-text-primary uppercase tracking-wider cursor-pointer"
          >
            <span>🔧 tool executions ({msg.toolsUsed.length})</span>
            <span className="text-[7px]">{isToolsExpanded ? "▼" : "▶"}</span>
          </button>
          {isToolsExpanded && (
            <div className="mt-1.5 space-y-1.5 p-2 bg-bg-base border border-border-subtle rounded-sm">
              {msg.toolsUsed.map((tool: any, idx: number) => (
                <div key={idx} className="space-y-1">
                  <div className="text-[9px] font-bold font-mono text-accent-intelligence">
                    {tool.name}
                  </div>
                  <div className="text-[8px] font-mono text-text-muted leading-tight">
                    {tool.description}
                  </div>
                  <div className="p-1 bg-bg-surface-elevated text-[8px] font-mono text-text-secondary rounded-xs break-all">
                    {tool.resultSummary}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {msg.suggestedActions && msg.suggestedActions.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5 w-full self-start">
          {msg.suggestedActions.map((act: any, idx: number) => (
            <button
              key={idx}
              onClick={() => onSuggestClick(act.action)}
              type="button"
              className="text-left px-2.5 py-1.5 bg-bg-surface hover:bg-bg-surface-elevated border border-border-subtle hover:border-accent-intelligence/50 rounded-sm text-[10px] text-accent-intelligence font-sans font-medium transition-colors cursor-pointer block w-full"
            >
              Ask: "{act.label}"
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const {
    user,
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    profiles,
    activeProfile,
    setActiveProfile,
    loading,
    refreshWorkspaces,
    logout,
  } = useTerminal();

  const pathname = usePathname();
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [wsError, setWsError] = useState("");

  // Copilot Chat Panel states
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<
    Array<{
      sender: "user" | "copilot";
      text: string;
      toolsUsed?: any[];
      suggestedActions?: any[];
    }>
  >([
    {
      sender: "copilot",
      text: "Welcome to the Atlas REI AI Analyst Copilot. I have access to your active workspace, underwrites, investor mandates, and portfolios. Ask me to:\n\n*   **Summarize this deal** (on a property details page)\n*   **Explain this verdict** (after evaluating a deal)\n*   **Compare opportunities** in this workspace\n*   **Explain portfolio risk**\n*   **Summarize relevant events**",
    },
  ]);
  const [copilotInput, setCopilotInput] = useState("");
  const [isCopilotSending, setIsCopilotSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCopilotMessages([
      {
        sender: "copilot",
        text: "Welcome to the Atlas REI AI Analyst Copilot. I have access to your active workspace, underwrites, investor mandates, and portfolios. Ask me to:\n\n*   **Summarize this deal** (on a property details page)\n*   **Explain this verdict** (after evaluating a deal)\n*   **Compare opportunities** in this workspace\n*   **Explain portfolio risk**\n*   **Summarize relevant events**",
      },
    ]);
    setCopilotInput("");
  }, [activeWorkspace]);

  const getContextIds = () => {
    let propId = null;
    let runId = null;

    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path.includes("/property/")) {
        propId = path.split("/property/")[1]?.split("/")[0];
      }

      const search = window.location.search;
      const sp = new URLSearchParams(search);
      runId = sp.get("underwriteRunId") || sp.get("runId");
    }

    return {
      propertyId: propId,
      underwriteRunId: runId,
    };
  };

  const handleSendCopilotMessage = async (
    e?: React.FormEvent,
    customText?: string,
  ) => {
    if (e) e.preventDefault();
    const textToSend = customText || copilotInput;
    if (!textToSend.trim() || !activeWorkspace) return;

    // Append user message
    const userMsg = { sender: "user" as const, text: textToSend };
    setCopilotMessages((prev) => [...prev, userMsg]);
    if (!customText) setCopilotInput("");
    setIsCopilotSending(true);

    try {
      const context = getContextIds();
      const res = await api.copilotChat(activeWorkspace.id, {
        message: textToSend,
        investorProfileId: activeProfile?.id || null,
        propertyId: context.propertyId,
        underwriteRunId: context.underwriteRunId,
      });

      setCopilotMessages((prev) => [
        ...prev,
        {
          sender: "copilot",
          text: res.answer,
          toolsUsed: res.toolsUsed,
          suggestedActions: res.suggestedActions,
        },
      ]);
    } catch (err: any) {
      console.error(err);
      setCopilotMessages((prev) => [
        ...prev,
        {
          sender: "copilot",
          text: `⚠️ Error: ${err.message || "Failed to communicate with copilot."}`,
        },
      ]);
    } finally {
      setIsCopilotSending(false);
    }
  };

  // Scroll to bottom whenever messages list changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [copilotMessages]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-muted font-mono text-xs">
        LOADING INVESTOR CONTEXT...
      </div>
    );
  }

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || !user) return;
    setWsError("");
    try {
      const orgId = user.memberships[0]?.organizationId;
      if (!orgId) throw new Error("No organization membership");
      await api.createWorkspace(orgId, newWorkspaceName);
      setNewWorkspaceName("");
      setIsCreatingWorkspace(false);
      await refreshWorkspaces();
    } catch (err) {
      console.error(err);
      setWsError("Failed to create workspace.");
    }
  };

  const navLinks = [
    { name: "Home", href: "/home", icon: Compass },
    { name: "Underwrite", href: "/deals", icon: Calculator },
    { name: "Committee", href: "/committee", icon: Layers },
    { name: "War Room", href: "/war-room", icon: Globe },
    { name: "Portfolio", href: "/portfolio", icon: DollarSign },
    { name: "Documents", href: "/documents", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex font-sans">
      {/* Sidebar Rail */}
      <aside className="w-60 border-r border-border-default bg-bg-surface-alt flex flex-col shrink-0">
        <div className="p-4 border-b border-border-default flex items-center gap-2">
          <LogoMark className="h-7 w-7" />
          <div>
            <span className="text-sm font-bold tracking-tight text-text-primary block">
              ATLAS <span className="text-accent-intelligence">REI</span>
            </span>
            <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
              INVESTMENT OS
            </span>
          </div>
        </div>

        {/* Workspace Switcher */}
        <div className="p-3 border-b border-border-default">
          <label
            htmlFor="workspaceSelect"
            className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1"
          >
            Active Workspace
          </label>
          <div className="flex items-center gap-1.5 bg-bg-base border border-border-default rounded px-2.5 py-1.5 text-xs">
            <select
              id="workspaceSelect"
              value={activeWorkspace?.id || ""}
              onChange={(e) => {
                const ws = workspaces.find((w) => w.id === e.target.value);
                setActiveWorkspace(ws || null);
              }}
              className="bg-transparent border-none text-text-primary focus:outline-none font-medium cursor-pointer w-full"
            >
              <option
                value=""
                className="bg-bg-surface-elevated text-text-muted"
              >
                Select Workspace...
              </option>
              {workspaces.map((ws) => (
                <option
                  key={ws.id}
                  value={ws.id}
                  className="bg-bg-surface-elevated text-text-primary"
                >
                  {ws.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setIsCreatingWorkspace(true)}
              className="text-success hover:text-success/80 p-0.5 transition-colors cursor-pointer shrink-0"
              title="Create Workspace"
              aria-label="Create Workspace"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {isCreatingWorkspace && (
            <form onSubmit={handleCreateWorkspace} className="mt-2 space-y-1.5">
              <input
                type="text"
                required
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="Workspace name"
                aria-label="Workspace name"
                className="w-full bg-bg-base border border-border-default rounded px-2 py-1 text-[11px] text-text-primary focus:outline-none focus:border-accent-intelligence"
              />
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingWorkspace(false)}
                  className="px-2 py-0.5 text-[10px] bg-bg-surface-elevated rounded text-text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-2 py-0.5 text-[10px] bg-success rounded text-text-inverse"
                >
                  Create
                </button>
              </div>
              {wsError && (
                <div className="text-danger text-[10px] font-mono">
                  {wsError}
                </div>
              )}
            </form>
          )}
        </div>

        {/* Profile Switcher */}
        <div className="p-3 border-b border-border-default">
          <label
            htmlFor="profileSelect"
            className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1"
          >
            Active Investor Profile
          </label>
          <div className="flex items-center gap-1.5 bg-bg-base border border-border-default rounded px-2.5 py-1.5 text-xs">
            <select
              id="profileSelect"
              value={activeProfile?.id || ""}
              onChange={(e) => {
                const prof = profiles.find((p) => p.id === e.target.value);
                setActiveProfile(prof || null);
              }}
              className="bg-transparent border-none text-text-primary focus:outline-none font-medium cursor-pointer w-full"
            >
              <option
                value=""
                className="bg-bg-surface-elevated text-text-muted"
              >
                Select Mandate...
              </option>
              {profiles.map((prof) => (
                <option
                  key={prof.id}
                  value={prof.id}
                  className="bg-bg-surface-elevated text-text-primary"
                >
                  {prof.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sidebar Nav links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded text-xs transition-colors ${
                  isActive
                    ? "bg-bg-surface text-text-primary font-semibold border-l-2 border-accent-intelligence"
                    : "text-text-secondary hover:bg-bg-surface/50 hover:text-text-primary"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${isActive ? "text-accent-intelligence" : "text-text-muted"}`}
                />
                <span>{link.name}</span>
              </Link>
            );
          })}
          {/* Analyst Copilot Trigger */}
          <button
            onClick={() => setIsCopilotOpen(!isCopilotOpen)}
            type="button"
            className={`flex items-center gap-2.5 px-3 py-2 rounded text-xs transition-colors w-full text-left cursor-pointer ${
              isCopilotOpen
                ? "bg-bg-surface text-text-primary font-semibold border-l-2 border-accent-intelligence"
                : "text-text-secondary hover:bg-bg-surface/50 hover:text-text-primary"
            }`}
          >
            <MessageSquare
              className={`h-4 w-4 ${isCopilotOpen ? "text-accent-intelligence" : "text-text-muted"}`}
            />
            <span>Analyst Copilot</span>
          </button>
        </nav>

        {/* User context footer */}
        <div className="p-3 border-t border-border-default bg-bg-surface/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="h-7 w-7 rounded bg-bg-surface flex items-center justify-center border border-border-default shrink-0">
              <User className="h-3.5 w-3.5 text-accent-intelligence" />
            </div>
            <div className="overflow-hidden">
              <div className="text-[11px] font-semibold text-text-primary truncate">
                {user?.fullName}
              </div>
              <div className="text-[9px] font-mono text-text-muted truncate">
                {user?.email}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-text-muted hover:text-danger p-1.5 rounded transition-colors cursor-pointer shrink-0"
            title="Log Out"
            aria-label="Log Out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>

      {/* Main Viewport */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto bg-bg-base">{children}</div>
        </div>

        {/* Copilot Side Panel */}
        {isCopilotOpen && (
          <aside className="w-96 border-l border-border-default bg-bg-surface-alt flex flex-col shrink-0 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-surface-alt">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-accent-intelligence" />
                <span className="text-xs font-bold text-text-primary uppercase tracking-widest font-mono">
                  AI Analyst Copilot
                </span>
              </div>
              <button
                onClick={() => setIsCopilotOpen(false)}
                type="button"
                className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title="Close Copilot"
                aria-label="Close Copilot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col bg-bg-surface-alt/40">
              {copilotMessages.map((msg, idx) => (
                <CopilotMessageRow
                  key={idx}
                  msg={msg}
                  onSuggestClick={(action) =>
                    handleSendCopilotMessage(undefined, action)
                  }
                />
              ))}
              {isCopilotSending && (
                <div className="self-start p-3 rounded-md bg-bg-base border border-border-subtle text-text-secondary text-xs leading-relaxed max-w-[85%] font-mono animate-pulse">
                  Copilot is thinking and fetching data...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form
              onSubmit={handleSendCopilotMessage}
              className="p-4 border-t border-border-default bg-bg-surface-alt"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={copilotInput}
                  onChange={(e) => setCopilotInput(e.target.value)}
                  placeholder="Ask copilot..."
                  aria-label="Ask copilot..."
                  disabled={isCopilotSending}
                  className="flex-1 bg-bg-base border border-border-default rounded px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isCopilotSending || !copilotInput.trim()}
                  className="px-3 py-2 bg-accent-intelligence hover:bg-accent-intelligence/90 text-text-inverse rounded flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TerminalProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </TerminalProvider>
  );
}
