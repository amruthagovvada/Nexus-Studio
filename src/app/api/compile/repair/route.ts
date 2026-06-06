import { NextResponse } from 'next/server';
import { getOpenAIClient } from '@/compiler/openaiClient';
import { runSelfRepair } from '@/repair/repairAgent';
import { getFallbackRepairedAst } from '@/compiler/fallbackTemplates';

export async function POST(req: Request) {
  try {
    const { ast, errors } = await req.json();
    if (!ast || !errors) {
      return NextResponse.json({ error: 'AST and validation errors are required' }, { status: 400 });
    }

    try {
      const openai = getOpenAIClient(req);
      const { repairedAst, tokensUsed } = await runSelfRepair(openai, ast, errors);
      return NextResponse.json({
        ...repairedAst,
        tokensUsed,
      });
    } catch (err: any) {
      console.warn('[OpenAI Self-Repair compile failed, falling back to template]:', err.message);
      const repairedAst = getFallbackRepairedAst(ast, errors);
      return NextResponse.json({
        ...repairedAst,
        tokensUsed: 0,
      });
    }
  } catch (err: any) {
    console.error('[Repair API Route Error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to repair compiler AST' },
      { status: 500 }
    );
  }
}
