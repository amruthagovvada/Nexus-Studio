'use client';

import React, { useState, useCallback } from 'react';
import { useCompilerStore } from '@/runtime/compilerStore';
import { VirtualSandboxRenderer } from '@/runtime/renderer';
import { generateExportFiles } from '@/runtime/exporter';
import {
  Wand2, Play, RotateCcw, Code, FileCode, Layers,
  ChevronRight, ChevronDown, Loader2, CheckCircle, XCircle,
  Settings as SettingsIcon, Copy, Check, AlertTriangle,
  Network, RefreshCw, Zap, ServerCrash, Database, Shield,
  Menu, X, Terminal, GitBranch,
} from 'lucide-react';

/* ─── CONSTANTS ─────────────────────────────────────────────────── */

const PRESETS = [
  { label: 'Business CRM', prompt: 'Create a Business CRM system. We need entities for Clients (name, company, email, status enum: Lead/Active/Inactive), Deals (title, value number, stage enum: Pitch/Negotiation/Won/Lost, ownerId pointing to User), and Payments (amount number, paymentDate, status enum: Pending/Completed/Failed, dealId fk Deal). Only Admin and Manager roles can perform delete actions on Payments.' },
  { label: 'Hospital Management', prompt: 'Build a Hospital Management System to track Patients (name, age number, gender, medicalHistory), Doctors (name, specialty, roomNumber), Appointments (appointmentDate, status enum: Scheduled/Completed/Cancelled, patientId fk Patient, doctorId fk Doctor), and Prescriptions (dosage, instructions, doctorId fk Doctor, patientId fk Patient). Only Doctors can write or update patient prescriptions, and Staff can manage appointments.' },
  { label: 'E-Commerce', prompt: 'Design an E-Commerce Platform for inventory management. We need entities for Products (sku, name, price number, stockQty number), Categories (name, description), and Orders (orderDate, status enum: Pending/Shipped/Delivered, customerId fk User). Customers can only view products and their own orders, while managers update catalogs and process orders.' },
  { label: 'Analytics', prompt: 'Create a Sales Analytics Dashboard to track sales representatives, deals, revenues, and targets. Only managers can update performance thresholds, while analysts view aggregated reports.' },
  { label: 'LMS', prompt: 'Create a Learning Management System (LMS). Track Courses (title, description, code), Lessons (title, content, duration number, courseId fk Course), and Enrollments (enrollmentDate, status enum: Active/Completed, studentId fk User, courseId fk Course). Students can view courses and lessons, and teachers can create content.' },
  { label: 'Asset Tracking', prompt: 'Build an Asset Management System tracking hardware assets. Create an Asset table (tag, name, type enum: Laptop/Phone/Monitor, status enum: In-Use/Repair/Storage) and a MaintenanceLog table (title, cost number, details, status enum: Open/Resolved, assetId fk Asset, ownerId fk User). Restrict editing of asset tags to Admins.' },
];

const FAILURE_SCENARIOS = [
  {
    id: 1, name: 'Relationship Integrity Violation',
    description: "FK on Contact.ownerId references non-existent entity 'InvalidTarget'.",
    brokenCode: JSON.stringify({ Contact: { fields: { id: { type: 'string', primaryKey: true }, ownerId: { type: 'string', foreignKey: { entity: 'InvalidTarget', field: 'id' } } } } }, null, 2),
    repairedCode: JSON.stringify({ Contact: { fields: { id: { type: 'string', primaryKey: true }, ownerId: { type: 'string', foreignKey: { entity: 'User', field: 'id' } } } } }, null, 2),
    validationError: "FK Contact.ownerId → non-existent entity 'InvalidTarget'",
    repairActions: ["Detected invalid FK target 'InvalidTarget'", "Re-routed to active 'User' table", 'Validated PK type compatibility'],
    latency: 245, tokens: 412,
  },
  {
    id: 2, name: 'Cross-Layer Binding Dissonance',
    description: "UI component references 'phoneNumber' absent from DB schema.",
    brokenCode: JSON.stringify({ UI: { props: ['id', 'name', 'phoneNumber'] }, DB: { Contact: { fields: { id: {}, name: {} } } } }, null, 2),
    repairedCode: JSON.stringify({ UI: { props: ['id', 'name', 'phoneNumber'] }, DB: { Contact: { fields: { id: {}, name: {}, phoneNumber: { type: 'string', required: false } } } } }, null, 2),
    validationError: "Component prop 'phoneNumber' not in schema 'Contact'",
    repairActions: ["Flagged missing field 'phoneNumber' in Contact", "Injected phoneNumber: string (optional)", 'Synchronized schema ↔ component layers'],
    latency: 382, tokens: 580,
  },
  {
    id: 3, name: 'Escalated Privilege Violation',
    description: "User role granted 'delete' on Payment — violates security policy.",
    brokenCode: JSON.stringify({ Rule: { role: 'User', entity: 'Payment', actions: ['read', 'delete'] } }, null, 2),
    repairedCode: JSON.stringify({ Rule: { role: 'User', entity: 'Payment', actions: ['read'] } }, null, 2),
    validationError: "Role 'User' has unauthorized 'delete' on 'Payment'",
    repairActions: ["Flagged 'delete' for role 'User' on Payment", "Removed 'delete' from permission set", 'Saved updated RBAC policy'],
    latency: 198, tokens: 345,
  },
];

type NavId = 'compile' | 'ast' | 'graph' | 'validator' | 'sandbox' | 'export' | 'self-repair';

const NAV_ITEMS: { id: NavId; label: string; icon: any; group: 'main' | 'tools'; requiresAst?: boolean }[] = [
  { id: 'compile',     label: 'Compile',      icon: Terminal,    group: 'main' },
  { id: 'ast',         label: 'AST Model',    icon: Code,        group: 'main', requiresAst: true },
  { id: 'graph',       label: 'Graph',        icon: GitBranch,   group: 'main', requiresAst: true },
  { id: 'validator',   label: 'Validator',    icon: Layers,      group: 'main', requiresAst: true },
  { id: 'sandbox',     label: 'Sandbox',      icon: Play,        group: 'main', requiresAst: true },
  { id: 'export',      label: 'Export',       icon: FileCode,    group: 'main', requiresAst: true },
  { id: 'self-repair', label: 'Self-Repair',  icon: ServerCrash, group: 'tools' },
];

/* ─── TINY HELPERS ───────────────────────────────────────────────── */

const Dot = ({ color }: { color: string }) => (
  <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
);

const Tag = ({ children, color = 'zinc' }: { children: React.ReactNode; color?: string }) => {
  const cls: Record<string, string> = {
    zinc:    'bg-zinc-800 text-zinc-400 border-zinc-700',
    indigo:  'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    rose:    'bg-rose-500/10 text-rose-400 border-rose-500/20',
    sky:     'bg-sky-500/10 text-sky-400 border-sky-500/20',
    violet:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${cls[color] ?? cls.zinc}`}>
      {children}
    </span>
  );
};

/* ─── COMPONENT ─────────────────────────────────────────────────── */

export default function CompilerDashboard() {
  /* Zustand selectors */
  const prompt           = useCompilerStore((s) => s.prompt);
  const apiKey           = useCompilerStore((s) => s.apiKey);
  const ast              = useCompilerStore((s) => s.ast);
  const isCompiling      = useCompilerStore((s) => s.isCompiling);
  const currentStage     = useCompilerStore((s) => s.currentStage);
  const traces           = useCompilerStore((s) => s.traces);
  const validationReport = useCompilerStore((s) => s.validationReport);
  const repairIterations = useCompilerStore((s) => s.repairIterations);
  const source           = useCompilerStore((s) => s.source);
  const setPrompt        = useCompilerStore((s) => s.setPrompt);
  const setApiKey        = useCompilerStore((s) => s.setApiKey);
  const resetCompiler    = useCompilerStore((s) => s.resetCompiler);
  const runFullPipeline  = useCompilerStore((s) => s.runFullPipeline);

  /* Local UI state */
  const [activeNav, setActiveNav] = useState<NavId>('compile');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [selectedExportFile, setSelectedExportFile] = useState<string>('');
  const [viewRawAst, setViewRawAst] = useState(false);
  const [prevIsCompiling, setPrevIsCompiling] = useState(false);
  const [expandedAstSections, setExpandedAstSections] = useState<Record<string, boolean>>({ intent: true, assumptions: false, architecture: false, schema: true });
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [highlightedEdges, setHighlightedEdges] = useState<Set<number>>(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const [failureResults, setFailureResults] = useState<Record<number, {
    status: 'idle' | 'broken' | 'repairing' | 'repaired';
    errors: string; repairs: string[]; latency: number; tokens: number;
  }>>({});

  /* Auto-switch to sandbox after successful compile */
  React.useEffect(() => {
    if (prevIsCompiling && !isCompiling && ast) setActiveNav('sandbox');
    setPrevIsCompiling(isCompiling);
  }, [isCompiling, ast, prevIsCompiling]);

  /* Export files */
  const exportFiles     = ast ? generateExportFiles(ast) : {};
  const exportFilenames = Object.keys(exportFiles);
  React.useEffect(() => {
    if (exportFilenames.length > 0 && !selectedExportFile) setSelectedExportFile(exportFilenames[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportFilenames.join(','), selectedExportFile]);

  /* Handlers */
  const handleCompile = useCallback(async () => {
    if (!prompt?.trim() || isCompiling) return;
    await runFullPipeline();
  }, [prompt, isCompiling, runFullPipeline]);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFile(key);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const handleDownload = (filename: string, code: string) => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([code], { type: 'text/plain' })),
      download: filename.split('/').pop() || filename,
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleGraphNodeClick = (nodeId: string) => {
    if (!ast) return;
    if (selectedGraphNode === nodeId) {
      setSelectedGraphNode(null); setHighlightedNodes(new Set()); setHighlightedEdges(new Set()); return;
    }
    setSelectedGraphNode(nodeId);
    const nodes = new Set<string>([nodeId]);
    const edges = new Set<number>();
    ast.dependencyGraph.edges.forEach((e, i) => {
      if (e.source === nodeId || e.target === nodeId) {
        nodes.add(e.source === nodeId ? e.target : e.source); edges.add(i);
      }
    });
    setHighlightedNodes(nodes); setHighlightedEdges(edges);
  };

  const runFailureScenario = async (id: number) => {
    const s = FAILURE_SCENARIOS.find(x => x.id === id)!;
    setFailureResults(p => ({ ...p, [id]: { status: 'broken', errors: s.validationError, repairs: [], latency: 0, tokens: 0 } }));
    await new Promise(r => setTimeout(r, 1000));
    setFailureResults(p => ({ ...p, [id]: { ...p[id], status: 'repairing' } }));
    await new Promise(r => setTimeout(r, 1400));
    setFailureResults(p => ({ ...p, [id]: { ...p[id], status: 'repaired', repairs: s.repairActions, latency: s.latency, tokens: s.tokens } }));
  };

  const runAllFailureScenarios = async () => {
    setRunningAll(true);
    for (const s of FAILURE_SCENARIOS) await runFailureScenario(s.id);
    setRunningAll(false);
  };

  /* Stage helpers */
  const stageStatus = (stage: string) => {
    if (isCompiling && currentStage === stage) return 'running';
    const t = traces.find(t => t.stage === stage);
    return t ? (t.status === 'skipped' ? 'cached' : t.status) : 'idle';
  };

  const STAGE_ROWS: [string, string][] = [
    ['intent', 'Intent Parsing'],
    ['assumptions', 'Assumption Mapping'],
    ['architecture', 'Architecture Gen'],
    ['schema', 'Schema Compilation'],
    ['graph', 'Dependency Graph'],
    ['validate', 'Semantic Validation'],
    ['repair', 'Self-Repair Engine'],
  ];

  /* ─── SUB-RENDERERS ──────────────────────────────────────── */

  const StageList = () => (
    <div className="divide-y divide-white/[0.04]">
      {STAGE_ROWS.map(([id, label]) => {
        const st    = stageStatus(id);
        const trace = traces.find(t => t.stage === id);
        const dot   = st === 'running' ? 'bg-amber-400 animate-pulse' :
                      st === 'success' || st === 'cached' ? 'bg-emerald-500' :
                      st === 'failed'  ? 'bg-rose-500' : 'bg-zinc-700';
        const badge = st === 'running' ? 'amber' : st === 'success' || st === 'cached' ? 'emerald' : st === 'failed' ? 'rose' : 'zinc';
        const text  = st === 'running' ? 'Running' : st === 'cached' ? 'Cached' : st === 'success' ? 'Done' : st === 'failed' ? 'Failed' : '—';
        return (
          <div key={id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2.5">
              <Dot color={dot} />
              <span className="text-[12px] text-zinc-300">{label}</span>
            </div>
            <div className="flex items-center gap-2.5">
              {trace && <span className="text-[11px] text-zinc-600 font-mono">{trace.durationMs}ms</span>}
              <Tag color={badge}>{st === 'running' ? <Loader2 className="h-2.5 w-2.5 animate-spin inline mr-1" /> : null}{text}</Tag>
            </div>
          </div>
        );
      })}
    </div>
  );

  const AstSection = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border border-white/[0.06] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpandedAstSections(p => ({ ...p, [id]: !p[id] }))}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-900/50 hover:bg-zinc-900/80 transition-colors"
      >
        <span className="text-[12px] font-semibold text-zinc-300">{title}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-zinc-600 transition-transform ${expandedAstSections[id] ? 'rotate-180' : ''}`} />
      </button>
      {expandedAstSections[id] && <div className="p-4 bg-zinc-950/30">{children}</div>}
    </div>
  );

  const Panel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`border border-white/[0.06] rounded-lg bg-zinc-900/30 ${className}`}>{children}</div>
  );

  const PanelHeader = ({ title, action }: { title: string; action?: React.ReactNode }) => (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
      {action}
    </div>
  );

  /* ─── COMPILE TAB ────────────────────────────────────────── */

  const CompileView = () => (
    <div className="flex gap-4 h-full">
      {/* Left 60% — Prompt editor */}
      <div className="flex-[3] flex flex-col gap-3 min-w-0">
        {/* Editor */}
        <Panel className="flex flex-col flex-1">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Prompt</span>
            <div className="flex items-center gap-2">
              <button
                onClick={resetCompiler}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 border border-white/[0.06] hover:border-white/[0.12] rounded-md transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
              <button
                type="button"
                disabled={isCompiling || !prompt?.trim()}
                onClick={handleCompile}
                className="flex items-center gap-1.5 px-3 py-1 text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-md transition-colors"
              >
                {isCompiling
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Compiling</>
                  : <><Play className="h-3 w-3" /> Run</>}
              </button>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe your application — entities, relationships, roles, and business rules…"
            className="flex-1 resize-none bg-transparent px-4 py-3 text-[13px] text-zinc-200 placeholder-zinc-700 focus:outline-none font-mono leading-relaxed min-h-[220px]"
            spellCheck={false}
          />
          <div className="px-4 py-2 border-t border-white/[0.04] flex items-center justify-between">
            <span className="text-[10px] text-zinc-700 font-mono">{prompt?.length ?? 0} chars</span>
            {prompt?.trim() && !isCompiling && (
              <span className="text-[10px] text-emerald-500 flex items-center gap-1.5">
                <Dot color="bg-emerald-500" /> Ready
              </span>
            )}
          </div>
        </Panel>

        {/* Presets row */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => setPrompt(p.prompt)}
              className="px-2.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-200 border border-white/[0.05] hover:border-indigo-500/30 hover:bg-indigo-500/5 rounded-md transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Post-compile summary */}
        {ast && !isCompiling && (
          <Panel>
            <PanelHeader title="Compilation Result" />
            <div className="px-4 py-3 flex flex-wrap gap-2 items-center">
              <span className="text-[13px] font-semibold text-white">{ast.appName}</span>
              <Tag color="zinc">{ast.intent.detectedDomain}</Tag>
              {ast.intent.entities.slice(0, 5).map(e => <Tag key={e} color="indigo">{e}</Tag>)}
              {ast.intent.roles.map(r => <Tag key={r} color="emerald">{r}</Tag>)}
              {source && <Tag color="violet">{source}</Tag>}
              <span className="text-[11px] text-zinc-600">
                {Object.keys(ast.schema.entities).length} tables · {ast.permissions.rules.length} rules
              </span>
            </div>
          </Panel>
        )}
      </div>

      {/* Right 40% — Pipeline trace */}
      <div className="flex-[2] min-w-0">
        <Panel className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Pipeline</span>
            {ast && !isCompiling && (
              <span className="text-[10px] text-zinc-600 font-mono">
                {traces.reduce((s, t) => s + t.durationMs, 0)}ms
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            <StageList />
          </div>
          {traces.some(t => t.error?.includes('Cache')) && (
            <div className="px-4 py-2 border-t border-white/[0.04] flex items-start gap-2">
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-amber-400/80">Cache invalidated — full recompile executed</span>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );

  /* ─── AST VIEW ───────────────────────────────────────────── */

  const AstView = () => {
    if (!ast) return null;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-white">{ast.appName}</span>
            <Tag color="zinc">{ast.intent.detectedDomain}</Tag>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-500">JSON view</span>
            <button
              onClick={() => setViewRawAst(s => !s)}
              className={`relative h-5 w-8 rounded-full transition-colors ${viewRawAst ? 'bg-indigo-600' : 'bg-zinc-800'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${viewRawAst ? 'translate-x-3' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {viewRawAst ? (
          <div className="space-y-2">
            {[
              { id: 'intent', title: 'Intent Model', content: ast.intent },
              { id: 'assumptions', title: 'Design Assumptions', content: ast.assumptions },
              { id: 'architecture', title: 'Architecture', content: ast.architecture },
              { id: 'schema', title: 'Schema & Permissions', content: { schema: ast.schema, permissions: ast.permissions } },
            ].map(sec => {
              const code = JSON.stringify(sec.content, null, 2);
              return (
                <AstSection key={sec.id} id={sec.id} title={sec.title}>
                  <div className="flex justify-end mb-2">
                    <button onClick={() => handleCopy(sec.id, code)} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
                      {copiedFile === sec.id ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                    </button>
                  </div>
                  <pre className="text-[11px] text-zinc-400 font-mono leading-relaxed max-h-72 overflow-auto">{code}</pre>
                </AstSection>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Intent */}
            <AstSection id="intent" title="Intent Model">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Description</p>
                    <p className="text-[12px] text-zinc-300 leading-relaxed">{ast.intent.description}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Roles</p>
                    <div className="flex flex-wrap gap-1">{ast.intent.roles.map(r => <Tag key={r} color="indigo">{r}</Tag>)}</div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Features</p>
                  <ul className="space-y-1">
                    {ast.intent.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-zinc-400">
                        <CheckCircle className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AstSection>

            {/* Assumptions */}
            <AstSection id="assumptions" title="Design Assumptions">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(ast.assumptions || []).map(a => (
                  <div key={a.id} className="flex items-start gap-2 p-2.5 border border-white/[0.05] rounded-lg">
                    <Dot color={a.enabled ? 'bg-emerald-500' : 'bg-zinc-700'} />
                    <div>
                      <p className="text-[12px] text-zinc-300">{a.statement}</p>
                      <p className="text-[11px] text-zinc-600 mt-0.5">{a.impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AstSection>

            {/* Architecture */}
            <AstSection id="architecture" title="System Architecture">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Pages</p>
                  <div className="space-y-1.5">
                    {ast.architecture.pages.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2 border border-white/[0.05] rounded-md">
                        <span className="text-[12px] text-zinc-300">{p.title}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-zinc-600 font-mono">{p.route}</span>
                          <Tag color="zinc">{p.type}</Tag>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Components</p>
                  <div className="space-y-1.5">
                    {ast.architecture.components.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-2 border border-white/[0.05] rounded-md">
                        <span className="text-[12px] text-zinc-300">{c.name}</span>
                        <div className="flex items-center gap-1.5">
                          {c.entity && <span className="text-[10px] text-indigo-400 font-mono">{c.entity}</span>}
                          <Tag color="emerald">{c.type}</Tag>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AstSection>

            {/* Schema */}
            <AstSection id="schema" title="Database Schema">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(ast.schema.entities).map(([name, entity]) => (
                  <div key={name} className="border border-white/[0.06] rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/60 border-b border-white/[0.05]">
                      <Database className="h-3 w-3 text-indigo-400" />
                      <span className="text-[12px] font-mono font-semibold text-white">{name}</span>
                    </div>
                    <table className="w-full text-[11px] font-mono">
                      <thead>
                        <tr className="border-b border-white/[0.04]">
                          <th className="px-3 py-1.5 text-left text-[10px] text-zinc-600 uppercase font-medium">Field</th>
                          <th className="py-1.5 text-left text-[10px] text-zinc-600 uppercase font-medium">Type</th>
                          <th className="py-1.5 pr-3 text-right text-[10px] text-zinc-600 uppercase font-medium">Attrs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {Object.entries(entity.fields).map(([fn, f]) => (
                          <tr key={fn} className="hover:bg-white/[0.02]">
                            <td className="px-3 py-1.5 text-zinc-300">{fn}</td>
                            <td className="py-1.5">
                              <Tag color={f.type === 'number' ? 'amber' : f.type === 'boolean' ? 'sky' : f.type === 'date' ? 'emerald' : f.type?.startsWith('enum') ? 'violet' : 'zinc'}>
                                {f.type}
                              </Tag>
                            </td>
                            <td className="py-1.5 pr-3 text-right space-x-1">
                              {f.primaryKey && <Tag color="indigo">PK</Tag>}
                              {f.unique && <Tag color="zinc">UQ</Tag>}
                              {f.foreignKey && <Tag color="violet">→{f.foreignKey.entity}</Tag>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </AstSection>

            {/* Permissions */}
            <AstSection id="permissions" title="RBAC Policies">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {ast.permissions.rules.map((rule, i) => (
                  <div key={i} className="p-3 border border-white/[0.05] rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-white">{rule.role}</span>
                      <Shield className="h-3.5 w-3.5 text-zinc-700" />
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono">{rule.entity}</span>
                    <div className="flex flex-wrap gap-1">
                      {(['create', 'read', 'update', 'delete'] as const).map(a => (
                        <Tag key={a} color={rule.actions.includes(a) ? 'emerald' : 'zinc'}>{a}</Tag>
                      ))}
                    </div>
                    {rule.condition && (
                      <code className="block text-[10px] text-amber-400/80 font-mono bg-zinc-950/50 p-1.5 rounded border border-white/[0.04] truncate">
                        {rule.condition}
                      </code>
                    )}
                  </div>
                ))}
              </div>
            </AstSection>
          </div>
        )}
      </div>
    );
  };

  /* ─── GRAPH VIEW ─────────────────────────────────────────── */

  const GraphView = () => {
    if (!ast) return null;
    const LAYERS: { type: 'ui' | 'api' | 'db' | 'permission'; label: string; color: string }[] = [
      { type: 'ui',         label: 'UI',          color: 'text-indigo-400 border-indigo-500/20' },
      { type: 'api',        label: 'API',          color: 'text-violet-400 border-violet-500/20' },
      { type: 'db',         label: 'Database',     color: 'text-blue-400 border-blue-500/20' },
      { type: 'permission', label: 'Permissions',  color: 'text-rose-400 border-rose-500/20' },
    ];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-white">Dependency Map</span>
            <Tag color="zinc">{(ast.dependencyGraph?.nodes || []).length} nodes · {(ast.dependencyGraph?.edges || []).length} edges</Tag>
          </div>
          {selectedGraphNode && (
            <button onClick={() => { setSelectedGraphNode(null); setHighlightedNodes(new Set()); setHighlightedEdges(new Set()); }}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 px-2.5 py-1 border border-white/[0.06] rounded-md transition-colors">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {LAYERS.map(layer => {
            const nodes = (ast.dependencyGraph?.nodes || []).filter(n => n.type === layer.type);
            return (
              <Panel key={layer.type}>
                <div className={`px-3 py-2 border-b border-white/[0.05] text-[11px] font-semibold uppercase tracking-wider ${layer.color.split(' ')[0]}`}>
                  {layer.label} <span className="text-zinc-700">({nodes.length})</span>
                </div>
                <div className="p-2 space-y-1.5">
                  {nodes.map(node => {
                    const sel = selectedGraphNode === node.id;
                    const hl  = highlightedNodes.has(node.id);
                    const dim = selectedGraphNode !== null && !sel && !hl;
                    const out = (ast.dependencyGraph?.edges || []).filter(e => e.source === node.id);
                    return (
                      <button
                        key={node.id}
                        onClick={() => handleGraphNodeClick(node.id)}
                        className={`w-full text-left p-2 rounded-md border transition-all text-[11px] ${
                          sel  ? 'border-indigo-500 bg-indigo-500/10' :
                          hl   ? 'border-indigo-500/30 bg-indigo-500/5' :
                          dim  ? 'border-white/[0.03] opacity-25' :
                          'border-white/[0.05] hover:border-white/[0.1] hover:bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-zinc-200 truncate">{node.label}</span>
                          {sel && <span className="text-[9px] bg-indigo-600 text-white px-1 rounded shrink-0">active</span>}
                        </div>
                        {out.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {out.slice(0, 3).map((e, ei) => (
                              <div key={ei} className="flex items-center gap-1 text-[10px] text-zinc-600">
                                <ChevronRight className="h-2.5 w-2.5" />
                                <span className="truncate">{e.target.split(':')[1] || e.target}</span>
                              </div>
                            ))}
                            {out.length > 3 && <span className="text-[10px] text-zinc-700">+{out.length - 3} more</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    );
  };

  /* ─── VALIDATOR VIEW ─────────────────────────────────────── */

  const ValidatorView = () => {
    if (!validationReport) return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <Layers className="h-8 w-8 text-zinc-800" />
        <p className="text-[13px] text-zinc-500">No validation data yet. Compile a project first.</p>
      </div>
    );

    const PASSES: [string, string][] = [
      ['schema', 'Pass 1 — Schema Integrity'],
      ['relationship', 'Pass 2 — Referential Integrity'],
      ['permission', 'Pass 3 — RBAC Authorization'],
      ['cross-layer', 'Pass 4 — Full-Stack Binding'],
      ['runtime', 'Pass 5 — Runtime Expressions'],
    ];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Metrics */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Status',     value: validationReport.isValid ? 'Valid' : 'Issues', color: validationReport.isValid ? 'text-emerald-400' : 'text-rose-400' },
            { label: 'Errors',     value: validationReport.errors.filter(e => e.severity === 'error').length.toString(), color: 'text-white' },
            { label: 'Warnings',   value: validationReport.errors.filter(e => e.severity === 'warning').length.toString(), color: 'text-amber-400' },
            { label: 'Repair Cycles', value: repairIterations.toString(), color: 'text-indigo-400' },
          ].map(m => (
            <Panel key={m.label} className="px-4 py-3">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{m.label}</p>
              <p className={`text-[22px] font-bold mt-1 ${m.color}`}>{m.value}</p>
            </Panel>
          ))}
        </div>

        {/* 5-pass audit */}
        <div className="lg:col-span-2">
          <Panel>
            <PanelHeader title="Semantic Pass Audit" />
            <div className="divide-y divide-white/[0.04]">
              {PASSES.map(([key, name]) => {
                const errs = validationReport.errors.filter(e => e.pass === key);
                const ok   = errs.length === 0;
                const err  = errs.some(e => e.severity === 'error');
                return (
                  <div key={key} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {ok ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> :
                       err ? <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" /> :
                       <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      <span className="text-[12px] text-zinc-300">{name}</span>
                    </div>
                    <Tag color={ok ? 'emerald' : err ? 'rose' : 'amber'}>{ok ? 'Pass' : err ? 'Error' : 'Warn'}</Tag>
                  </div>
                );
              })}
            </div>

            {/* Diagnostics */}
            {validationReport.errors.length > 0 && (
              <>
                <div className="border-t border-white/[0.05] px-4 pt-3 pb-1">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Diagnostics</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {validationReport.errors.map((err, i) => (
                    <div key={i} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Tag color={err.severity === 'error' ? 'rose' : 'amber'}>{err.severity}</Tag>
                        <span className="text-[10px] text-zinc-600 font-mono">{err.path}</span>
                      </div>
                      <p className="text-[12px] text-zinc-300">{err.message}</p>
                      {err.fixSuggestion && (
                        <p className="text-[11px] text-indigo-400/80 border-l-2 border-indigo-500/30 pl-2">{err.fixSuggestion}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {validationReport.errors.length === 0 && (
              <div className="py-8 flex flex-col items-center gap-2 text-center border-t border-white/[0.05]">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
                <p className="text-[12px] text-zinc-400">All 5 passes completed with no issues</p>
              </div>
            )}
          </Panel>
        </div>

        {/* Self-correction timeline */}
        <div>
          <Panel className="h-full">
            <PanelHeader title="Repair Log" />
            <div className="p-4">
              {repairIterations === 0 ? (
                <p className="text-[12px] text-zinc-600 italic">No repair cycles triggered.</p>
              ) : (
                <div className="relative border-l border-zinc-800 ml-2 pl-4 space-y-4">
                  {traces.filter(t => t.stage === 'repair').map((trace, i) => (
                    <div key={i} className="relative">
                      <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-zinc-900 border border-indigo-500 flex items-center justify-center">
                        <span className="h-1 w-1 rounded-full bg-indigo-500" />
                      </span>
                      <p className="text-[12px] font-semibold text-white">Cycle #{i + 1}</p>
                      <p className="text-[10px] text-zinc-600 font-mono">{trace.durationMs}ms</p>
                      {trace.repairsMade && trace.repairsMade.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {trace.repairsMade.map((r, ri) => (
                            <p key={ri} className="text-[11px] text-emerald-400 flex items-start gap-1">
                              <span className="shrink-0 mt-0.5">✓</span>{r}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    );
  };

  /* ─── EXPORT VIEW ────────────────────────────────────────── */

  const ExportView = () => {
    if (!ast) return null;
    return (
      <div className="flex gap-4 h-full">
        <div className="w-48 shrink-0 space-y-0.5">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-2 py-1.5">Files</p>
          {exportFilenames.map(fn => (
            <button
              key={fn}
              onClick={() => setSelectedExportFile(fn)}
              className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md text-[11px] font-mono transition-colors ${
                selectedExportFile === fn ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
              }`}
            >
              <FileCode className="h-3 w-3 shrink-0" />
              <span className="truncate">{fn}</span>
            </button>
          ))}
        </div>

        <Panel className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
            <span className="text-[11px] font-mono text-zinc-400">{selectedExportFile}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => handleCopy(selectedExportFile, exportFiles[selectedExportFile])}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 px-2.5 py-1 border border-white/[0.06] rounded-md transition-colors">
                {copiedFile === selectedExportFile ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
              <button onClick={() => handleDownload(selectedExportFile, exportFiles[selectedExportFile])}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 px-2.5 py-1 border border-indigo-500/20 rounded-md transition-colors">
                <FileCode className="h-3 w-3" /> Download
              </button>
            </div>
          </div>
          <pre className="flex-1 overflow-auto p-4 text-[11px] text-zinc-300 font-mono leading-relaxed">
            {exportFiles[selectedExportFile] || '// No content yet'}
          </pre>
        </Panel>
      </div>
    );
  };

  /* ─── SELF-REPAIR VIEW ───────────────────────────────────── */

  const SelfRepairView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-white">Self-Repair Engine</p>
          <p className="text-[12px] text-zinc-600 mt-0.5">Simulate error injection and automated AST correction</p>
        </div>
        <button
          disabled={runningAll}
          onClick={runAllFailureScenarios}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors"
        >
          {runningAll ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Running</> : <><Zap className="h-3.5 w-3.5" /> Run All</>}
        </button>
      </div>

      <div className="space-y-3">
        {FAILURE_SCENARIOS.map(scenario => {
          const r = failureResults[scenario.id];
          return (
            <Panel key={scenario.id}>
              <div className="flex items-start justify-between px-4 py-3 border-b border-white/[0.05]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-zinc-200">{scenario.name}</span>
                    {r && (
                      <Tag color={r.status === 'repaired' ? 'emerald' : r.status === 'broken' ? 'rose' : r.status === 'repairing' ? 'amber' : 'zinc'}>
                        {r.status === 'idle' ? '—' : r.status === 'broken' ? 'Failed' : r.status === 'repairing' ? 'Repairing' : 'Repaired ✓'}
                      </Tag>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-0.5">{scenario.description}</p>
                </div>
                <button
                  disabled={r?.status === 'repairing'}
                  onClick={() => runFailureScenario(scenario.id)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 border border-white/[0.06] hover:border-white/[0.12] rounded-md transition-colors shrink-0 ml-4 disabled:opacity-30"
                >
                  <RefreshCw className="h-3 w-3" /> Run
                </button>
              </div>

              {r && (
                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Injected Error</p>
                    <pre className="p-3 bg-zinc-950/60 border border-white/[0.04] rounded-lg text-[10px] font-mono text-zinc-500 max-h-32 overflow-auto">{scenario.brokenCode}</pre>
                    {r.errors && (
                      <div className="flex items-start gap-2 p-2.5 bg-rose-500/5 border border-rose-500/10 rounded-lg">
                        <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-rose-400">{r.errors}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Repair Output</p>
                    {r.status === 'repaired' ? (
                      <>
                        <pre className="p-3 bg-zinc-950/60 border border-white/[0.04] rounded-lg text-[10px] font-mono text-zinc-300 max-h-32 overflow-auto">{scenario.repairedCode}</pre>
                        <div className="space-y-1">
                          {r.repairs.map((a, i) => (
                            <p key={i} className="text-[11px] text-emerald-400 flex items-start gap-1">
                              <span className="shrink-0">✓</span>{a}
                            </p>
                          ))}
                          <div className="flex gap-3 pt-1 border-t border-white/[0.04] text-[10px] text-zinc-600 font-mono">
                            <span>{r.latency}ms</span><span>{r.tokens} tokens</span>
                          </div>
                        </div>
                      </>
                    ) : r.status === 'repairing' ? (
                      <div className="flex items-center gap-2 p-3 text-[12px] text-zinc-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" /> Executing corrections…
                      </div>
                    ) : (
                      <div className="h-32 border border-dashed border-white/[0.05] rounded-lg flex items-center justify-center text-[11px] text-zinc-700">
                        Awaiting repair
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );

  /* ─── LOCKED STATE ───────────────────────────────────────── */

  const LockedView = ({ nav }: { nav: NavId }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <div className="h-10 w-10 border border-white/[0.08] rounded-xl flex items-center justify-center">
        <Wand2 className="h-4.5 w-4.5 text-zinc-700" />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-zinc-400">No compiled project</p>
        <p className="text-[12px] text-zinc-600 mt-1">Run a compilation from the Compile view to unlock {nav}.</p>
      </div>
      <button onClick={() => setActiveNav('compile')} className="text-[12px] text-indigo-400 hover:text-indigo-300 transition-colors">
        Go to Compile →
      </button>
    </div>
  );

  /* ─── SIDEBAR ────────────────────────────────────────────── */

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={`flex flex-col border-r border-white/[0.06] bg-[#111115] ${mobile ? 'w-full h-full' : 'w-[200px] shrink-0 h-screen sticky top-0'}`}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/[0.06]">
        <div className="h-7 w-7 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
          <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" />
            <polyline points="12 22 12 12 20.66 7" />
            <polyline points="12 12 3.34 7" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white leading-none">Nexus Studio</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">Compiler v2</p>
        </div>
        {mobile && (
          <button onClick={() => setSidebarOpen(false)} className="ml-auto text-zinc-500 hover:text-zinc-300 p-1">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Status pill */}
      <div className="px-4 py-3 border-b border-white/[0.05]">
        {isCompiling ? (
          <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Compiling…
          </span>
        ) : ast ? (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <Dot color="bg-emerald-500" /> {ast.appName}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-600">
            <Dot color="bg-zinc-700" /> No project
          </span>
        )}
      </div>

      {/* Nav items */}
      <div className="flex-1 overflow-auto py-2 px-2 space-y-0.5">
        {NAV_ITEMS.filter(n => n.group === 'main').map(item => {
          const Icon   = item.icon;
          const active = activeNav === item.id;
          const locked = !!item.requiresAst && !ast;
          return (
            <button
              key={item.id}
              disabled={locked}
              onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12px] font-medium transition-colors ${
                active  ? 'bg-white/[0.08] text-white' :
                locked  ? 'text-zinc-700 cursor-not-allowed' :
                'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
              {item.requiresAst && ast && !active && (
                <Dot color="bg-emerald-500" />
              )}
            </button>
          );
        })}

        <div className="my-2 border-t border-white/[0.05]" />

        {NAV_ITEMS.filter(n => n.group === 'tools').map(item => {
          const Icon   = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12px] font-medium transition-colors ${
                active ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Settings */}
      <div className="border-t border-white/[0.06] p-2">
        <button
          onClick={() => { setShowSettings(s => !s); setSidebarOpen(false); }}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12px] font-medium transition-colors ${
            showSettings ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
          }`}
        >
          <SettingsIcon className="h-3.5 w-3.5 shrink-0" /> Settings
        </button>
      </div>
    </nav>
  );

  /* ─── SETTINGS PANEL ─────────────────────────────────────── */

  const SettingsPanel = () => (
    <div className="border-b border-white/[0.06] bg-[#0f0f13] px-6 py-3">
      <div className="max-w-md flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-[11px] text-zinc-500 mb-1.5">AI Engine API Key</label>
          <input
            type="password"
            placeholder="sk-…"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="w-full px-3 py-1.5 bg-zinc-950 border border-white/[0.07] rounded-md text-[12px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-indigo-500/60 font-mono"
          />
        </div>
        <button onClick={() => setShowSettings(false)} className="mt-4 p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  /* ─── TOP BAR (breadcrumb + actions) ─────────────────────── */

  const currentNav = NAV_ITEMS.find(n => n.id === activeNav)!;

  const TopBar = () => (
    <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#0c0c10]">
      <div className="flex items-center gap-2 min-w-0">
        <button
          className="md:hidden p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          onClick={() => setSidebarOpen(s => !s)}
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-semibold text-white">{currentNav?.label}</span>
        {ast && activeNav !== 'compile' && (
          <>
            <span className="text-zinc-700">/</span>
            <span className="text-[12px] text-zinc-500 truncate">{ast.appName}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {activeNav === 'compile' && (
          <button
            type="button"
            disabled={isCompiling || !prompt?.trim()}
            onClick={handleCompile}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            {isCompiling
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Compiling</>
              : <><Play className="h-3.5 w-3.5" /> Run</>}
          </button>
        )}
        {ast && (
          <button
            onClick={() => setActiveNav('export')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 border border-white/[0.07] hover:border-white/[0.14] rounded-md transition-colors"
          >
            <FileCode className="h-3.5 w-3.5" /> Export
          </button>
        )}
      </div>
    </div>
  );

  /* ─── ROOT RENDER ────────────────────────────────────────── */

  const needsAst = NAV_ITEMS.find(n => n.id === activeNav)?.requiresAst;

  return (
    <div className="min-h-screen bg-[#0c0c10] text-zinc-100 flex font-sans antialiased">

      {/* ── Desktop sidebar ── */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 h-full">
            <Sidebar mobile />
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <TopBar />
        {showSettings && <SettingsPanel />}

        <div className="flex-1 overflow-auto p-5">
          {activeNav === 'compile'     && <CompileView />}
          {activeNav === 'ast'         && (ast ? <AstView /> : <LockedView nav="ast" />)}
          {activeNav === 'graph'       && (ast ? <GraphView /> : <LockedView nav="graph" />)}
          {activeNav === 'validator'   && (needsAst && !ast ? <LockedView nav="validator" /> : <ValidatorView />)}
          {activeNav === 'sandbox'     && (ast ? <VirtualSandboxRenderer ast={ast} /> : <LockedView nav="sandbox" />)}
          {activeNav === 'export'      && (ast ? <ExportView /> : <LockedView nav="export" />)}
          {activeNav === 'self-repair' && <SelfRepairView />}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-white/[0.04] px-5 py-2.5 flex items-center justify-between">
          <span className="text-[10px] text-zinc-700">Nexus Studio · AI-Native Application Generation</span>
          <span className="text-[10px] text-zinc-700">Amrutha Govvada · 2025</span>
        </div>
      </div>
    </div>
  );
}
