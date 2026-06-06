import { AppAST, ValidationError, ValidationReport } from '@/schemas/compiler';

export function validateAST(ast: AppAST): ValidationReport {
  const errors: ValidationError[] = [];

  const addError = (
    pass: ValidationError['pass'],
    severity: ValidationError['severity'],
    path: string,
    message: string,
    fixSuggestion?: string
  ) => {
    errors.push({ pass, severity, path, message, fixSuggestion });
  };

  const entities = ast.schema.entities;
  const entityNames = Object.keys(entities);

  // ==========================================
  // PASS 1: SCHEMA VALIDATION
  // ==========================================
  entityNames.forEach(entityName => {
    const entity = entities[entityName];
    if (!entity.fields || Object.keys(entity.fields).length === 0) {
      addError(
        'schema',
        'error',
        `schema.entities.${entityName}`,
        `Entity "${entityName}" does not contain any fields.`,
        `Add at least an "id" primary key field.`
      );
      return;
    }

    let hasPrimaryKey = false;

    Object.entries(entity.fields).forEach(([fieldName, field]) => {
      // Check for valid types
      const validTypes = ['string', 'number', 'boolean', 'date', 'enum'];
      if (!validTypes.includes(field.type)) {
        addError(
          'schema',
          'error',
          `schema.entities.${entityName}.fields.${fieldName}.type`,
          `Field "${fieldName}" has invalid type "${field.type}". Valid types are: ${validTypes.join(', ')}.`,
          `Change the type to "string", "number", "boolean", "date", or "enum".`
        );
      }

      if (field.primaryKey) {
        hasPrimaryKey = true;
      }

      // Check enum types
      if (field.type === 'enum') {
        if (!field.enumValues || field.enumValues.length === 0) {
          addError(
            'schema',
            'error',
            `schema.entities.${entityName}.fields.${fieldName}.enumValues`,
            `Field "${fieldName}" is of type "enum" but is missing enumValues.`,
            `Provide an array of enum string options, e.g., ["Low", "Medium", "High"].`
          );
        }
      }

      // Validate default values match their types
      if (field.defaultValue !== undefined && field.defaultValue !== null) {
        const val = field.defaultValue;
        if (field.type === 'number' && isNaN(Number(val))) {
          addError(
            'schema',
            'error',
            `schema.entities.${entityName}.fields.${fieldName}.defaultValue`,
            `Default value "${val}" is not a valid number.`,
            `Change default value to a number like 0 or 1.`
          );
        } else if (field.type === 'boolean' && typeof val !== 'boolean' && val !== 'true' && val !== 'false') {
          addError(
            'schema',
            'error',
            `schema.entities.${entityName}.fields.${fieldName}.defaultValue`,
            `Default value "${val}" is not a valid boolean.`,
            `Change default value to true or false.`
          );
        } else if (field.type === 'enum' && field.enumValues && !field.enumValues.includes(val.toString())) {
          addError(
            'schema',
            'error',
            `schema.entities.${entityName}.fields.${fieldName}.defaultValue`,
            `Default value "${val}" is not one of the enum values [${field.enumValues.join(', ')}].`,
            `Use one of the defined enum values as the default.`
          );
        }
      }
    });

    if (!hasPrimaryKey) {
      addError(
        'schema',
        'error',
        `schema.entities.${entityName}`,
        `Entity "${entityName}" is missing a primary key.`,
        `Add an "id" field and set primaryKey: true.`
      );
    }
  });

  // ==========================================
  // PASS 2: RELATIONSHIP VALIDATION
  // ==========================================
  entityNames.forEach(entityName => {
    const entity = entities[entityName];
    Object.entries(entity.fields).forEach(([fieldName, field]) => {
      if (field.foreignKey) {
        const fk = field.foreignKey;
        
        // Target entity must exist
        if (!entityNames.includes(fk.entity)) {
          addError(
            'relationship',
            'error',
            `schema.entities.${entityName}.fields.${fieldName}.foreignKey.entity`,
            `Foreign key on "${entityName}.${fieldName}" points to non-existent entity "${fk.entity}".`,
            `Point the foreign key to one of the defined entities: ${entityNames.join(', ')}.`
          );
        } else {
          // Target field must exist on target entity
          const targetEntity = entities[fk.entity];
          const targetField = targetEntity.fields[fk.field];
          if (!targetField) {
            addError(
              'relationship',
              'error',
              `schema.entities.${entityName}.fields.${fieldName}.foreignKey.field`,
              `Foreign key on "${entityName}.${fieldName}" points to non-existent field "${fk.entity}.${fk.field}".`,
              `Set target field to a valid field on "${fk.entity}", typically "id".`
            );
          } else if (!targetField.primaryKey && !targetField.unique) {
            // Target field should be a unique or primary key
            addError(
              'relationship',
              'warning',
              `schema.entities.${entityName}.fields.${fieldName}.foreignKey.field`,
              `Foreign key on "${entityName}.${fieldName}" points to non-unique field "${fk.entity}.${fk.field}". Relationships are safer when pointing to unique fields.`,
              `Ensure target field is a primary key or has unique: true.`
            );
          }
        }
      }
    });
  });

  // ==========================================
  // PASS 3: PERMISSION VALIDATION
  // ==========================================
  const validRoles = ast.permissions.roles;
  if (!validRoles || validRoles.length === 0) {
    addError(
      'permission',
      'warning',
      'permissions.roles',
      `No roles are defined in permission model.`,
      `Add standard roles like ["Admin", "User", "Manager"].`
    );
  }

  ast.permissions.rules.forEach((rule, idx) => {
    // Role must be defined
    if (validRoles && !validRoles.includes(rule.role)) {
      addError(
        'permission',
        'error',
        `permissions.rules[${idx}].role`,
        `Rule refers to undefined role "${rule.role}".`,
        `Add "${rule.role}" to permissions.roles or assign rule to an existing role: ${validRoles.join(', ')}.`
      );
    }

    // Target entity must exist
    if (!entityNames.includes(rule.entity)) {
      addError(
        'permission',
        'error',
        `permissions.rules[${idx}].entity`,
        `Rule applies to non-existent entity "${rule.entity}".`,
        `Correct entity name to one of: ${entityNames.join(', ')}.`
      );
    }

    // Check action array is not empty
    if (!rule.actions || rule.actions.length === 0) {
      addError(
        'permission',
        'error',
        `permissions.rules[${idx}].actions`,
        `Permission rule for role "${rule.role}" on "${rule.entity}" contains no actions.`,
        `Assign at least one action: "create", "read", "update", or "delete".`
      );
    } else {
      rule.actions.forEach(action => {
        const validActions = ['create', 'read', 'update', 'delete'];
        if (!validActions.includes(action)) {
          addError(
            'permission',
            'error',
            `permissions.rules[${idx}].actions`,
            `Invalid action "${action}" in rule. Valid actions are: ${validActions.join(', ')}.`,
            `Change to one of: "create", "read", "update", "delete".`
          );
        }
      });
    }
  });

  // ==========================================
  // PASS 4: CROSS-LAYER CONSISTENCY VALIDATION
  // ==========================================
  // Pages validation
  ast.architecture.pages.forEach((page, idx) => {
    if (page.entity && !entityNames.includes(page.entity)) {
      addError(
        'cross-layer',
        'error',
        `architecture.pages[${idx}].entity`,
        `Page "${page.title}" links to non-existent entity "${page.entity}".`,
        `Set entity to one of: ${entityNames.join(', ')} or remove entity assignment.`
      );
    }

    // Component validation
    page.components.forEach((compId, cIdx) => {
      const compExists = ast.architecture.components.some(c => c.id === compId);
      if (!compExists) {
        addError(
          'cross-layer',
          'error',
          `architecture.pages[${idx}].components[${cIdx}]`,
          `Page "${page.title}" references a component ID "${compId}" that does not exist in components list.`,
          `Add component with ID "${compId}" to architecture.components or remove reference.`
        );
      }
    });
  });

  // Components validation
  ast.architecture.components.forEach((component, idx) => {
    if (component.entity && !entityNames.includes(component.entity)) {
      addError(
        'cross-layer',
        'error',
        `architecture.components[${idx}].entity`,
        `Component "${component.name}" binds to non-existent entity "${component.entity}".`,
        `Bind component to one of the defined entities: ${entityNames.join(', ')}.`
      );
    }
  });

  // ==========================================
  // PASS 5: RUNTIME VALIDATION
  // ==========================================
  // Verify fields inside permission condition statements
  ast.permissions.rules.forEach((rule, idx) => {
    if (rule.condition && entityNames.includes(rule.entity)) {
      const targetEntity = entities[rule.entity];
      
      // Basic expression token extraction (e.g. ownerId, status, etc.)
      // Matches standard field identifiers in expressions
      const matches = rule.condition.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g);
      if (matches) {
        matches.forEach(token => {
          // Ignore javascript keywords, current user references, and literal strings/booleans
          const ignoredTokens = ['currentUser', 'id', 'role', 'true', 'false', 'null', 'undefined', 'and', 'or', 'not', 'eq', 'ne'];
          if (!ignoredTokens.includes(token) && isNaN(Number(token))) {
            // If it's a lowercase token that doesn't exist on the entity, raise warning/error
            if (token.charAt(0) === token.charAt(0).toLowerCase() && !targetEntity.fields[token]) {
              addError(
                'runtime',
                'warning',
                `permissions.rules[${idx}].condition`,
                `Permission condition "${rule.condition}" references field "${token}" which does not exist on entity "${rule.entity}". This might fail at runtime.`,
                `Ensure field "${token}" is defined in "${rule.entity}" schema or correct spelling.`
              );
            }
          }
        });
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    validatedAt: new Date().toISOString(),
  };
}
