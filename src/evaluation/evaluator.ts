import { CompilerTrace } from '@/schemas/compiler';

export interface CompilationMetrics {
  totalDurationMs: number;
  averageStageDurationMs: number;
  cacheHitRate: number;
  repairSuccessRate: number;
  totalTokensUsed: number;
  successCount: number;
  failedCount: number;
}

export function evaluateCompilationTraces(traces: CompilerTrace[]): CompilationMetrics {
  if (traces.length === 0) {
    return {
      totalDurationMs: 0,
      averageStageDurationMs: 0,
      cacheHitRate: 0,
      repairSuccessRate: 0,
      totalTokensUsed: 0,
      successCount: 0,
      failedCount: 0,
    };
  }

  let totalDurationMs = 0;
  let cacheHits = 0;
  let totalTokensUsed = 0;
  let successCount = 0;
  let failedCount = 0;

  let repairAttempts = 0;
  let repairSuccesses = 0;

  traces.forEach(trace => {
    totalDurationMs += trace.durationMs;
    totalTokensUsed += trace.tokensUsed;

    if (trace.status === 'skipped') {
      cacheHits++;
    }

    if (trace.status === 'success' || trace.status === 'skipped') {
      successCount++;
    } else if (trace.status === 'failed') {
      failedCount++;
    }

    if (trace.stage === 'repair') {
      repairAttempts++;
      if (trace.status === 'success') {
        repairSuccesses++;
      }
    }
  });

  return {
    totalDurationMs,
    averageStageDurationMs: Math.round(totalDurationMs / traces.length),
    cacheHitRate: Math.round((cacheHits / traces.length) * 100) / 100,
    repairSuccessRate: repairAttempts > 0 ? Math.round((repairSuccesses / repairAttempts) * 100) / 100 : 0,
    totalTokensUsed,
    successCount,
    failedCount,
  };
}
