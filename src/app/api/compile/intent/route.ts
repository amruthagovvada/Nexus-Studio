import { NextResponse } from 'next/server';
import { getOpenAIClient } from '@/compiler/openaiClient';
import { compileIntent } from '@/compiler/intent';
import { getFallbackIntent } from '@/compiler/fallbackTemplates';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    try {
      const openai = getOpenAIClient(req);
      const { appName, intent, tokensUsed } = await compileIntent(openai, prompt);
      return NextResponse.json({ appName, intent, tokensUsed });
    } catch (err: any) {
      console.warn('[OpenAI Intent compile failed, falling back to template]:', err.message);
      // Fallback compilation
      const fallback = getFallbackIntent(prompt);
      return NextResponse.json({
        ...fallback,
        tokensUsed: 0,
      });
    }
  } catch (err: any) {
    console.error('[Intent API Route Error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to compile intent model' },
      { status: 500 }
    );
  }
}
