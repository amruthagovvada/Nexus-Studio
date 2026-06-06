import { OpenAI } from 'openai';
import { IntentModel, Assumption } from '@/schemas/compiler';

export async function compileAssumptions(
  openai: OpenAI,
  intent: IntentModel
): Promise<{ assumptions: Assumption[]; tokensUsed: number }> {
  const systemPrompt = `You are the Assumptions Compiler stage of the enterprise-grade Nexus Application Compiler.
Your role is to analyze the intent model and output a list of design, technical, and domain-specific assumptions that are required to construct the application's schemas and layouts.

Return a JSON object containing:
{
  "assumptions": [
    {
      "id": "asm-unique-identifier",
      "category": "Data Modeling" | "Security" | "User Experience" | "Workflow Logic",
      "statement": "Clear statement of the design assumption (e.g. 'A project can contain multiple tasks, but each task belongs to exactly one project.')",
      "impact": "What this means for the architecture and schema generation stages (e.g. 'Adding a foreign key projectId in the Task schema pointing to Project.')",
      "enabled": true
    },
    ...
  ]
}

Make sure to generate 4-6 realistic assumptions covering all categories based on the user's intent. Do not return markdown, just raw JSON.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze this intent model and compile assumptions:\n\n${JSON.stringify(intent, null, 2)}` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('Empty response from OpenAI Assumptions stage');
  }

  const result = JSON.parse(content);
  const tokensUsed = response.usage?.total_tokens || 0;

  return {
    assumptions: result.assumptions,
    tokensUsed,
  };
}
