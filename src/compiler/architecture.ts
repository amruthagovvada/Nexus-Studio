import { OpenAI } from 'openai';
import { IntentModel, Assumption, ArchitectureModel } from '@/schemas/compiler';

export async function compileArchitecture(
  openai: OpenAI,
  intent: IntentModel,
  assumptions: Assumption[]
): Promise<ArchitectureModel & { tokensUsed: number }> {
  const systemPrompt = `You are the Architecture Compiler stage of the enterprise-grade Nexus Application Compiler.
Your role is to compile the parsed Intent model and active design Assumptions into a system architecture specification.

Return a JSON object containing:
{
  "services": ["List of high-level service systems needed, e.g. Relational DB, Auth Service, Notification Hub"],
  "components": [
    {
      "id": "comp-unique-id",
      "name": "Human readable name",
      "type": "table" | "form" | "chart" | "stats" | "sidebar",
      "props": ["List of core columns/parameters to display/collect, e.g., 'title', 'status'"],
      "entity": "Name of the entity it binds to (e.g. 'Task')"
    }
  ],
  "pages": [
    {
      "id": "page-unique-id",
      "title": "Title (e.g., 'Task Board')",
      "route": "Path (e.g., '/tasks')",
      "type": "dashboard" | "crud" | "settings" | "custom",
      "entity": "Name of the primary entity (e.g. 'Task')",
      "components": ["List of component ids included on this page"]
    }
  ],
  "dataFlow": [
    {
      "from": "source component or service id",
      "to": "target component or service id",
      "trigger": "Trigger action, e.g. 'OnRowClick', 'FormSubmit', 'StateChange'"
    }
  ]
}

Ensure that you create a highly intuitive set of pages:
1. Include at least a 'dashboard' page showing core statistics and summary components.
2. Include CRUD pages for each primary entity listed in the Intent Model.
3. Ensure components on each page map directly to these entities.
Do not return markdown, just raw JSON.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Intent:\n${JSON.stringify(intent, null, 2)}\n\nApproved Assumptions:\n${JSON.stringify(assumptions, null, 2)}` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('Empty response from OpenAI Architecture stage');
  }

  const result = JSON.parse(content);
  const tokensUsed = response.usage?.total_tokens || 0;

  return {
    ...result,
    tokensUsed,
  };
}
