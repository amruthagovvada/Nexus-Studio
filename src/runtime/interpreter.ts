import { create } from 'zustand';
import { AppAST } from '@/schemas/compiler';

interface RuntimeState {
  db: Record<string, any[]>; // Holds data for each entity
  currentUser: { id: string; name: string; role: string } | null;
  logs: { timestamp: string; action: string; status: 'success' | 'error'; message: string }[];
}

interface RuntimeActions {
  initializeRuntime: (ast: AppAST) => void;
  setCurrentUser: (user: { id: string; name: string; role: string } | null) => void;
  insertRow: (entityName: string, row: any) => { success: boolean; error?: string };
  updateRow: (entityName: string, id: string, row: any) => { success: boolean; error?: string };
  deleteRow: (entityName: string, id: string) => { success: boolean; error?: string };
  selectRows: (entityName: string) => any[];
  addLog: (action: string, status: 'success' | 'error', message: string) => void;
  clearLogs: () => void;
}

export const useRuntimeStore = create<RuntimeState & RuntimeActions>((set, get) => {
  
  // Safe condition checker evaluating permission expressions
  const evaluatePermission = (condition: string | undefined, row: any, user: any): boolean => {
    if (!condition) return true;
    try {
      // Evaluate condition with row fields exposed in scope
      const fn = new Function('row', 'currentUser', `
        with (row) {
          try {
            return ${condition};
          } catch(e) {
            return false;
          }
        }
      `);
      return !!fn(row, user);
    } catch (e) {
      return false;
    }
  };

  return {
    db: {},
    currentUser: null,
    logs: [],

    addLog: (action, status, message) => {
      set(state => ({
        logs: [
          { timestamp: new Date().toLocaleTimeString(), action, status, message },
          ...state.logs.slice(0, 99), // Keep last 100 logs
        ],
      }));
    },

    clearLogs: () => set({ logs: [] }),

    setCurrentUser: (user) => {
      set({ currentUser: user });
      get().addLog('Session Change', 'success', `Logged in as ${user ? `${user.name} (${user.role})` : 'Anonymous'}`);
    },

    initializeRuntime: (ast) => {
      if (!ast || !ast.schema || !ast.schema.entities || !ast.architecture) return;
      const initialDb: Record<string, any[]> = {};
      const entityNames = Object.keys(ast.schema.entities);

      entityNames.forEach(entityName => {
        initialDb[entityName] = [];
      });

      // Default mock users to make permissions check easy
      const mockUsers = [
        { id: 'usr-1', name: 'Sarah Jenkins', email: 'sarah@enterprise.com', role: 'Admin' },
        { id: 'usr-2', name: 'David Miller', email: 'david@enterprise.com', role: 'Manager' },
        { id: 'usr-3', name: 'Alex Wong', email: 'alex@enterprise.com', role: 'User' },
      ];

      // Auto-seed data based on schemas
      entityNames.forEach(entityName => {
        const entity = ast.schema.entities[entityName];
        
        // Seed standard items
        if (entityName.toLowerCase() === 'user') {
          initialDb[entityName] = mockUsers;
        } else {
          // Generate 3 simple mock records based on fields
          const mockRecords: any[] = [];
          for (let i = 1; i <= 3; i++) {
            const record: any = {};
            
            Object.entries(entity.fields).forEach(([fieldName, field]) => {
              if (field.primaryKey) {
                record[fieldName] = `${entityName.toLowerCase()}-${i}`;
              } else if (field.foreignKey) {
                // Point to a User or first record of another seed
                if (field.foreignKey.entity.toLowerCase() === 'user') {
                  record[fieldName] = `usr-${(i % 3) + 1}`;
                } else {
                  record[fieldName] = `${field.foreignKey.entity.toLowerCase()}-1`;
                }
              } else if (field.type === 'enum' && field.enumValues && field.enumValues.length > 0) {
                record[fieldName] = field.enumValues[i % field.enumValues.length];
              } else if (field.type === 'string') {
                if (fieldName.toLowerCase().includes('name') || fieldName.toLowerCase().includes('title')) {
                  record[fieldName] = `Sample ${entityName} #${i}`;
                } else if (fieldName.toLowerCase().includes('desc') || fieldName.toLowerCase().includes('detail')) {
                  record[fieldName] = `This is a sample description number ${i} for this enterprise database entity.`;
                } else {
                  record[fieldName] = `Value ${i}`;
                }
              } else if (field.type === 'number') {
                record[fieldName] = i * 100;
              } else if (field.type === 'boolean') {
                record[fieldName] = i % 2 === 0;
              } else if (field.type === 'date') {
                const date = new Date();
                date.setDate(date.getDate() - i);
                record[fieldName] = date.toISOString().split('T')[0];
              }
            });
            mockRecords.push(record);
          }
          initialDb[entityName] = mockRecords;
        }
      });

      // Default current user to Sarah (Admin) if not set
      const defaultUser = ast.permissions.roles.includes('Admin') ? mockUsers[0] : (ast.permissions.roles[0] ? { id: 'usr-1', name: 'Sarah Jenkins', role: ast.permissions.roles[0] } : null);

      set({
        db: initialDb,
        currentUser: defaultUser,
        logs: [{ timestamp: new Date().toLocaleTimeString(), action: 'DB Init', status: 'success', message: `Database initialized with tables: ${entityNames.join(', ')}` }],
      });
    },

    insertRow: (entityName, row) => {
      const { db, currentUser } = get();
      // Fetch AST from compilerStore to check schemas and permissions
      const compilerState = (window as any).__compiler_ast as AppAST | undefined;
      if (!compilerState) {
        return { success: false, error: 'Compiler AST not loaded in runtime context.' };
      }

      const entity = compilerState.schema.entities[entityName];
      if (!entity) return { success: false, error: `Entity "${entityName}" does not exist.` };

      // 1. Check Permissions
      const userRole = currentUser?.role || 'Guest';
      const rule = compilerState.permissions.rules.find(r => r.role === userRole && r.entity === entityName && r.actions.includes('create'));
      if (!rule) {
        get().addLog(`INSERT INTO ${entityName}`, 'error', `Permission denied. Role "${userRole}" cannot create "${entityName}".`);
        return { success: false, error: `Permission Denied: Role "${userRole}" does not have insert permissions on "${entityName}".` };
      }

      // Check condition on insertion (optional but nice)
      if (rule.condition && !evaluatePermission(rule.condition, row, currentUser)) {
        get().addLog(`INSERT INTO ${entityName}`, 'error', `Constraint violation. Permission condition "${rule.condition}" evaluated to false.`);
        return { success: false, error: `Permission Denied: Condition "${rule.condition}" not satisfied.` };
      }

      // 2. Validate Type & Constraints
      const newRow = { ...row };
      const fields = entity.fields;
      
      for (const [fieldName, field] of Object.entries(fields)) {
        let val = newRow[fieldName];

        // Apply primary key generation if missing
        if (field.primaryKey && !val) {
          val = `${entityName.toLowerCase()}-${Date.now()}`;
          newRow[fieldName] = val;
        }

        // Required check
        if (field.required && (val === undefined || val === null || val === '')) {
          get().addLog(`INSERT INTO ${entityName}`, 'error', `Field "${fieldName}" is required.`);
          return { success: false, error: `Validation Error: Field "${fieldName}" is required.` };
        }

        // Type conversion/check
        if (val !== undefined && val !== null && val !== '') {
          if (field.type === 'number') {
            const num = Number(val);
            if (isNaN(num)) {
              get().addLog(`INSERT INTO ${entityName}`, 'error', `Field "${fieldName}" must be a number.`);
              return { success: false, error: `Validation Error: "${fieldName}" must be a valid number.` };
            }
            newRow[fieldName] = num;
          } else if (field.type === 'boolean') {
            newRow[fieldName] = String(val) === 'true' || val === true;
          } else if (field.type === 'enum' && field.enumValues) {
            if (!field.enumValues.includes(String(val))) {
              get().addLog(`INSERT INTO ${entityName}`, 'error', `Field "${fieldName}" has invalid enum value "${val}".`);
              return { success: false, error: `Validation Error: "${fieldName}" must be one of [${field.enumValues.join(', ')}].` };
            }
          }
        }

        // Unique Constraint check
        if (field.unique && val) {
          const exists = db[entityName].some(r => r[fieldName] === val);
          if (exists) {
            get().addLog(`INSERT INTO ${entityName}`, 'error', `Unique constraint violated on "${fieldName}". Value "${val}" already exists.`);
            return { success: false, error: `Database Error: Unique constraint violated on "${fieldName}". Value "${val}" already exists.` };
          }
        }

        // Foreign Key check
        if (field.foreignKey && val) {
          const fk = field.foreignKey;
          const targetTable = db[fk.entity] || [];
          const refExists = targetTable.some(r => r[fk.field] === val);
          if (!refExists) {
            get().addLog(`INSERT INTO ${entityName}`, 'error', `Foreign Key constraint violation on "${fieldName}". Referenced row in "${fk.entity}" with "${fk.field}" = "${val}" does not exist.`);
            return { success: false, error: `Foreign Key Violation: "${fieldName}" references non-existent row in "${fk.entity}".` };
          }
        }
      }

      set(state => ({
        db: {
          ...state.db,
          [entityName]: [...state.db[entityName], newRow],
        },
      }));

      get().addLog(`INSERT INTO ${entityName}`, 'success', `Inserted row with id "${newRow.id || newRow.uid || 'N/A'}"`);
      return { success: true };
    },

    updateRow: (entityName, id, row) => {
      const { db, currentUser } = get();
      const compilerState = (window as any).__compiler_ast as AppAST | undefined;
      if (!compilerState) return { success: false, error: 'Compiler AST not loaded.' };

      const entity = compilerState.schema.entities[entityName];
      if (!entity) return { success: false, error: `Entity "${entityName}" does not exist.` };

      // Find existing row
      const pkField = Object.keys(entity.fields).find(k => entity.fields[k].primaryKey) || 'id';
      const existingRow = db[entityName].find(r => String(r[pkField]) === String(id));
      if (!existingRow) {
        get().addLog(`UPDATE ${entityName}`, 'error', `Row with ID "${id}" not found.`);
        return { success: false, error: `Database Error: Row with ID "${id}" not found.` };
      }

      // 1. Check Permissions & condition
      const userRole = currentUser?.role || 'Guest';
      const rule = compilerState.permissions.rules.find(r => r.role === userRole && r.entity === entityName && r.actions.includes('update'));
      if (!rule) {
        get().addLog(`UPDATE ${entityName}`, 'error', `Permission denied. Role "${userRole}" cannot update "${entityName}".`);
        return { success: false, error: `Permission Denied: Role "${userRole}" does not have update permissions on "${entityName}".` };
      }

      // Check rule condition against the existing row (before changes)
      if (rule.condition && !evaluatePermission(rule.condition, existingRow, currentUser)) {
        get().addLog(`UPDATE ${entityName}`, 'error', `Permission denied. Condition "${rule.condition}" evaluated to false on this row.`);
        return { success: false, error: `Permission Denied: Condition "${rule.condition}" is not satisfied for this record.` };
      }

      // 2. Validate Type & Constraints
      const updatedRow = { ...existingRow, ...row };
      const fields = entity.fields;

      for (const [fieldName, field] of Object.entries(fields)) {
        const val = updatedRow[fieldName];

        // Required check
        if (field.required && (val === undefined || val === null || val === '')) {
          get().addLog(`UPDATE ${entityName}`, 'error', `Field "${fieldName}" is required.`);
          return { success: false, error: `Validation Error: Field "${fieldName}" is required.` };
        }

        // Type conversion
        if (val !== undefined && val !== null && val !== '') {
          if (field.type === 'number') {
            const num = Number(val);
            if (isNaN(num)) return { success: false, error: `Validation Error: "${fieldName}" must be a number.` };
            updatedRow[fieldName] = num;
          } else if (field.type === 'boolean') {
            updatedRow[fieldName] = String(val) === 'true' || val === true;
          } else if (field.type === 'enum' && field.enumValues) {
            if (!field.enumValues.includes(String(val))) {
              return { success: false, error: `Validation Error: "${fieldName}" must be one of [${field.enumValues.join(', ')}].` };
            }
          }
        }

        // Unique Constraint check (excluding current row)
        if (field.unique && val && val !== existingRow[fieldName]) {
          const exists = db[entityName].some(r => r[pkField] !== id && r[fieldName] === val);
          if (exists) {
            get().addLog(`UPDATE ${entityName}`, 'error', `Unique constraint violated on "${fieldName}". Value "${val}" already exists.`);
            return { success: false, error: `Database Error: Unique constraint violated on "${fieldName}". Value "${val}" already exists.` };
          }
        }

        // Foreign Key check
        if (field.foreignKey && val) {
          const fk = field.foreignKey;
          const targetTable = db[fk.entity] || [];
          const refExists = targetTable.some(r => r[fk.field] === val);
          if (!refExists) {
            get().addLog(`UPDATE ${entityName}`, 'error', `Foreign Key constraint violation on "${fieldName}". Referenced row in "${fk.entity}" with "${fk.field}" = "${val}" does not exist.`);
            return { success: false, error: `Foreign Key Violation: "${fieldName}" references non-existent row in "${fk.entity}".` };
          }
        }
      }

      set(state => ({
        db: {
          ...state.db,
          [entityName]: state.db[entityName].map(r => String(r[pkField]) === String(id) ? updatedRow : r),
        },
      }));

      get().addLog(`UPDATE ${entityName}`, 'success', `Updated row with ID "${id}"`);
      return { success: true };
    },

    deleteRow: (entityName, id) => {
      const { db, currentUser } = get();
      const compilerState = (window as any).__compiler_ast as AppAST | undefined;
      if (!compilerState) return { success: false, error: 'Compiler AST not loaded.' };

      const entity = compilerState.schema.entities[entityName];
      if (!entity) return { success: false, error: `Entity "${entityName}" does not exist.` };

      const pkField = Object.keys(entity.fields).find(k => entity.fields[k].primaryKey) || 'id';
      const existingRow = db[entityName].find(r => String(r[pkField]) === String(id));
      if (!existingRow) {
        get().addLog(`DELETE ${entityName}`, 'error', `Row with ID "${id}" not found.`);
        return { success: false, error: `Database Error: Row with ID "${id}" not found.` };
      }

      // 1. Check Permissions
      const userRole = currentUser?.role || 'Guest';
      const rule = compilerState.permissions.rules.find(r => r.role === userRole && r.entity === entityName && r.actions.includes('delete'));
      if (!rule) {
        get().addLog(`DELETE ${entityName}`, 'error', `Permission denied. Role "${userRole}" cannot delete "${entityName}".`);
        return { success: false, error: `Permission Denied: Role "${userRole}" does not have delete permissions on "${entityName}".` };
      }

      // Check rule condition against row
      if (rule.condition && !evaluatePermission(rule.condition, existingRow, currentUser)) {
        get().addLog(`DELETE ${entityName}`, 'error', `Permission denied. Condition "${rule.condition}" evaluated to false.`);
        return { success: false, error: `Permission Denied: Condition "${rule.condition}" is not satisfied for this record.` };
      }

      // 2. Check Referential Integrity (Foreign key blocking)
      // If other tables point to this table, block deletion
      const entityNames = Object.keys(db);
      for (const otherEntityName of entityNames) {
        const otherEntity = compilerState.schema.entities[otherEntityName];
        if (!otherEntity) continue;

        for (const [otherFieldName, otherField] of Object.entries(otherEntity.fields)) {
          if (otherField.foreignKey && otherField.foreignKey.entity === entityName) {
            const hasReferences = db[otherEntityName].some(r => String(r[otherFieldName]) === String(id));
            if (hasReferences) {
              get().addLog(`DELETE ${entityName}`, 'error', `Referential Integrity Error: Deletion blocked. Table "${otherEntityName}" has records referencing this "${entityName}".`);
              return {
                success: false,
                error: `Referential Integrity Violation: Cannot delete this "${entityName}" because it is referenced in "${otherEntityName}" (Field: "${otherFieldName}").`,
              };
            }
          }
        }
      }

      set(state => ({
        db: {
          ...state.db,
          [entityName]: state.db[entityName].filter(r => String(r[pkField]) !== String(id)),
        },
      }));

      get().addLog(`DELETE ${entityName}`, 'success', `Deleted row with ID "${id}"`);
      return { success: true };
    },

    selectRows: (entityName) => {
      const { db, currentUser } = get();
      const compilerState = (window as any).__compiler_ast as AppAST | undefined;
      if (!compilerState) return [];

      const rows = db[entityName] || [];
      const userRole = currentUser?.role || 'Guest';

      // Find read permission rule
      const rule = compilerState.permissions.rules.find(r => r.role === userRole && r.entity === entityName && r.actions.includes('read'));
      if (!rule) return []; // Access denied completely

      // Filter rows by condition rule
      if (rule.condition) {
        return rows.filter(row => evaluatePermission(rule.condition, row, currentUser));
      }

      return rows;
    },
  };
});
