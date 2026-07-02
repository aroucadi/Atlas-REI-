"use client";

import React, { useState, useEffect } from "react";
import { useTerminal } from "../../../context/TerminalContext";
import { api } from "../../../lib/api";
import {
  Globe,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  Play,
  Brain,
  RefreshCw,
} from "lucide-react";

export default function WarRoomPage() {
  const { activeWorkspace } = useTerminal();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Goal DAG State
  const [goalText, setGoalText] = useState(
    "Screen all Downtown Dubai properties and draft investment memos for those with yield > 8.0%"
  );
  const [compiling, setCompiling] = useState(false);
  const [activeGoal, setActiveGoal] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getEvents();
      setEvents(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load market events. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [activeWorkspace]);

  const handleCompileGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !goalText.trim()) return;
    setCompiling(true);
    try {
      const compiled = await api.compileGoal(activeWorkspace.id, goalText);
      setActiveGoal(compiled);
      if (compiled.objectives && compiled.objectives.length > 0) {
        setSelectedNode(compiled.objectives[0]);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to compile goal");
    } finally {
      setCompiling(false);
    }
  };

  // Helper to layout DAG nodes topologically
  const computeDAGLayout = (objectives: any[]) => {
    if (!objectives || objectives.length === 0) return { nodes: [], edges: [] };

    // Simple layering algorithm
    const layers: { [key: string]: number } = {};
    const nodeMap = new Map(objectives.map((obj) => [obj.id, obj]));

    const getLayer = (id: string): number => {
      if (layers[id] !== undefined) return layers[id];
      const node = nodeMap.get(id);
      if (!node || !node.dependencies || node.dependencies.length === 0) {
        layers[id] = 0;
        return 0;
      }
      const depLayers = node.dependencies.map((depId: string) => getLayer(depId));
      const maxDepLayer = Math.max(...depLayers);
      layers[id] = maxDepLayer + 1;
      return layers[id];
    };

    objectives.forEach((obj) => getLayer(obj.id));

    // Group nodes by layer
    const layerGroups: { [key: number]: string[] } = {};
    objectives.forEach((obj) => {
      const layer = layers[obj.id];
      if (!layerGroups[layer]) layerGroups[layer] = [];
      layerGroups[layer].push(obj.id);
    });

    const maxLayer = Math.max(...Object.keys(layerGroups).map(Number));
    const nodes: any[] = [];
    const edges: any[] = [];

    // Layout configuration
    const width = 800;
    const height = 300;
    const paddingX = 120;
    const paddingY = 80;

    Object.keys(layerGroups).forEach((layerStr) => {
      const layer = Number(layerStr);
      const ids = layerGroups[layer];
      const count = ids.length;

      ids.forEach((id, index) => {
        const node = nodeMap.get(id);
        // Calculate coordinates
        const x = paddingX + (layer / (maxLayer || 1)) * (width - 2 * paddingX);
        const y =
          count === 1
            ? height / 2
            : paddingY + (index / (count - 1)) * (height - 2 * paddingY);

        nodes.push({
          id,
          title: node?.title || "",
          status: node?.status || "PENDING",
          description: node?.description || "",
          x,
          y,
        });

        // Add edges
        if (node?.dependencies) {
          node.dependencies.forEach((depId: string) => {
            edges.push({
              from: depId,
              to: id,
            });
          });
        }
      });
    });

    return { nodes, edges };
  };

  const dag = activeGoal ? computeDAGLayout(activeGoal.objectives || []) : { nodes: [], edges: [] };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-secondary font-mono text-xs">
        STREAMING MARKET DATA FIELDS...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-danger/10 border border-danger/30 text-danger text-xs font-mono p-4 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border-default pb-4">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">
          WAR ROOM
        </h1>
        <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest mt-1">
          Goal Compilation DAG & Macroeconomic Risk Center
        </p>
      </div>

      {/* Goal Compilation Section */}
      <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
        <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent-intelligence animate-pulse" />
          <span>Goal OS DAG Compiler</span>
        </h2>

        <form onSubmit={handleCompileGoal} className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              placeholder="Input natural language goal..."
              className="flex-1 bg-bg-base border border-border-default rounded-sm px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence font-sans"
            />
            <button
              type="submit"
              disabled={compiling || !activeWorkspace}
              className="px-4 py-2 bg-accent-intelligence hover:bg-accent-intelligence/90 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-sm tracking-wide transition-all uppercase flex items-center gap-2 cursor-pointer"
            >
              {compiling ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              COMPILE GOAL
            </button>
          </div>
        </form>

        {/* SVG DAG Visualizer */}
        {activeGoal && (
          <div className="border border-border-subtle rounded-md bg-bg-base/40 p-4 space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-text-muted">
                GOAL ID: <span className="text-text-primary font-bold">{activeGoal.id.slice(0, 8)}...</span>
              </span>
              <span className="text-text-muted">
                STATUS:{" "}
                <span className="text-success font-bold uppercase">
                  {activeGoal.status}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* DAG Canvas */}
              <div className="lg:col-span-2 border border-border-subtle rounded-sm bg-black/40 overflow-hidden relative min-h-[300px]">
                <svg className="w-full h-[300px]">
                  <defs>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="18"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#4B5563" />
                    </marker>
                  </defs>

                  {/* Draw Edges */}
                  {dag.edges.map((edge, idx) => {
                    const fromNode = dag.nodes.find((n) => n.id === edge.from);
                    const toNode = dag.nodes.find((n) => n.id === edge.to);
                    if (!fromNode || !toNode) return null;

                    return (
                      <line
                        key={`edge-${idx}`}
                        x1={fromNode.x}
                        y1={fromNode.y}
                        x2={toNode.x}
                        y2={toNode.y}
                        stroke="#4B5563"
                        strokeWidth="1.5"
                        markerEnd="url(#arrow)"
                        className="stroke-dashed opacity-70"
                      />
                    );
                  })}

                  {/* Draw Nodes */}
                  {dag.nodes.map((node) => {
                    const isSelected = selectedNode?.id === node.id;
                    const statusColors: any = {
                      COMPLETED: "fill-success stroke-success/30",
                      FAILED: "fill-danger stroke-danger/30",
                      RUNNING: "fill-warning stroke-warning/30 animate-pulse",
                      PENDING: "fill-text-muted stroke-border-subtle",
                    };

                    return (
                      <g
                        key={node.id}
                        className="cursor-pointer group"
                        onClick={() => {
                          const original = activeGoal.objectives.find(
                            (o: any) => o.id === node.id
                          );
                          setSelectedNode(original);
                        }}
                      >
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r="10"
                          className={`${statusColors[node.status] || "fill-gray-500"} transition-all duration-150 ${
                            isSelected ? "r-[13] stroke-accent-intelligence stroke-[3px]" : "group-hover:r-[12]"
                          }`}
                        />
                        <text
                          x={node.x}
                          y={node.y - 18}
                          textAnchor="middle"
                          className="fill-text-primary text-[8px] font-mono font-bold select-none"
                        >
                          {node.title.length > 15 ? `${node.title.slice(0, 15)}...` : node.title}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Node Detail Inspector */}
              <div className="lg:col-span-1 border border-border-subtle bg-bg-surface p-4 rounded-sm space-y-4">
                <div className="border-b border-border-subtle pb-2">
                  <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                    Objective Detail Inspector
                  </h4>
                </div>

                {selectedNode ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="space-y-1">
                      <span className="text-[9px] text-text-muted uppercase block">Title</span>
                      <span className="text-text-primary font-bold font-sans">
                        {selectedNode.title}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] text-text-muted uppercase block">Status</span>
                      <span
                        className={`text-[9px] uppercase border px-1.5 py-0.5 rounded-xs inline-block ${
                          selectedNode.status === "COMPLETED"
                            ? "bg-success/15 text-success border-success/30"
                            : selectedNode.status === "FAILED"
                              ? "bg-danger/15 text-danger border-danger/30"
                              : "bg-warning/15 text-warning border-warning/30"
                        }`}
                      >
                        {selectedNode.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] text-text-muted uppercase block">Description</span>
                      <p className="text-text-secondary leading-normal text-[11px] font-sans">
                        {selectedNode.description || "No description provided."}
                      </p>
                    </div>

                    {selectedNode.dependencies && selectedNode.dependencies.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[9px] text-text-muted uppercase block">Dependencies</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {selectedNode.dependencies.map((depId: string) => {
                            const dep = activeGoal.objectives.find((o: any) => o.id === depId);
                            return (
                              <span
                                key={depId}
                                className="text-[9px] bg-bg-base border border-border-subtle rounded-xs px-1.5 py-0.5"
                              >
                                {dep?.title || depId.slice(0, 8)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-text-muted font-mono uppercase">
                    Select a node in the graph to inspect its parameters.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-bg-surface border border-border-default rounded-md p-5">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4 flex items-center gap-2">
              <Globe className="h-4 w-4 text-accent-intelligence" />
              <span>Geopolitical & Macro Events Stream</span>
            </h2>

            <div className="space-y-4">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-4 bg-bg-base border border-border-subtle rounded-sm space-y-3"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-mono border px-1.5 py-0.5 rounded-xs uppercase ${
                            ev.severity === "high"
                              ? "bg-danger/10 text-danger border-danger/30"
                              : "bg-warning/10 text-warning border-warning/30"
                          }`}
                        >
                          {ev.severity} severity
                        </span>
                        <span className="text-xs font-bold text-text-primary">
                          {ev.title}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        {ev.summary}
                      </p>
                    </div>
                    <div className="text-right shrink-0 font-mono text-xs">
                      <span className="text-text-muted block text-[9px] uppercase">
                        Confidence
                      </span>
                      <span className="text-text-primary font-semibold">
                        {(ev.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-border-subtle pt-2 space-y-2">
                    <div className="text-[9px] font-mono text-text-muted uppercase">
                      Computed Asset Impacts
                    </div>
                    {ev.impacts?.map((imp: any) => (
                      <div
                        key={imp.id}
                        className="flex justify-between items-center bg-bg-surface/50 p-2 rounded-xs text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary font-semibold font-mono">
                            {imp.entityId}
                          </span>
                          <span className="text-text-muted">
                            Domain: {imp.impactDomain}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono">
                          {imp.impactDirection === "positive" ? (
                            <TrendingUp className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5 text-danger" />
                          )}
                          <span
                            className={
                              imp.impactDirection === "positive"
                                ? "text-success"
                                : "text-danger"
                            }
                          >
                            {(imp.impactMagnitude * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="text-center py-12 text-text-muted text-xs font-mono">
                  No macroeconomic events cataloged.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-bg-surface border border-border-default rounded-md p-5">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-danger" />
              <span>Exposure Matrix</span>
            </h2>

            {/* Exposure Matrix - dynamically generated from event impacts */}
            {events.length === 0 ? (
              <div className="text-center py-12 text-text-muted text-xs font-mono">
                No exposure data available.
              </div>
            ) : (
              <div className="space-y-3">
                {events
                  .flatMap((ev) => ev.impacts || [])
                  .map((imp: any) => (
                    <div
                      key={imp.id}
                      className="bg-bg-base p-3 border border-border-subtle rounded-sm flex justify-between items-center text-xs"
                    >
                      <span className="text-text-secondary font-mono">
                        {imp.entityId}
                      </span>
                      <span
                        className={`${imp.impactDirection === "positive" ? "text-success" : "text-warning"} font-bold font-mono`}
                      >
                        {imp.impactDirection === "positive"
                          ? "Low Risk Exposure"
                          : "Medium Risk Exposure"}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
