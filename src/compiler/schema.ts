import { OpenAI } from 'openai';
import { IntentModel, Assumption, ArchitectureModel, SchemaModel, PermissionModel } from '@/schemas/compiler';

export async function compileSchema(
  openai: OpenAI,
  intent: IntentModel,
  assumptions: Assumption[],
  architecture: ArchitectureModel
): Promise<{ schema: SchemaModel; permissions: PermissionModel; tokensUsed: number }> {
  const systemPrompt = `You are the Schema Compiler stage of the enterprise-grade Nexus Application Compiler.
Your role is to compile database schemas and access permission models from the intent, architecture, and assumptions.

Return a JSON object containing:
{
  "schema": {
    "entities": {
      "EntityName (e.g. 'Task')": {
        "name": "EntityName",
        "fields": {
          "fieldName (e.g. 'id')": {
            "name": "fieldName",
            "type": "string" | "number" | "boolean" | "date" | "enum",
            "required": true | false,
            "primaryKey": true | false,
            "unique": true | false,
            "defaultValue": optional literal value (string, number, boolean, or null),
            "enumValues": ["Option1", "Option2"] (ONLY if type is 'enum'),
            "foreignKey": {
              "entity": "TargetEntityName (e.g. 'User')",
              "field": "TargetFieldName (e.g. 'id')"
            } (ONLY if field links to another table)
          }
        }
      }
    }
  },
  "permissions": {
    "roles": ["List of roles, e.g. 'Admin', 'User'"],
    "rules": [
      {
        "role": "RoleName",
        "entity": "EntityName",
        "actions": ["create", "read", "update", "delete"],
        "condition": "Optional JS expression checking records, e.g. 'ownerId === currentUser.id' or 'status !== \\'Closed\\''"
      }
    ]
  }
}

Ensure the following constraints are met:
1. Every entity must have an 'id' primary key of type 'string' (required: true, primaryKey: true).
2. Create logical foreign keys linking entities based on relations described in intent/assumptions.
3. Every foreign key field must have its matching "foreignKey" object.
4. Define standard enterprise permissions: Admin has full access, and other roles have restricted access (often conditional on ownership like "ownerId === currentUser.id").
Do not return markdown, just raw JSON.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Intent:\n${JSON.stringify(intent, null, 2)}\n\nAssumptions:\n${JSON.stringify(assumptions, null, 2)}\n\nArchitecture:\n${JSON.stringify(architecture, null, 2)}` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('Empty response from OpenAI Schema stage');
  }

  const result = JSON.parse(content);
  const tokensUsed = response.usage?.total_tokens || 0;

  return {
    schema: result.schema,
    permissions: result.permissions,
    tokensUsed,
  };
}
