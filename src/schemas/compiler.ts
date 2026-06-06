export interface IntentModel {
  description: string;
  features: string[];
  entities: string[];
  roles: string[];
  detectedDomain?: string;
}

export interface Assumption {
  id: string;
  category: string; // e.g., 'Data Modeling', 'Security', 'User Experience'
  statement: string;
  impact: string;
  enabled: boolean;
}

export interface ComponentModel {
  id: string;
  name: string;
  type: 'table' | 'form' | 'chart' | 'stats' | 'navbar' | 'sidebar';
  props: string[];
  entity?: string;
}

export interface DataFlowItem {
  from: string;
  to: string;
  trigger: string;
}

export interface PageModel {
  id: string;
  title: string;
  route: string;
  type: 'dashboard' | 'crud' | 'settings' | 'custom';
  entity?: string; // entity linked for CRUD/details
  components: string[]; // references component IDs
}

export interface ArchitectureModel {
  services: string[];
  components: ComponentModel[];
  pages: PageModel[];
  dataFlow: DataFlowItem[];
}

export interface ForeignKeyInfo {
  entity: string;
  field: string;
}

export interface FieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  required: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string | number | boolean | null;
  enumValues?: string[]; // strictly for enum type
  foreignKey?: ForeignKeyInfo; // strictly for relations
}

export interface EntitySchema {
  name: string;
  fields: Record<string, FieldSchema>;
  indexes?: string[];
}

export interface SchemaModel {
  entities: Record<string, EntitySchema>;
}

export interface PermissionRule {
  role: string;
  entity: string;
  actions: ('create' | 'read' | 'update' | 'delete')[];
  condition?: string; // expression logic e.g., "ownerId == currentUser.id"
}

export interface PermissionModel {
  roles: string[];
  rules: PermissionRule[];
}

export interface DependencyNode {
  id: string; // unique ID
  label: string;
  type: 'ui' | 'api' | 'db' | 'permission';
}

export interface DependencyEdge {
  source: string;
  target: string;
  label?: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface AppAST {
  appName: string;
  intent: IntentModel;
  assumptions: Assumption[];
  architecture: ArchitectureModel;
  schema: SchemaModel;
  permissions: PermissionModel;
  dependencyGraph: DependencyGraph;
}

export interface ValidationError {
  pass: 'schema' | 'relationship' | 'permission' | 'cross-layer' | 'runtime';
  severity: 'error' | 'warning';
  path: string; // e.g. "schema.entities.Task.fields.priority"
  message: string;
  fixSuggestion?: string;
}

export interface ValidationReport {
  isValid: boolean;
  errors: ValidationError[];
  validatedAt: string;
}

export interface CompilerTrace {
  stage: 'intent' | 'assumptions' | 'architecture' | 'schema' | 'validate' | 'repair' | 'graph';
  status: 'success' | 'failed' | 'skipped';
  timestamp: string;
  durationMs: number;
  inputHash: string;
  outputHash: string;
  tokensUsed: number;
  error?: string;
  repairsMade?: string[];
}

export interface CompilationState {
  currentStage: 'idle' | 'intent' | 'assumptions' | 'architecture' | 'schema' | 'validate' | 'repair' | 'graph' | 'complete';
  traces: CompilerTrace[];
  cache: Record<string, { output: any; hash: string }>;
  ast: AppAST | null;
  isCompiling: boolean;
  prompt: string;
}
