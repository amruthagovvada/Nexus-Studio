import { create } from 'zustand';
import { AppAST, Assumption, CompilationState, CompilerTrace, ValidationError, ValidationReport } from '@/schemas/compiler';
import { generateDependencyGraph } from '@/compiler/dependencyGraph';
import { validateAST } from '@/validators/astValidator';
import { getDetectedDomain, getFallbackIntent } from '@/compiler/fallbackTemplates';

interface CompilerStoreActions {
  setPrompt: (prompt: string) => void;
  setApiKey: (key: string) => void;
  toggleAssumption: (id: string) => void;
  updateAssumption: (id: string, updates: Partial<Assumption>) => void;
  addAssumption: (assumption: Omit<Assumption, 'id'>) => void;
  resetCompiler: () => void;
  runStage: (stage: 'intent' | 'assumptions' | 'architecture' | 'schema' | 'validate' | 'repair') => Promise<boolean>;
  runFullPipeline: () => Promise<void>;
}

interface ExtraState {
  apiKey: string;
  validationReport: ValidationReport | null;
  repairIterations: number;
  lastCompiledPrompt?: string;
  lastCompiledDomain?: string;
  lastCompiledEntities?: string[];
  source?: 'AI Generation Engine' | 'Static Analysis Engine' | 'Incremental Cache Build';
}

export const useCompilerStore = create<CompilationState & CompilerStoreActions & ExtraState>((set, get) => {
  // Simple helper to calculate hashes for caching
  const getHash = async (val: any): Promise<string> => {
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const getHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().apiKey) {
      headers['x-openai-api-key'] = get().apiKey;
    }
    return headers;
  };

  return {
    // Initial State
    currentStage: 'idle',
    traces: [],
    cache: {},
    ast: null,
    isCompiling: false,
    prompt: '',
    apiKey: '',
    validationReport: null,
    repairIterations: 0,
    lastCompiledPrompt: undefined,
    lastCompiledDomain: undefined,
    lastCompiledEntities: undefined,
    source: undefined,

    // Actions
    setPrompt: (prompt) => set({ prompt }),
    setApiKey: (apiKey) => set({ apiKey }),

    toggleAssumption: (id) => {
      const { ast } = get();
      if (!ast) return;
      const updatedAssumptions = ast.assumptions.map(asm =>
        asm.id === id ? { ...asm, enabled: !asm.enabled } : asm
      );
      set({ ast: { ...ast, assumptions: updatedAssumptions } });
    },

    updateAssumption: (id, updates) => {
      const { ast } = get();
      if (!ast) return;
      const updatedAssumptions = ast.assumptions.map(asm =>
        asm.id === id ? { ...asm, ...updates } : asm
      );
      set({ ast: { ...ast, assumptions: updatedAssumptions } });
    },

    addAssumption: (newAsm) => {
      const { ast } = get();
      if (!ast) return;
      const generatedId = `asm-${Date.now()}`;
      const updatedAssumptions = [
        ...ast.assumptions,
        { ...newAsm, id: generatedId, enabled: true },
      ];
      set({ ast: { ...ast, assumptions: updatedAssumptions } });
    },

    resetCompiler: () => {
      set({
        currentStage: 'idle',
        traces: [],
        ast: null,
        validationReport: null,
        repairIterations: 0,
        isCompiling: false,
        lastCompiledPrompt: undefined,
        lastCompiledDomain: undefined,
        lastCompiledEntities: undefined,
        source: undefined,
      });
    },

    runStage: async (stage) => {
      const startTime = performance.now();
      const currentStoreState = get();
      let inputData: any = null;
      let endpoint = '';
      let payload: any = {};

      // Determine stage inputs and endpoints
      switch (stage) {
        case 'intent':
          inputData = currentStoreState.prompt;
          endpoint = '/api/compile/intent';
          payload = { prompt: inputData };
          break;
        case 'assumptions':
          inputData = currentStoreState.ast?.intent;
          endpoint = '/api/compile/assumptions';
          payload = { intent: inputData };
          break;
        case 'architecture':
          inputData = {
            intent: currentStoreState.ast?.intent,
            assumptions: currentStoreState.ast?.assumptions.filter(a => a.enabled),
          };
          endpoint = '/api/compile/architecture';
          payload = inputData;
          break;
        case 'schema':
          inputData = {
            intent: currentStoreState.ast?.intent,
            assumptions: currentStoreState.ast?.assumptions.filter(a => a.enabled),
            architecture: currentStoreState.ast?.architecture,
          };
          endpoint = '/api/compile/schema';
          payload = inputData;
          break;
        default:
          return false;
      }

      if (!inputData) {
        set({ isCompiling: false });
        return false;
      }

      const inputHash = await getHash(inputData);
      const cached = currentStoreState.cache[stage];

      if (cached && cached.hash === inputHash) {
        // Cache Hit!
        const duration = Math.round(performance.now() - startTime);
        const trace: CompilerTrace = {
          stage,
          status: 'skipped',
          timestamp: new Date().toISOString(),
          durationMs: duration,
          inputHash,
          outputHash: cached.hash,
          tokensUsed: 0,
        };

        // Build fresh AST from current state + cached output (do NOT mutate shared reference)
        const existingAst = get().ast;
        const baseAst = existingAst ? { ...existingAst } : {
          appName: 'Generated App',
          intent: {} as any,
          assumptions: [],
          architecture: {} as any,
          schema: {} as any,
          permissions: {} as any,
          dependencyGraph: { nodes: [], edges: [] },
        };

        const updatedAst = { ...baseAst };
        if (stage === 'intent') {
          updatedAst.appName = cached.output.appName || baseAst.appName;
          updatedAst.intent = cached.output.intent;
        } else if (stage === 'assumptions') {
          updatedAst.assumptions = cached.output;
        } else if (stage === 'architecture') {
          updatedAst.architecture = cached.output;
        } else if (stage === 'schema') {
          updatedAst.schema = cached.output.schema;
          updatedAst.permissions = cached.output.permissions;
        }

        set(state => ({
          currentStage: stage,
          ast: updatedAst,
          traces: [...state.traces, trace],
        }));

        return true;
      }

      // Cache Miss, proceed with API call
      try {
        set({ currentStage: stage });
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const outputHash = await getHash(data);
        const duration = Math.round(performance.now() - startTime);

        // Update Cache
        const newCache = { ...currentStoreState.cache };
        if (stage === 'intent') {
          newCache.intent = { output: data, hash: inputHash };
        } else if (stage === 'assumptions') {
          newCache.assumptions = { output: data.assumptions, hash: inputHash };
        } else if (stage === 'architecture') {
          newCache.architecture = { output: data, hash: inputHash };
        } else if (stage === 'schema') {
          newCache.schema = { output: data, hash: inputHash };
        }

        const trace: CompilerTrace = {
          stage,
          status: 'success',
          timestamp: new Date().toISOString(),
          durationMs: duration,
          inputHash,
          outputHash,
          tokensUsed: data.tokensUsed || 0,
        };

        // Build a fresh AST object from the latest store state + new data (never mutate shared refs)
        const latestAst = get().ast;
        const freshAst = latestAst ? { ...latestAst } : {
          appName: 'Generated App',
          intent: {} as any,
          assumptions: [],
          architecture: {} as any,
          schema: {} as any,
          permissions: {} as any,
          dependencyGraph: { nodes: [], edges: [] },
        };

        if (stage === 'intent') {
          freshAst.appName = data.appName || freshAst.appName;
          freshAst.intent = data.intent;
        } else if (stage === 'assumptions') {
          freshAst.assumptions = data.assumptions;
        } else if (stage === 'architecture') {
          freshAst.architecture = data;
        } else if (stage === 'schema') {
          freshAst.schema = data.schema;
          freshAst.permissions = data.permissions;
        }

        set(state => ({
          ast: freshAst,
          cache: newCache,
          traces: [...state.traces, trace],
        }));

        return true;
      } catch (err: any) {
        const duration = Math.round(performance.now() - startTime);
        const trace: CompilerTrace = {
          stage,
          status: 'failed',
          timestamp: new Date().toISOString(),
          durationMs: duration,
          inputHash,
          outputHash: '',
          tokensUsed: 0,
          error: err.message || 'Unknown compiler error',
        };

        set(state => ({
          traces: [...state.traces, trace],
          isCompiling: false,
        }));
        return false;
      }
    },

    runFullPipeline: async () => {
      const { prompt, lastCompiledPrompt, lastCompiledDomain, lastCompiledEntities } = get();
      const currentDomain = getDetectedDomain(prompt);
      const currentEntities = getFallbackIntent(prompt).intent.entities;

      let cacheInvalidated = false;
      let invalidationReason = '';

      if (lastCompiledPrompt !== undefined) {
        if (prompt.trim() !== lastCompiledPrompt.trim()) {
          cacheInvalidated = true;
          invalidationReason = 'Prompt text changed';
        } else if (currentDomain !== lastCompiledDomain) {
          cacheInvalidated = true;
          invalidationReason = 'Detected domain changed';
        } else {
          const sortedCurrent = [...currentEntities].sort().join(',');
          const sortedLast = [...(lastCompiledEntities || [])].sort().join(',');
          if (sortedCurrent !== sortedLast) {
            cacheInvalidated = true;
            invalidationReason = 'Entity set changed';
          }
        }
      }

      const initialTraces: CompilerTrace[] = [];
      if (cacheInvalidated) {
        set({ cache: {} });
        const invalidationTrace: CompilerTrace = {
          stage: 'intent',
          status: 'skipped',
          timestamp: new Date().toISOString(),
          durationMs: 0,
          inputHash: '',
          outputHash: '',
          tokensUsed: 0,
          error: `Cache Invalidated: ${invalidationReason}. Resetting pipeline cache.`
        };
        initialTraces.push(invalidationTrace);
      }

      set({ isCompiling: true, traces: initialTraces, repairIterations: 0, validationReport: null });

      // Stage 1: Intent
      const s1 = await get().runStage('intent');
      if (!s1) return;

      // Stage 2: Assumptions
      const s2 = await get().runStage('assumptions');
      if (!s2) return;

      // Stage 3: Architecture
      const s3 = await get().runStage('architecture');
      if (!s3) return;

      // Stage 4: Schema & Permissions
      const s4 = await get().runStage('schema');
      if (!s4) return;

      // Stage 5: Compile Dependency Graph (Local client processing)
      set({ currentStage: 'graph' });
      const graphStartTime = performance.now();
      const currentAst = get().ast;
      if (currentAst) {
        const depGraph = generateDependencyGraph(currentAst);
        const graphDuration = Math.round(performance.now() - graphStartTime);
        const graphHash = await getHash(depGraph);
        const graphTrace: CompilerTrace = {
          stage: 'graph',
          status: 'success',
          timestamp: new Date().toISOString(),
          durationMs: graphDuration,
          inputHash: await getHash({ arch: currentAst.architecture, sch: currentAst.schema }),
          outputHash: graphHash,
          tokensUsed: 0,
        };
        set({
          ast: { ...currentAst, dependencyGraph: depGraph },
          traces: [...get().traces, graphTrace],
        });
      }

      // Stage 6: Multi-Pass Validation
      set({ currentStage: 'validate' });
      const validateStartTime = performance.now();
      const finalAst = get().ast;
      if (!finalAst) {
        set({ isCompiling: false });
        return;
      }

      const report = validateAST(finalAst);
      const validateDuration = Math.round(performance.now() - validateStartTime);
      const validateTrace: CompilerTrace = {
        stage: 'validate',
        status: report.isValid ? 'success' : 'failed',
        timestamp: new Date().toISOString(),
        durationMs: validateDuration,
        inputHash: await getHash(finalAst),
        outputHash: await getHash(report),
        tokensUsed: 0,
        error: report.isValid ? undefined : `${report.errors.length} validation errors found`,
      };

      set(state => ({
        validationReport: report,
        traces: [...state.traces, validateTrace],
      }));

      // Stage 7: Repair Loop (Max 3 iterations)
      let currentReport = report;
      let currentAstState = finalAst;
      let iterations = 0;

      while (!currentReport.isValid && iterations < 3) {
        iterations++;
        set({ currentStage: 'repair', repairIterations: iterations });
        const repairStartTime = performance.now();

        try {
          const response = await fetch('/api/compile/repair', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              ast: currentAstState,
              errors: currentReport.errors,
            }),
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Repair request failed');
          }

          const repairedAst: AppAST = await response.json();
          
          // Re-validate repaired AST
          const postRepairReport = validateAST(repairedAst);
          const repairDuration = Math.round(performance.now() - repairStartTime);

          const repairTrace: CompilerTrace = {
            stage: 'repair',
            status: postRepairReport.isValid ? 'success' : 'failed',
            timestamp: new Date().toISOString(),
            durationMs: repairDuration,
            inputHash: await getHash(currentAstState),
            outputHash: await getHash(repairedAst),
            tokensUsed: (repairedAst as any).tokensUsed || 0,
            repairsMade: currentReport.errors.map(e => e.message),
            error: postRepairReport.isValid ? undefined : `Repaired AST still has ${postRepairReport.errors.length} errors`,
          };

          currentAstState = {
            ...repairedAst,
            dependencyGraph: generateDependencyGraph(repairedAst), // update graph
          };

          currentReport = postRepairReport;

          set(state => ({
            ast: currentAstState,
            validationReport: postRepairReport,
            traces: [...state.traces, repairTrace],
          }));

        } catch (err: any) {
          const repairDuration = Math.round(performance.now() - repairStartTime);
          const errorTrace: CompilerTrace = {
            stage: 'repair',
            status: 'failed',
            timestamp: new Date().toISOString(),
            durationMs: repairDuration,
            inputHash: await getHash(currentAstState),
            outputHash: '',
            tokensUsed: 0,
            error: err.message || 'Self-repair failed',
          };
          set(state => ({
            traces: [...state.traces, errorTrace],
            isCompiling: false,
          }));
          return;
        }
      }

      // Compute and set Compilation Source
      let finalSource: 'AI Generation Engine' | 'Static Analysis Engine' | 'Incremental Cache Build' = 'Incremental Cache Build';
      const tracesList = get().traces;
      const apiTraces = tracesList.filter(t => t.stage === 'intent' || t.stage === 'assumptions' || t.stage === 'architecture' || t.stage === 'schema');
      const anySuccessfulApi = apiTraces.some(t => t.status === 'success');
      const anyAITokens = apiTraces.some(t => t.status === 'success' && t.tokensUsed > 0);

      if (anySuccessfulApi) {
        if (anyAITokens) {
          finalSource = 'AI Generation Engine';
        } else {
          finalSource = 'Static Analysis Engine';
        }
      } else if (apiTraces.length > 0 && apiTraces.every(t => t.status === 'skipped')) {
        finalSource = 'Incremental Cache Build';
      } else {
        finalSource = 'Static Analysis Engine';
      }

      set({
        currentStage: 'complete',
        isCompiling: false,
        lastCompiledPrompt: prompt,
        lastCompiledDomain: currentDomain,
        lastCompiledEntities: currentEntities,
        source: finalSource
      });
    },
  };
});
