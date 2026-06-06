import { NextResponse } from 'next/server';
import { getOpenAIClient } from '@/compiler/openaiClient';
import { compileArchitecture } from '@/compiler/architecture';
import { getFallbackArchitecture } from '@/compiler/fallbackTemplates';

export async function POST(req: Request) {
  try {
    const { intent, assumptions } = await req.json();
    if (!intent) {
      return NextResponse.json({ error: 'Intent model is required' }, { status: 400 });
    }

    try {
      const openai = getOpenAIClient(req);
      const result = await compileArchitecture(openai, intent, assumptions);
      return NextResponse.json(result);
    } catch (err: any) {
      console.warn('[OpenAI Architecture compile failed, falling back to template]:', err.message);
      const fallback = getFallbackArchitecture(intent, assumptions);
      return NextResponse.json({
        ...fallback,
        tokensUsed: 0,
      });
    }
  } catch (err: any) {
    console.error('[Architecture API Route Error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to compile architecture model' },
      { status: 500 }
    );
  }
}
