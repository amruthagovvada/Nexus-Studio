import { NextResponse } from 'next/server';
import { getOpenAIClient } from '@/compiler/openaiClient';
import { compileAssumptions } from '@/compiler/assumptions';
import { getFallbackAssumptions } from '@/compiler/fallbackTemplates';

export async function POST(req: Request) {
  try {
    const { intent } = await req.json();
    if (!intent) {
      return NextResponse.json({ error: 'Intent model is required' }, { status: 400 });
    }

    try {
      const openai = getOpenAIClient(req);
      const { assumptions, tokensUsed } = await compileAssumptions(openai, intent);
      return NextResponse.json({ assumptions, tokensUsed });
    } catch (err: any) {
      console.warn('[OpenAI Assumptions compile failed, falling back to template]:', err.message);
      const fallback = getFallbackAssumptions(intent);
      return NextResponse.json({
        ...fallback,
        tokensUsed: 0,
      });
    }
  } catch (err: any) {
    console.error('[Assumptions API Route Error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to compile assumptions' },
      { status: 500 }
    );
  }
}
