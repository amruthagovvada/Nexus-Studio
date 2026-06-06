import { OpenAI } from 'openai';
import { AppAST, ValidationError } from '@/schemas/compiler';

export async function runSelfRepair(
  openai: OpenAI,
  ast: AppAST,
  errors: ValidationError[]
): Promise<{ repairedAst: AppAST; tokensUsed: number }> {
  const systemPrompt = `You are the Self-Repair compiler agent of the enterprise-grade Nexus Application Compiler.
Your role is to correct a compiled AppAST based on a list of validation errors.

You MUST analyze the errors and return a corrected version of the full AppAST. Do not modify valid structures unless necessary to fix the violations.

Return the corrected AST in this JSON format:
{
  "appName": "Name of the app",
  "intent": { ... },
  "assumptions": [ ... ],
  "architecture": { ... },
  "schema": { ... },
  "permissions": { ... }
}

Ensure all validation errors are resolved. Specifically:
- Correct type spellings to string, number, boolean, date, enum.
- Add primary keys or foreign keys that are flagged as missing.
- Point foreign keys to valid existing target tables/fields.
- Align components/pages and permissions with the defined entities.
Do not return markdown, just raw JSON.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Current Invalid AST:\n${JSON.stringify(ast, null, 2)}\n\nValidation Errors:\n${JSON.stringify(errors, null, 2)}` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('Empty response from OpenAI Self-Repair Agent');
  }

  const result = JSON.parse(content) as AppAST;
  const tokensUsed = response.usage?.total_tokens || 0;

  return {
    repairedAst: result,
    tokensUsed,
  };
}
