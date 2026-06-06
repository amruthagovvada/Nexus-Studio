import { IntentModel, Assumption, ArchitectureModel, SchemaModel, PermissionModel, AppAST } from '@/schemas/compiler';

export function getDetectedDomain(prompt: string): 'hospital' | 'ecommerce' | 'asset' | 'crm' | 'custom' {
  const p = prompt.toLowerCase();
  if (p.includes('hospital') || p.includes('doctor') || p.includes('patient') || p.includes('appointment') || p.includes('prescription') || p.includes('medical') || p.includes('bill')) {
    return 'hospital';
  }
  if (p.includes('ecommerce') || p.includes('e-commerce') || p.includes('shop') || p.includes('product') || p.includes('category') || p.includes('order') || p.includes('catalog') || p.includes('inventory')) {
    return 'ecommerce';
  }
  if (p.includes('asset') || p.includes('maintenance') || p.includes('location') || p.includes('employee') || p.includes('tracking') || p.includes('hardware')) {
    return 'asset';
  }
  if (p.includes('crm') || p.includes('deal') || p.includes('contact') || p.includes('opportunity') || p.includes('sales')) {
    return 'crm';
  }
  return 'custom';
}

export function getCustomEntities(prompt: string): string[] {
  const keywords = [
    "book", "author", "loan", "borrower", "student", "teacher", "course", "class", "grade",
    "flight", "passenger", "ticket", "booking", "airline", "hotel", "room", "guest", "reservation",
    "project", "task", "member", "board", "team", "event", "venue", "attendee",
    "movie", "theater", "seat", "showtime", "recipe", "ingredient", "menu", "chef",
    "car", "rental", "driver", "fleet", "trip", "device", "sensor", "reading", "metric"
  ];
  const found = new Set<string>(["User"]);
  const lowercase = prompt.toLowerCase();
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}s?\\b`, 'i');
    if (regex.test(lowercase)) {
      const entityName = kw.charAt(0).toUpperCase() + kw.slice(1);
      found.add(entityName);
    }
  });

  if (found.size > 1) {
    return Array.from(found);
  }
  return ["User", "Item", "Transaction", "Log"];
}

export function getFallbackIntent(prompt: string) {
  const domain = getDetectedDomain(prompt);
  
  if (domain === 'hospital') {
    return {
      appName: "MedCare HMS",
      intent: {
        description: "Comprehensive Hospital Management System for patient registration, appointment scheduling, doctor tracking, prescriptions, and billing audits.",
        features: [
          "Register and manage detailed Patient records.",
          "Schedule and manage doctor appointments.",
          "Generate patient prescriptions linking doctors and appointments.",
          "Issue and track patient billing and payments.",
          "Role-based restriction where only Doctors can issue prescriptions."
        ],
        entities: ["User", "Doctor", "Patient", "Appointment", "Prescription", "Bill"],
        roles: ["Admin", "Doctor", "Staff", "User"],
        detectedDomain: "Hospital Management"
      }
    };
  }
  
  if (domain === 'ecommerce') {
    return {
      appName: "Apex E-Commerce",
      intent: {
        description: "Modern E-Commerce platform for inventory management, product catalogs, shopping orders, and customer billing workflows.",
        features: [
          "Manage catalog of Products and Categories.",
          "Process customer orders and track fulfillment state.",
          "Secure Payment gateway integration for transactions.",
          "Access control restricting customer data to Admins and Managers."
        ],
        entities: ["User", "Product", "Category", "Customer", "Order", "Payment"],
        roles: ["Admin", "Manager", "Customer"],
        detectedDomain: "E-Commerce Platform"
      }
    };
  }
  
  if (domain === 'asset') {
    return {
      appName: "Asset Tracker",
      intent: {
        description: "Enterprise IT support and hardware asset management system tracking locations, devices, employees, and repair maintenance logs.",
        features: [
          "Register IT assets and hardware tag properties.",
          "Assign assets to employees and tracking physical office locations.",
          "Log hardware maintenance and repair costs.",
          "Restrict editing of asset tags and storage status to Admins."
        ],
        entities: ["User", "Asset", "MaintenanceLog", "Location", "Employee"],
        roles: ["Admin", "Manager", "Employee"],
        detectedDomain: "Asset Tracking System"
      }
    };
  }

  if (domain === 'crm') {
    return {
      appName: "Apex CRM Suite",
      intent: {
        description: "Enterprise Client Relationship Manager featuring deal pipelines, contact records, role-based access security, and payment logging for premium plan subscriptions.",
        features: [
          "Create, read, update, and delete Client Contact entries.",
          "Manage Sales Deal opportunities with custom financial values.",
          "Role-based access permissions restricting Payment data to Admin accounts.",
          "Filter CRM items dynamically based on account owner IDs."
        ],
        entities: ["User", "Contact", "Deal", "Payment"],
        roles: ["Admin", "Manager", "User"],
        detectedDomain: "CRM Customer Suite"
      }
    };
  }

  const customEntities = getCustomEntities(prompt);
  const mainEntity = customEntities.find(e => e !== 'User') || 'Item';
  return {
    appName: `${mainEntity} Hub System`,
    intent: {
      description: `Custom workspace compiled for managing ${customEntities.join(', ')} configurations dynamically based on user prompts.`,
      features: customEntities.map(e => `Track and update logical logs for the ${e} database entity.`),
      entities: customEntities,
      roles: ["Admin", "Manager", "User"],
      detectedDomain: `Custom ${mainEntity} App`
    }
  };
}

export function getFallbackAssumptions(intent: any) {
  const domain = intent.detectedDomain 
    ? intent.detectedDomain.toLowerCase() 
    : (intent.entities?.includes('Doctor') ? 'hospital' : (intent.entities?.includes('Product') ? 'ecommerce' : (intent.entities?.includes('Asset') ? 'asset' : (intent.entities?.includes('Contact') ? 'crm' : 'custom'))));

  if (domain.includes('hospital')) {
    return {
      assumptions: [
        {
          id: "asm-hosp-1",
          category: "Security",
          statement: "Only Doctors can write or update patient prescriptions.",
          impact: "Generate Prescription permission rules restricting write actions strictly to the Doctor role.",
          enabled: true
        },
        {
          id: "asm-hosp-2",
          category: "Data Modeling",
          statement: "Every Appointment must link to a valid Patient and Doctor.",
          impact: "Add patientId and doctorId fields in the Appointment schema as foreign keys.",
          enabled: true
        },
        {
          id: "asm-hosp-3",
          category: "User Experience",
          statement: "Doctors need a calendar view showing scheduled appointments.",
          impact: "Enable an Appointment tracking component bound to a calendar interface.",
          enabled: true
        },
        {
          id: "asm-hosp-4",
          category: "Workflow Logic",
          statement: "Staff users can read and write patient and appointment data, but cannot write prescriptions.",
          impact: "Define Staff role actions permitting CRUD on Patients/Appointments but Read-Only on Prescriptions.",
          enabled: true
        }
      ]
    };
  }

  if (domain.includes('ecommerce') || domain.includes('e-commerce')) {
    return {
      assumptions: [
        {
          id: "asm-ecom-1",
          category: "Security",
          statement: "Customers can view only their own orders and payments.",
          impact: "Configure conditional rules 'customerId === currentUser.id' for Customer actions on Order and Payment.",
          enabled: true
        },
        {
          id: "asm-ecom-2",
          category: "Data Modeling",
          statement: "Every Product belongs to a Category and every Order is placed by a Customer.",
          impact: "Introduce categoryId in Product, customerId in Order, and orderId in Payment as foreign keys.",
          enabled: true
        },
        {
          id: "asm-ecom-3",
          category: "User Experience",
          statement: "Managers require inventory tables displaying low-stock warnings.",
          impact: "Bind Products component to low-stock threshold aggregations.",
          enabled: true
        },
        {
          id: "asm-ecom-4",
          category: "Workflow Logic",
          statement: "Only Admins and Managers can edit product catalog pricing.",
          impact: "Permit write actions on Product and Category strictly to Admin and Manager roles.",
          enabled: true
        }
      ]
    };
  }

  if (domain.includes('asset')) {
    return {
      assumptions: [
        {
          id: "asm-ast-1",
          category: "Security",
          statement: "Employees can only view assets currently assigned to them.",
          impact: "Create asset permission rules restricting read action to 'ownerId === currentUser.id' for Employees.",
          enabled: true
        },
        {
          id: "asm-ast-2",
          category: "Data Modeling",
          statement: "Every Asset is checked out to a specific User and located at a specific Location.",
          impact: "Add ownerId referencing User and locationId referencing Location as foreign keys in the Asset schema.",
          enabled: true
        },
        {
          id: "asm-ast-3",
          category: "User Experience",
          statement: "Hardware support teams require maintenance cost overview charts.",
          impact: "Generate cost stats card and maintenance charts linked to MaintenanceLog entries.",
          enabled: true
        },
        {
          id: "asm-ast-4",
          category: "Workflow Logic",
          statement: "Only Admins and Managers can schedule repairs and create maintenance logs.",
          impact: "Configure write action on MaintenanceLog to be restricted to Admin and Manager accounts.",
          enabled: true
        }
      ]
    };
  }

  if (domain.includes('crm')) {
    return {
      assumptions: [
        {
          id: "asm-crm-1",
          category: "Security",
          statement: "Only Admins and Managers have access to read client payment logs.",
          impact: "Generate Payment permission rules restricting read/write actions strictly to Admin and Manager roles.",
          enabled: true
        },
        {
          id: "asm-crm-2",
          category: "Data Modeling",
          statement: "Every Contact and Deal is owned by an internal CRM User.",
          impact: "Add an ownerId field to Contact and Deal schemas configured as foreign keys referencing User.id.",
          enabled: true
        },
        {
          id: "asm-crm-3",
          category: "User Experience",
          statement: "Sales dashboards require aggregated financial graphs of current deals.",
          impact: "Ensure Deal entities include a numeric 'value' field and are bound to summary analytics widgets.",
          enabled: true
        },
        {
          id: "asm-crm-4",
          category: "Workflow Logic",
          statement: "Standard Users can only read and write to CRM items they own.",
          impact: "Assign conditional expressions 'ownerId === currentUser.id' to User rules for Contact and Deal actions.",
          enabled: true
        }
      ]
    };
  }

  const entities: string[] = intent.entities || ["User", "Item", "Transaction", "Log"];
  const mainEntity = entities.find((e: string) => e !== 'User') || 'Item';
  return {
    assumptions: [
      {
        id: "asm-cust-1",
        category: "Security",
        statement: "Access is restricted to authenticated account roles.",
        impact: "Add User entity and tie other records back to ownership checks where logical.",
        enabled: true
      },
      {
        id: "asm-cust-2",
        category: "Data Modeling",
        statement: `Dynamic structures are linked back to ${mainEntity} primary details.`,
        impact: `Build foreign key relations pointing to ${mainEntity} across secondary entities.`,
        enabled: true
      }
    ]
  };
}

export function getFallbackArchitecture(intent: any, assumptions: any) {
  const domain = intent.detectedDomain 
    ? intent.detectedDomain.toLowerCase() 
    : (intent.entities?.includes('Doctor') ? 'hospital' : (intent.entities?.includes('Product') ? 'ecommerce' : (intent.entities?.includes('Asset') ? 'asset' : (intent.entities?.includes('Contact') ? 'crm' : 'custom'))));

  if (domain.includes('hospital')) {
    return {
      services: ["Database Engine", "Auth Gateway", "Notification Hub"],
      components: [
        {
          id: "comp-patients-table",
          name: "Patients Grid View",
          type: "table",
          props: ["id", "firstName", "lastName", "email", "gender"],
          entity: "Patient"
        },
        {
          id: "comp-appointments-table",
          name: "Appointments List",
          type: "table",
          props: ["id", "patientId", "doctorId", "appointmentDate", "status"],
          entity: "Appointment"
        },
        {
          id: "comp-prescriptions-table",
          name: "Prescriptions Summary",
          type: "table",
          props: ["id", "doctorId", "patientId", "medication", "instructions"],
          entity: "Prescription"
        },
        {
          id: "comp-billing-stats",
          name: "Billing Analytics Summary",
          type: "stats",
          props: ["totalBilled", "pendingPayments"],
          entity: "Bill"
        }
      ],
      pages: [
        {
          id: "dashboard-page",
          title: "Executive Health Dashboard",
          route: "/dashboard",
          type: "dashboard",
          entity: "Appointment",
          components: ["comp-billing-stats"]
        },
        {
          id: "patients-page",
          title: "Manage Patients",
          route: "/patients",
          type: "crud",
          entity: "Patient",
          components: ["comp-patients-table"]
        },
        {
          id: "appointments-page",
          title: "Appointments Register",
          route: "/appointments",
          type: "crud",
          entity: "Appointment",
          components: ["comp-appointments-table"]
        },
        {
          id: "prescriptions-page",
          title: "Medication Logs",
          route: "/prescriptions",
          type: "crud",
          entity: "Prescription",
          components: ["comp-prescriptions-table"]
        }
      ],
      dataFlow: [
        {
          from: "comp-patients-table",
          to: "comp-appointments-table",
          trigger: "OnRowClick"
        },
        {
          from: "comp-appointments-table",
          to: "comp-prescriptions-table",
          trigger: "OnRowClick"
        }
      ]
    };
  }

  if (domain.includes('ecommerce') || domain.includes('e-commerce')) {
    return {
      services: ["Database Engine", "Auth Gateway", "Stripe API"],
      components: [
        {
          id: "comp-products-table",
          name: "Inventory Catalog Grid",
          type: "table",
          props: ["id", "name", "sku", "price", "stockQty"],
          entity: "Product"
        },
        {
          id: "comp-orders-table",
          name: "Customer Orders List",
          type: "table",
          props: ["id", "customerId", "orderDate", "status", "totalAmount"],
          entity: "Order"
        },
        {
          id: "comp-payments-chart",
          name: "Monthly Revenue Chart",
          type: "chart",
          props: ["date", "amount"],
          entity: "Payment"
        },
        {
          id: "comp-revenue-stats",
          name: "Sales Conversion Card",
          type: "stats",
          props: ["totalRevenue", "ordersQty"],
          entity: "Order"
        }
      ],
      pages: [
        {
          id: "dashboard-page",
          title: "E-Commerce Stats",
          route: "/dashboard",
          type: "dashboard",
          entity: "Order",
          components: ["comp-revenue-stats", "comp-payments-chart"]
        },
        {
          id: "products-page",
          title: "Product Inventory",
          route: "/products",
          type: "crud",
          entity: "Product",
          components: ["comp-products-table"]
        },
        {
          id: "orders-page",
          title: "Order Fulfilment",
          route: "/orders",
          type: "crud",
          entity: "Order",
          components: ["comp-orders-table"]
        }
      ],
      dataFlow: [
        {
          from: "comp-products-table",
          to: "comp-orders-table",
          trigger: "OnRowClick"
        },
        {
          from: "comp-orders-table",
          to: "comp-payments-chart",
          trigger: "StateChange"
        }
      ]
    };
  }

  if (domain.includes('asset')) {
    return {
      services: ["Database Engine", "Auth Gateway", "IT Helpdesk API"],
      components: [
        {
          id: "comp-assets-table",
          name: "IT Hardware Assets Grid",
          type: "table",
          props: ["id", "tag", "name", "status", "ownerId"],
          entity: "Asset"
        },
        {
          id: "comp-maintenance-table",
          name: "Active Repair Records",
          type: "table",
          props: ["id", "assetId", "logDate", "cost", "status"],
          entity: "MaintenanceLog"
        },
        {
          id: "comp-locations-table",
          name: "Physical Location Grid",
          type: "table",
          props: ["id", "name", "building", "room"],
          entity: "Location"
        },
        {
          id: "comp-asset-stats",
          name: "Asset Cost Stats",
          type: "stats",
          props: ["totalCost", "repairCount"],
          entity: "MaintenanceLog"
        }
      ],
      pages: [
        {
          id: "dashboard-page",
          title: "Asset Overview Dashboard",
          route: "/dashboard",
          type: "dashboard",
          entity: "MaintenanceLog",
          components: ["comp-asset-stats"]
        },
        {
          id: "assets-page",
          title: "Hardware Catalogue",
          route: "/assets",
          type: "crud",
          entity: "Asset",
          components: ["comp-assets-table"]
        },
        {
          id: "maintenance-page",
          title: "Repair Logs",
          route: "/maintenance",
          type: "crud",
          entity: "MaintenanceLog",
          components: ["comp-maintenance-table"]
        }
      ],
      dataFlow: [
        {
          from: "comp-assets-table",
          to: "comp-maintenance-table",
          trigger: "OnRowClick"
        }
      ]
    };
  }

  if (domain.includes('crm')) {
    return {
      services: ["Database Engine", "Auth Gateway", "Stripe API"],
      components: [
        {
          id: "comp-contacts-table",
          name: "Contacts Grid View",
          type: "table",
          props: ["id", "firstName", "lastName", "email", "status"],
          entity: "Contact"
        },
        {
          id: "comp-deals-table",
          name: "Deals Summary Table",
          type: "table",
          props: ["id", "title", "value", "stage"],
          entity: "Deal"
        },
        {
          id: "comp-payments-chart",
          name: "Monthly Revenue Chart",
          type: "chart",
          props: ["date", "amount"],
          entity: "Payment"
        },
        {
          id: "comp-stats-grid",
          name: "Revenue Stats Card",
          type: "stats",
          props: ["totalRevenue", "dealsCount"],
          entity: "Deal"
        }
      ],
      pages: [
        {
          id: "dashboard-page",
          title: "Executive Dashboard",
          route: "/dashboard",
          type: "dashboard",
          entity: "Deal",
          components: ["comp-stats-grid", "comp-payments-chart"]
        },
        {
          id: "contacts-page",
          title: "Manage Contacts",
          route: "/contacts",
          type: "crud",
          entity: "Contact",
          components: ["comp-contacts-table"]
        },
        {
          id: "deals-page",
          title: "Deals Board",
          route: "/deals",
          type: "crud",
          entity: "Deal",
          components: ["comp-deals-table"]
        },
        {
          id: "payments-page",
          title: "Billing Logs",
          route: "/payments",
          type: "crud",
          entity: "Payment",
          components: []
        }
      ],
      dataFlow: [
        {
          from: "comp-contacts-table",
          to: "comp-contacts-form",
          trigger: "OnRowClick"
        },
        {
          from: "comp-deals-table",
          to: "comp-deals-form",
          trigger: "OnRowClick"
        }
      ]
    };
  }

  const entities: string[] = intent.entities || ["User", "Item", "Transaction", "Log"];
  const nonUserEntities: string[] = entities.filter((e: string) => e !== 'User');
  const mainEntity = nonUserEntities[0] || 'Item';
  const components = nonUserEntities.map((e: string) => ({
    id: `comp-${e.toLowerCase()}-table`,
    name: `${e} Grid View`,
    type: "table" as const,
    props: ["id", "name", "status"],
    entity: e
  }));
  const pages = [
    {
      id: "dashboard-page",
      title: "Workspace Dashboard",
      route: "/dashboard",
      type: "dashboard" as const,
      entity: mainEntity,
      components: []
    },
    ...nonUserEntities.map(e => ({
      id: `${e.toLowerCase()}-page`,
      title: `Manage ${e}s`,
      route: `/${e.toLowerCase()}s`,
      type: "crud" as const,
      entity: e,
      components: [`comp-${e.toLowerCase()}-table`]
    }))
  ];
  return {
    services: ["Database Engine", "Auth Gateway"],
    components,
    pages,
    dataFlow: []
  };
}

export function getFallbackSchema(intent: any, assumptions: any, architecture: any) {
  const domain = intent.detectedDomain 
    ? intent.detectedDomain.toLowerCase() 
    : (intent.entities?.includes('Doctor') ? 'hospital' : (intent.entities?.includes('Product') ? 'ecommerce' : (intent.entities?.includes('Asset') ? 'asset' : (intent.entities?.includes('Contact') ? 'crm' : 'custom'))));

  if (domain.includes('hospital')) {
    return {
      schema: {
        entities: {
          User: {
            name: "User",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              name: { name: "name", type: "string", required: true },
              email: { name: "email", type: "string", required: true, unique: true },
              role: { name: "role", type: "enum", required: true, enumValues: ["Admin", "Doctor", "Staff", "User"], defaultValue: "User" }
            }
          },
          Doctor: {
            name: "Doctor",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              name: { name: "name", type: "string", required: true },
              specialty: { name: "specialty", type: "string", required: true },
              email: { name: "email", type: "string", required: true, unique: true },
              status: { name: "status", type: "enum", required: true, enumValues: ["Available", "On-Leave", "Busy"], defaultValue: "Available" }
            }
          },
          Patient: {
            name: "Patient",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              firstName: { name: "firstName", type: "string", required: true },
              lastName: { name: "lastName", type: "string", required: true },
              email: { name: "email", type: "string", required: true, unique: true },
              gender: { name: "gender", type: "enum", required: true, enumValues: ["Male", "Female", "Other"], defaultValue: "Male" }
            }
          },
          Appointment: {
            name: "Appointment",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              patientId: { name: "patientId", type: "string", required: true, foreignKey: { entity: "Patient", field: "id" } },
              doctorId: { name: "doctorId", type: "string", required: true, foreignKey: { entity: "Doctor", field: "id" } },
              appointmentDate: { name: "appointmentDate", type: "date", required: true },
              status: { name: "status", type: "enum", required: true, enumValues: ["Scheduled", "Completed", "Cancelled"], defaultValue: "Scheduled" }
            }
          },
          Prescription: {
            name: "Prescription",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              appointmentId: { name: "appointmentId", type: "string", required: true, foreignKey: { entity: "Appointment", field: "id" } },
              doctorId: { name: "doctorId", type: "string", required: true, foreignKey: { entity: "Doctor", field: "id" } },
              patientId: { name: "patientId", type: "string", required: true, foreignKey: { entity: "Patient", field: "id" } },
              medication: { name: "medication", type: "string", required: true },
              instructions: { name: "instructions", type: "string", required: true }
            }
          },
          Bill: {
            name: "Bill",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              patientId: { name: "patientId", type: "string", required: true, foreignKey: { entity: "Patient", field: "id" } },
              amount: { name: "amount", type: "number", required: true, defaultValue: 0 },
              status: { name: "status", type: "enum", required: true, enumValues: ["Unpaid", "Paid", "Pending"], defaultValue: "Unpaid" }
            }
          }
        }
      },
      permissions: {
        roles: ["Admin", "Doctor", "Staff", "User"],
        rules: [
          { role: "Admin", entity: "User", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Doctor", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Patient", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Appointment", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Prescription", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Bill", actions: ["create", "read", "update", "delete"] },
          { role: "Doctor", entity: "Patient", actions: ["create", "read", "update"] },
          { role: "Doctor", entity: "Appointment", actions: ["read", "update"] },
          { role: "Doctor", entity: "Prescription", actions: ["create", "read", "update", "delete"] },
          { role: "Doctor", entity: "Bill", actions: ["read"] },
          { role: "Staff", entity: "Patient", actions: ["create", "read", "update"] },
          { role: "Staff", entity: "Appointment", actions: ["create", "read", "update"] },
          { role: "Staff", entity: "Bill", actions: ["create", "read", "update"] },
          { role: "Staff", entity: "Prescription", actions: ["read"] },
          { role: "User", entity: "Patient", actions: ["read", "update"], condition: "id === currentUser.id" },
          { role: "User", entity: "Appointment", actions: ["create", "read"], condition: "patientId === currentUser.id" },
          { role: "User", entity: "Prescription", actions: ["read"], condition: "patientId === currentUser.id" },
          { role: "User", entity: "Bill", actions: ["read"], condition: "patientId === currentUser.id" }
        ]
      }
    };
  }

  if (domain.includes('ecommerce') || domain.includes('e-commerce')) {
    return {
      schema: {
        entities: {
          User: {
            name: "User",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              name: { name: "name", type: "string", required: true },
              email: { name: "email", type: "string", required: true, unique: true },
              role: { name: "role", type: "enum", required: true, enumValues: ["Admin", "Manager", "Customer"], defaultValue: "Customer" }
            }
          },
          Product: {
            name: "Product",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              name: { name: "name", type: "string", required: true },
              sku: { name: "sku", type: "string", required: true, unique: true },
              price: { name: "price", type: "number", required: true, defaultValue: 0 },
              stockQty: { name: "stockQty", type: "number", required: true, defaultValue: 0 },
              category: { name: "category", type: "enum", required: true, enumValues: ["Electronics", "Apparel", "Home", "Books"], defaultValue: "Electronics" }
            }
          },
          Category: {
            name: "Category",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              name: { name: "name", type: "string", required: true },
              description: { name: "description", type: "string", required: true }
            }
          },
          Customer: {
            name: "Customer",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              firstName: { name: "firstName", type: "string", required: true },
              lastName: { name: "lastName", type: "string", required: true },
              email: { name: "email", type: "string", required: true, unique: true }
            }
          },
          Order: {
            name: "Order",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              customerId: { name: "customerId", type: "string", required: true, foreignKey: { entity: "Customer", field: "id" } },
              orderDate: { name: "orderDate", type: "date", required: true },
              status: { name: "status", type: "enum", required: true, enumValues: ["Pending", "Shipped", "Delivered", "Cancelled"], defaultValue: "Pending" },
              totalAmount: { name: "totalAmount", type: "number", required: true, defaultValue: 0 }
            }
          },
          Payment: {
            name: "Payment",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              orderId: { name: "orderId", type: "string", required: true, foreignKey: { entity: "Order", field: "id" } },
              amount: { name: "amount", type: "number", required: true },
              status: { name: "status", type: "enum", required: true, enumValues: ["Pending", "Succeeded", "Failed"], defaultValue: "Succeeded" },
              planType: { name: "planType", type: "enum", required: true, enumValues: ["Standard", "Express"], defaultValue: "Standard" }
            }
          }
        }
      },
      permissions: {
        roles: ["Admin", "Manager", "Customer"],
        rules: [
          { role: "Admin", entity: "User", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Product", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Category", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Customer", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Order", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Payment", actions: ["create", "read", "update", "delete"] },
          { role: "Manager", entity: "Product", actions: ["create", "read", "update"] },
          { role: "Manager", entity: "Category", actions: ["create", "read", "update"] },
          { role: "Manager", entity: "Order", actions: ["create", "read", "update"] },
          { role: "Manager", entity: "Customer", actions: ["read"] },
          { role: "Manager", entity: "Payment", actions: ["read"] },
          { role: "Customer", entity: "Product", actions: ["read"] },
          { role: "Customer", entity: "Category", actions: ["read"] },
          { role: "Customer", entity: "Order", actions: ["create", "read"], condition: "customerId === currentUser.id" },
          { role: "Customer", entity: "Payment", actions: ["read"], condition: "customerId === currentUser.id" }
        ]
      }
    };
  }

  if (domain.includes('asset')) {
    return {
      schema: {
        entities: {
          User: {
            name: "User",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              name: { name: "name", type: "string", required: true },
              email: { name: "email", type: "string", required: true, unique: true },
              role: { name: "role", type: "enum", required: true, enumValues: ["Admin", "Manager", "Employee"], defaultValue: "Employee" }
            }
          },
          Asset: {
            name: "Asset",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              tag: { name: "tag", type: "string", required: true, unique: true },
              name: { name: "name", type: "string", required: true },
              type: { name: "type", type: "enum", required: true, enumValues: ["Laptop", "Phone", "Monitor", "Furniture"], defaultValue: "Laptop" },
              status: { name: "status", type: "enum", required: true, enumValues: ["In-Use", "Repair", "Storage"], defaultValue: "Storage" },
              ownerId: { name: "ownerId", type: "string", required: true, foreignKey: { entity: "User", field: "id" } },
              locationId: { name: "locationId", type: "string", required: true, foreignKey: { entity: "Location", field: "id" } }
            }
          },
          MaintenanceLog: {
            name: "MaintenanceLog",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              assetId: { name: "assetId", type: "string", required: true, foreignKey: { entity: "Asset", field: "id" } },
              logDate: { name: "logDate", type: "date", required: true },
              cost: { name: "cost", type: "number", required: true, defaultValue: 0 },
              description: { name: "description", type: "string", required: true },
              status: { name: "status", type: "enum", required: true, enumValues: ["Scheduled", "In-Progress", "Completed"], defaultValue: "Scheduled" }
            }
          },
          Location: {
            name: "Location",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              name: { name: "name", type: "string", required: true },
              building: { name: "building", type: "string", required: true },
              room: { name: "room", type: "string", required: true }
            }
          },
          Employee: {
            name: "Employee",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              firstName: { name: "firstName", type: "string", required: true },
              lastName: { name: "lastName", type: "string", required: true },
              email: { name: "email", type: "string", required: true, unique: true },
              department: { name: "department", type: "string", required: true }
            }
          }
        }
      },
      permissions: {
        roles: ["Admin", "Manager", "Employee"],
        rules: [
          { role: "Admin", entity: "User", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Asset", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "MaintenanceLog", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Location", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Employee", actions: ["create", "read", "update", "delete"] },
          { role: "Manager", entity: "Asset", actions: ["create", "read", "update"] },
          { role: "Manager", entity: "MaintenanceLog", actions: ["create", "read", "update"] },
          { role: "Manager", entity: "Location", actions: ["create", "read"] },
          { role: "Manager", entity: "Employee", actions: ["read"] },
          { role: "Employee", entity: "Asset", actions: ["read"], condition: "ownerId === currentUser.id" },
          { role: "Employee", entity: "MaintenanceLog", actions: ["read"], condition: "assetId === currentUser.id" }
        ]
      }
    };
  }

  if (domain.includes('crm')) {
    return {
      schema: {
        entities: {
          User: {
            name: "User",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              name: { name: "name", type: "string", required: true },
              email: { name: "email", type: "string", required: true, unique: true },
              role: { name: "role", type: "enum", required: true, enumValues: ["Admin", "Manager", "User"], defaultValue: "User" }
            }
          },
          Contact: {
            name: "Contact",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              firstName: { name: "firstName", type: "string", required: true },
              lastName: { name: "lastName", type: "string", required: true },
              email: { name: "email", type: "string", required: true, unique: true },
              status: { name: "status", type: "enum", required: true, enumValues: ["Lead", "Active", "Inactive"], defaultValue: "Lead" },
              ownerId: { name: "ownerId", type: "string", required: true, foreignKey: { entity: "User", field: "id" } }
            }
          },
          Deal: {
            name: "Deal",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              title: { name: "title", type: "string", required: true },
              value: { name: "value", type: "number", required: true, defaultValue: 0 },
              stage: { name: "stage", type: "enum", required: true, enumValues: ["Pitch", "Negotiation", "Won", "Lost"], defaultValue: "Pitch" },
              ownerId: { name: "ownerId", type: "string", required: true, foreignKey: { entity: "User", field: "id" } }
            }
          },
          Payment: {
            name: "Payment",
            fields: {
              id: { name: "id", type: "string", required: true, primaryKey: true },
              amount: { name: "amount", type: "number", required: true },
              planType: { name: "planType", type: "enum", required: true, enumValues: ["Basic", "Premium"], defaultValue: "Premium" },
              status: { name: "status", type: "enum", required: true, enumValues: ["Pending", "Succeeded", "Failed"], defaultValue: "Succeeded" },
              userId: { name: "userId", type: "string", required: true, foreignKey: { entity: "User", field: "id" } }
            }
          }
        }
      },
      permissions: {
        roles: ["Admin", "Manager", "User"],
        rules: [
          { role: "Admin", entity: "User", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Contact", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Deal", actions: ["create", "read", "update", "delete"] },
          { role: "Admin", entity: "Payment", actions: ["create", "read", "update", "delete"] },
          { role: "Manager", entity: "Contact", actions: ["create", "read", "update", "delete"] },
          { role: "Manager", entity: "Deal", actions: ["create", "read", "update"] },
          { role: "Manager", entity: "Payment", actions: ["read"] },
          { role: "User", entity: "Contact", actions: ["create", "read", "update"], condition: "ownerId === currentUser.id" },
          { role: "User", entity: "Deal", actions: ["create", "read", "update"], condition: "ownerId === currentUser.id" },
          { role: "User", entity: "Payment", actions: ["read"], condition: "userId === currentUser.id" }
        ]
      }
    };
  }

  const entities: string[] = intent.entities || ["User", "Item", "Transaction", "Log"];
  const nonUserEntities: string[] = entities.filter((e: string) => e !== 'User');

  const entitySchemas: Record<string, any> = {};
  entitySchemas["User"] = {
    name: "User",
    fields: {
      id: { name: "id", type: "string", required: true, primaryKey: true },
      name: { name: "name", type: "string", required: true },
      email: { name: "email", type: "string", required: true, unique: true },
      role: { name: "role", type: "enum", required: true, enumValues: ["Admin", "Manager", "User"], defaultValue: "User" }
    }
  };

  nonUserEntities.forEach((e: string) => {
    entitySchemas[e] = {
      name: e,
      fields: {
        id: { name: "id", type: "string", required: true, primaryKey: true },
        name: { name: "name", type: "string", required: true },
        status: { name: "status", type: "enum", required: true, enumValues: ["Active", "Inactive"], defaultValue: "Active" },
        ownerId: { name: "ownerId", type: "string", required: true, foreignKey: { entity: "User", field: "id" } }
      }
    };
  });

  const rules = [
    { role: "Admin", entity: "User", actions: ["create", "read", "update", "delete"] as any },
    ...entities.map((e: string) => ({
      role: "Admin",
      entity: e,
      actions: ["create", "read", "update", "delete"] as any
    })),
    ...nonUserEntities.map((e: string) => ({
      role: "User",
      entity: e,
      actions: ["create", "read", "update"] as any,
      condition: "ownerId === currentUser.id"
    }))
  ];

  return {
    schema: { entities: entitySchemas },
    permissions: {
      roles: ["Admin", "Manager", "User"],
      rules
    }
  };
}

export function getFallbackRepairedAst(ast: AppAST, errors: any[]) {
  return ast;
}
