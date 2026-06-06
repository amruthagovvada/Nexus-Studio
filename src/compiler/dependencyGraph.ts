import { AppAST, DependencyGraph, DependencyNode, DependencyEdge } from '@/schemas/compiler';

export function generateDependencyGraph(ast: Omit<AppAST, 'dependencyGraph'>): DependencyGraph {
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];

  // Helper to add nodes without duplicates
  const addNode = (node: DependencyNode) => {
    if (!nodes.some(n => n.id === node.id)) {
      nodes.push(node);
    }
  };

  // Helper to add edges without duplicates
  const addEdge = (edge: DependencyEdge) => {
    if (!edges.some(e => e.source === edge.source && e.target === edge.target)) {
      edges.push(edge);
    }
  };

  const entities = Object.keys(ast.schema.entities);

  // 1. DATABASE NODES & RELATIONSHIPS
  entities.forEach(entityName => {
    const entity = ast.schema.entities[entityName];
    addNode({
      id: `db:${entityName}`,
      label: `${entityName} (Table)`,
      type: 'db',
    });

    // Relation edges from foreign keys
    Object.values(entity.fields).forEach(field => {
      if (field.foreignKey) {
        addEdge({
          source: `db:${entityName}`,
          target: `db:${field.foreignKey.entity}`,
          label: `${field.name} ➔ ${field.foreignKey.field}`,
        });
      }
    });
  });

  // 2. PERMISSION NODES
  ast.permissions.rules.forEach((rule, idx) => {
    const permId = `perm:${rule.role}-${rule.entity}`;
    addNode({
      id: permId,
      label: `${rule.role} on ${rule.entity}`,
      type: 'permission',
    });

    // Connect permission rules to database tables
    if (entities.includes(rule.entity)) {
      addEdge({
        source: permId,
        target: `db:${rule.entity}`,
        label: rule.actions.join(','),
      });
    }
  });

  // 3. API NODES
  // For each entity, generate implicit CRUD APIs
  entities.forEach(entityName => {
    const readApiId = `api:GET-/api/${entityName.toLowerCase()}s`;
    const writeApiId = `api:POST-/api/${entityName.toLowerCase()}s`;
    const mutateApiId = `api:PATCH-/api/${entityName.toLowerCase()}s/[id]`;
    const deleteApiId = `api:DELETE-/api/${entityName.toLowerCase()}s/[id]`;

    addNode({ id: readApiId, label: `GET /api/${entityName.toLowerCase()}s`, type: 'api' });
    addNode({ id: writeApiId, label: `POST /api/${entityName.toLowerCase()}s`, type: 'api' });
    addNode({ id: mutateApiId, label: `PATCH /api/${entityName.toLowerCase()}s`, type: 'api' });
    addNode({ id: deleteApiId, label: `DELETE /api/${entityName.toLowerCase()}s`, type: 'api' });

    // Link API routes to DB
    addEdge({ source: readApiId, target: `db:${entityName}`, label: 'Select' });
    addEdge({ source: writeApiId, target: `db:${entityName}`, label: 'Insert' });
    addEdge({ source: mutateApiId, target: `db:${entityName}`, label: 'Update' });
    addEdge({ source: deleteApiId, target: `db:${entityName}`, label: 'Delete' });

    // Link API routes to Permissions
    ast.permissions.rules.forEach(rule => {
      if (rule.entity === entityName) {
        const permId = `perm:${rule.role}-${rule.entity}`;
        if (rule.actions.includes('read')) {
          addEdge({ source: readApiId, target: permId, label: 'Authorize' });
        }
        if (rule.actions.includes('create')) {
          addEdge({ source: writeApiId, target: permId, label: 'Authorize' });
        }
        if (rule.actions.includes('update')) {
          addEdge({ source: mutateApiId, target: permId, label: 'Authorize' });
        }
        if (rule.actions.includes('delete')) {
          addEdge({ source: deleteApiId, target: permId, label: 'Authorize' });
        }
      }
    });
  });

  // 4. UI PAGES & COMPONENTS
  ast.architecture.pages.forEach(page => {
    const pageNodeId = `ui:page:${page.id}`;
    addNode({
      id: pageNodeId,
      label: `${page.title} (Page)`,
      type: 'ui',
    });

    // If page is entity CRUD, connect it to read/write/delete APIs
    if (page.entity && entities.includes(page.entity)) {
      const entityLower = page.entity.toLowerCase();
      addEdge({ source: pageNodeId, target: `api:GET-/api/${entityLower}s`, label: 'Fetches' });
      addEdge({ source: pageNodeId, target: `api:POST-/api/${entityLower}s`, label: 'Creates' });
      addEdge({ source: pageNodeId, target: `api:PATCH-/api/${entityLower}s/[id]`, label: 'Modifies' });
      addEdge({ source: pageNodeId, target: `api:DELETE-/api/${entityLower}s/[id]`, label: 'Destroys' });
    }

    // Process components on page
    page.components.forEach(compId => {
      const component = ast.architecture.components.find(c => c.id === compId);
      if (component) {
        const compNodeId = `ui:comp:${component.id}`;
        addNode({
          id: compNodeId,
          label: `${component.name} (${component.type})`,
          type: 'ui',
        });

        // Link page to component
        addEdge({
          source: pageNodeId,
          target: compNodeId,
          label: 'Includes',
        });

        // If component binds to an entity, link it to DB or APIs
        if (component.entity && entities.includes(component.entity)) {
          const entityLower = component.entity.toLowerCase();
          addEdge({
            source: compNodeId,
            target: `db:${component.entity}`,
            label: 'Binds To',
          });

          // Bind details
          if (component.type === 'table' || component.type === 'stats' || component.type === 'chart') {
            addEdge({ source: compNodeId, target: `api:GET-/api/${entityLower}s`, label: 'Reads' });
          } else if (component.type === 'form') {
            addEdge({ source: compNodeId, target: `api:POST-/api/${entityLower}s`, label: 'Submits' });
          }
        }
      }
    });
  });

  return { nodes, edges };
}
