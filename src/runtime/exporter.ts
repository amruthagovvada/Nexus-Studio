import { AppAST, FieldSchema } from '@/schemas/compiler';

export function generateExportFiles(ast: AppAST): Record<string, string> {
  const files: Record<string, string> = {};
  const exportedAt = new Date().toISOString();

  if (!ast || !ast.schema || !ast.schema.entities || !ast.permissions || !ast.permissions.roles) {
    return files;
  }

  const entities = Object.keys(ast.schema.entities);

  // ============================================================
  // 1. DATABASE SCHEMA — schema.sql
  // ============================================================
  let sql = `-- ============================================================\n`;
  sql += `-- Nexus Studio — Generated Database Schema\n`;
  sql += `-- Application: ${ast.appName}\n`;
  sql += `-- Domain: ${ast.intent.detectedDomain || 'Custom Application'}\n`;
  sql += `-- Exported: ${exportedAt}\n`;
  sql += `-- ============================================================\n\n`;

  entities.forEach(name => {
    const entity = ast.schema.entities[name];
    sql += `CREATE TABLE "${name}s" (\n`;
    const colDefs: string[] = [];

    Object.entries(entity.fields).forEach(([fieldName, field]) => {
      let col = `  "${fieldName}" `;
      if (field.primaryKey) {
        col += 'VARCHAR(255) PRIMARY KEY';
      } else {
        switch (field.type) {
          case 'number': col += 'INT'; break;
          case 'boolean': col += 'BOOLEAN'; break;
          case 'date': col += 'DATE'; break;
          case 'enum': col += `VARCHAR(50) CHECK ("${fieldName}" IN (${field.enumValues?.map(v => `'${v}'`).join(', ')}))`; break;
          default: col += 'VARCHAR(255)';
        }
        if (field.required) col += ' NOT NULL';
        if (field.unique) col += ' UNIQUE';
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
          col += ` DEFAULT ${typeof field.defaultValue === 'boolean' ? field.defaultValue : `'${field.defaultValue}'`}`;
        }
      }
      colDefs.push(col);
    });

    // Foreign Key constraints
    Object.entries(entity.fields).forEach(([fieldName, field]) => {
      if (field.foreignKey) {
        const fk = field.foreignKey;
        colDefs.push(`  FOREIGN KEY ("${fieldName}") REFERENCES "${fk.entity}s"("${fk.field}") ON DELETE CASCADE`);
      }
    });

    sql += colDefs.join(',\n') + '\n);\n\n';
  });
  files['schema.sql'] = sql;

  // ============================================================
  // 2. TYPESCRIPT ZOD SCHEMAS — schema.ts
  // ============================================================
  let tsSchema = `// ============================================================\n`;
  tsSchema += `// Nexus Studio — TypeScript & Zod Validation Schemas\n`;
  tsSchema += `// Application: ${ast.appName}\n`;
  tsSchema += `// Exported: ${exportedAt}\n`;
  tsSchema += `// ============================================================\n\n`;
  tsSchema += `import { z } from 'zod';\n\n`;

  entities.forEach(name => {
    const entity = ast.schema.entities[name];
    tsSchema += `export const ${name}Schema = z.object({\n`;
    Object.entries(entity.fields).forEach(([fieldName, field]) => {
      let zodType = '';
      switch (field.type) {
        case 'number': zodType = 'z.number()'; break;
        case 'boolean': zodType = 'z.boolean()'; break;
        case 'date': zodType = 'z.string().date()'; break;
        case 'enum': zodType = `z.enum([${field.enumValues?.map(v => `'${v}'`).join(', ')}])`; break;
        default: zodType = 'z.string()';
      }
      if (!field.required) {
        zodType += '.optional().nullable()';
      }
      tsSchema += `  ${fieldName}: ${zodType},\n`;
    });
    tsSchema += `});\n\n`;
    tsSchema += `export type ${name} = z.infer<typeof ${name}Schema>;\n\n`;
  });
  files['schema.ts'] = tsSchema;

  // ============================================================
  // 3. PERMISSIONS MODEL — permissions.json
  // ============================================================
  const permissionsJson = {
    _metadata: {
      application: ast.appName,
      domain: ast.intent.detectedDomain || 'Custom Application',
      exportedAt,
      generatedBy: 'Nexus Studio',
    },
    roles: ast.permissions.roles,
    rules: ast.permissions.rules,
  };
  files['permissions.json'] = JSON.stringify(permissionsJson, null, 2);

  // ============================================================
  // 4. SYSTEM ARCHITECTURE — architecture.json
  // ============================================================
  const architectureJson = {
    _metadata: {
      application: ast.appName,
      domain: ast.intent.detectedDomain || 'Custom Application',
      exportedAt,
      generatedBy: 'Nexus Studio',
    },
    services: ast.architecture.services,
    pages: ast.architecture.pages,
    components: ast.architecture.components,
    dataFlow: ast.architecture.dataFlow,
  };
  files['architecture.json'] = JSON.stringify(architectureJson, null, 2);

  // ============================================================
  // 5. DEPENDENCY GRAPH — dependency-graph.json
  // ============================================================
  const depGraphJson = {
    _metadata: {
      application: ast.appName,
      exportedAt,
      generatedBy: 'Nexus Studio',
      nodeCount: ast.dependencyGraph?.nodes?.length || 0,
      edgeCount: ast.dependencyGraph?.edges?.length || 0,
    },
    nodes: ast.dependencyGraph?.nodes || [],
    edges: ast.dependencyGraph?.edges || [],
  };
  files['dependency-graph.json'] = JSON.stringify(depGraphJson, null, 2);

  // ============================================================
  // 6. PERMISSIONS UTILITY — permissions.ts
  // ============================================================
  let permissionsTs = `// ============================================================\n`;
  permissionsTs += `// Nexus Studio — Role-Based Access Control Utility\n`;
  permissionsTs += `// Application: ${ast.appName}\n`;
  permissionsTs += `// Exported: ${exportedAt}\n`;
  permissionsTs += `// ============================================================\n\n`;
  permissionsTs += `export type Role = ${ast.permissions.roles.map(r => `'${r}'`).join(' | ')};\n\n`;
  permissionsTs += `export interface UserSession {\n  id: string;\n  name: string;\n  role: Role;\n}\n\n`;
  permissionsTs += `const RULES = ${JSON.stringify(ast.permissions.rules, null, 2)} as const;\n\n`;
  permissionsTs += `export function checkPermission(\n  user: UserSession,\n  entity: string,\n  action: 'create' | 'read' | 'update' | 'delete',\n  record?: any\n): boolean {\n`;
  permissionsTs += `  const rule = (RULES as any[]).find((r: any) => r.role === user.role && r.entity === entity && r.actions.includes(action));\n`;
  permissionsTs += `  if (!rule) return false;\n\n`;
  permissionsTs += `  if (rule.condition && record) {\n`;
  permissionsTs += `    try {\n`;
  permissionsTs += `      const fn = new Function('row', 'currentUser', \`with(row) { return \${rule.condition}; }\`);\n`;
  permissionsTs += `      return !!fn(record, user);\n`;
  permissionsTs += `    } catch (e) {\n`;
  permissionsTs += `      return false;\n`;
  permissionsTs += `    }\n`;
  permissionsTs += `  }\n\n`;
  permissionsTs += `  return true;\n`;
  permissionsTs += `}\n`;
  files['permissions.ts'] = permissionsTs;

  // ============================================================
  // 7. API ROUTES — per entity
  // ============================================================
  entities.forEach(entityName => {
    let listRoute = `// Nexus Studio — Generated API Route: ${entityName}\n`;
    listRoute += `// Exported: ${exportedAt}\n`;
    listRoute += `import { NextRequest, NextResponse } from 'next/server';\n`;
    listRoute += `import { ${entityName}Schema } from '../schema';\n`;
    listRoute += `import { checkPermission, UserSession } from '../permissions';\n\n`;
    listRoute += `let dbStore: any[] = [];\n\n`;
    listRoute += `export async function GET(req: NextRequest) {\n`;
    listRoute += `  const user: UserSession = { id: 'usr-1', name: 'System', role: '${ast.permissions.roles[0] || 'Admin'}' };\n`;
    listRoute += `  if (!checkPermission(user, '${entityName}', 'read')) {\n`;
    listRoute += `    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });\n`;
    listRoute += `  }\n`;
    listRoute += `  return NextResponse.json(dbStore.filter(row => checkPermission(user, '${entityName}', 'read', row)));\n`;
    listRoute += `}\n\n`;
    listRoute += `export async function POST(req: NextRequest) {\n`;
    listRoute += `  const user: UserSession = { id: 'usr-1', name: 'System', role: '${ast.permissions.roles[0] || 'Admin'}' };\n`;
    listRoute += `  if (!checkPermission(user, '${entityName}', 'create')) {\n`;
    listRoute += `    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });\n`;
    listRoute += `  }\n`;
    listRoute += `  try {\n`;
    listRoute += `    const json = await req.json();\n`;
    listRoute += `    const parsed = ${entityName}Schema.parse(json);\n`;
    listRoute += `    dbStore.push(parsed);\n`;
    listRoute += `    return NextResponse.json({ success: true, data: parsed });\n`;
    listRoute += `  } catch (err: any) {\n`;
    listRoute += `    return NextResponse.json({ error: err.errors || err.message }, { status: 400 });\n`;
    listRoute += `  }\n`;
    listRoute += `}\n`;
    files[`api/${entityName.toLowerCase()}s/route.ts`] = listRoute;
  });

  // ============================================================
  // 8. AUTH MIDDLEWARE — middleware.ts
  // ============================================================
  files['middleware.ts'] = `// Nexus Studio — Auth Middleware\n// Exported: ${exportedAt}\nimport { NextResponse } from 'next/server';\nimport type { NextRequest } from 'next/server';\n\nexport function middleware(request: NextRequest) {\n  const role = request.headers.get('x-user-role') || 'User';\n  const path = request.nextUrl.pathname;\n  console.log(\`[Auth] Path: \${path}, Role: \${role}\`);\n  return NextResponse.next();\n}\n\nexport const config = {\n  matcher: ['/api/:path*'],\n};\n`;

  return files;
}
