import { NextResponse } from 'next/server';
import { getOpenAIClient } from '@/compiler/openaiClient';
import { compileSchema } from '@/compiler/schema';
import { getFallbackSchema } from '@/compiler/fallbackTemplates';

export async function POST(req: Request) {
  try {
    const { intent, assumptions, architecture } = await req.json();
    if (!intent || !architecture) {
      return NextResponse.json({ error: 'Intent and Architecture models are required' }, { status: 400 });
    }

    try {
      const openai = getOpenAIClient(req);
      const { schema, permissions, tokensUsed } = await compileSchema(openai, intent, assumptions, architecture);
      return NextResponse.json({ schema, permissions, tokensUsed });
    } catch (err: any) {
      console.warn('[OpenAI Schema compile failed, falling back to template]:', err.message);
      const fallback = getFallbackSchema(intent, assumptions, architecture);
      return NextResponse.json({
        ...fallback,
        tokensUsed: 0,
      });
    }
  } catch (err: any) {
    console.error('[Schema API Route Error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to compile database schemas' },
      { status: 500 }
    );
  }
}
