import { OpenAI } from 'openai';
import { IntentModel } from '@/schemas/compiler';

export async function compileIntent(
  openai: OpenAI,
  prompt: string
): Promise<{ appName: string; intent: IntentModel; tokensUsed: number }> {
  const systemPrompt = `You are the Parser/Intent stage of the enterprise-grade Nexus Application Compiler. 
Your goal is to parse a natural language prompt into a structured JSON representation of user intent.

Return a JSON object containing:
{
  "appName": "A short, sleek name for the application",
  "intent": {
    "description": "A detailed high-level summary of the application, target goals, and scope.",
    "features": ["Feature 1", "Feature 2", ...],
    "entities": ["Table1", "Table2", ...],
    "roles": ["Role1", "Role2", ...]
  }
}

Do not return any markdown code blocks, just raw JSON.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Compile the following requirements prompt:\n\n${prompt}` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('Empty response from OpenAI Intent stage');
  }

  const result = JSON.parse(content);
  const tokensUsed = response.usage?.total_tokens || 0;

  return {
    appName: result.appName,
    intent: result.intent,
    tokensUsed,
  };
}
