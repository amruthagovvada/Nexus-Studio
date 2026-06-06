# Nexus Studio

**AI-Native Application Generation Platform**

> Compile natural language application specifications into production-grade system architectures, relational database schemas, security policies, and live interactive runtime environments.

---

## Overview

Nexus Studio is a full-stack AI compiler that transforms an English-language software requirement into a complete, inspectable, and executable application schema. It implements a multi-pass compilation pipeline that mirrors the stages of a traditional software compiler, but operates at the semantic layer of application design.

This project was developed as an internship engineering deliverable, demonstrating the application of AI-driven code generation, AST-based schema modeling, multi-pass semantic validation, and self-correcting repair pipelines.

---

## Core Features

| Feature | Description |
|---|---|
| **Natural Language Compiler** | Submit a plain-English app description and the system generates a full application model |
| **7-Stage Pipeline** | Intent → Assumptions → Architecture → Schema → Dependency Graph → Validation → Self-Repair |
| **Application AST Model** | Visual and raw view of the full Abstract Syntax Tree split across semantic layers |
| **Dependency Graph** | Full-stack graph linking UI components → API routes → Database entities → Permissions |
| **5-Pass Semantic Validator** | Schema Integrity, Referential Integrity, RBAC Bounds, Cross-Layer Sync, Runtime Expressions |
| **Automated Self-Repair** | AI repair loop that detects and fixes AST errors with up to 3 correction cycles |
| **Live Runtime Sandbox** | Interactive application environment running directly from the compiled schema |
| **Artifact Export** | Download SQL schemas, TypeScript types, permission models, API routes, and dependency graphs |
| **Failure Demo Suite** | Simulate 3 error categories and watch the repair engine resolve them |

---

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **UI**: Tailwind CSS + Lucide React icons
- **State Management**: Zustand
- **AI Backend**: OpenAI GPT-4o via Next.js API Routes
- **Schema Validation**: Zod

---

## Getting Started

### Prerequisites

- Node.js 18+
- An OpenAI API key (optional — the system falls back to the static analysis engine)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Production Build

```bash
npm run build
npm start
```

---

## Compiler Pipeline

```
User Prompt
    │
    ▼
┌─────────────────────┐
│  Stage 1: Intent    │  → Extract entities, features, roles, domain
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Stage 2: Assumptions│  → Generate structural and UX heuristics
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│Stage 3: Architecture│  → Map services, components, pages, data flows
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Stage 4: Schema    │  → Generate entities, fields, FK relations, RBAC rules
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│Stage 5: Dep. Graph  │  → Build UI→API→DB→Permission dependency mapping
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│Stage 6: Validation  │  → 5-pass semantic validation
└────────┬────────────┘
         │
    Errors?
    │       │
   Yes      No
    │       │
    ▼       ▼
┌─────────────────────┐     ┌─────────────────────────┐
│ Stage 7: Self-Repair│     │   Compilation Complete   │
└─────────────────────┘     └─────────────────────────┘
```

---

## Artifact Export

After compilation, Nexus Studio generates the following downloadable artifacts:

| File | Description |
|---|---|
| `schema.sql` | Full SQL DDL with table definitions, constraints, and foreign keys |
| `schema.ts` | TypeScript + Zod validation schemas for each entity |
| `permissions.json` | RBAC rules structured as a machine-readable policy document |
| `architecture.json` | Full system architecture: services, pages, components, data flows |
| `dependency-graph.json` | Complete dependency graph with nodes and edges |
| `permissions.ts` | Ready-to-use TypeScript authorization utility |
| `middleware.ts` | Auth middleware template |

---

## Reviewer Evaluation Guide

Follow these steps to evaluate the full product:

1. **Prompt Input** — Select a preset (e.g., "Hospital Management") or write a custom specification
2. **Compile** — Click **Compile App** to run the 7-stage pipeline
3. **Live Sandbox** — Interact with the generated application (CRUD, role switching)
4. **App AST Model** — Inspect the full Abstract Syntax Tree per semantic layer
5. **Dependency Graph** — Click nodes to trace full-stack component dependencies
6. **Validator & Repair** — Review 5 semantic validation passes and any repair cycles
7. **Failure Demo Mode** — Run the 3-scenario self-repair simulation
8. **Artifact Export** — Download all generated code artifacts

---

## Architecture

```
src/
├── app/
│   ├── api/compile/
│   │   ├── intent/         # Stage 1: Intent extraction
│   │   ├── assumptions/    # Stage 2: Heuristic generation
│   │   ├── architecture/   # Stage 3: Architecture mapping
│   │   ├── schema/         # Stage 4: Schema compilation
│   │   └── repair/         # Stage 7: Self-repair engine
│   ├── layout.tsx
│   └── page.tsx
├── compiler/
│   ├── intent.ts           # Intent extraction logic
│   ├── architecture.ts     # Architecture builder
│   ├── schema.ts           # Schema generator
│   ├── dependencyGraph.ts  # Dependency graph builder
│   └── fallbackTemplates.ts # Static analysis fallback engine
├── validators/
│   └── astValidator.ts     # 5-pass semantic validator
├── runtime/
│   ├── compilerStore.ts    # Zustand state machine
│   ├── interpreter.ts      # Virtual runtime DB engine
│   ├── renderer.tsx        # Dynamic sandbox renderer
│   └── exporter.ts         # Artifact code generator
├── schemas/
│   └── compiler.ts         # TypeScript schema definitions
└── components/
    └── CompilerDashboard.tsx  # Main application UI
```

---

## Development Notes

- The system is designed with a **graceful fallback architecture**: if no API key is provided, it uses the built-in Static Analysis Engine to generate schemas from domain-specific templates.
- The **incremental cache system** avoids re-running pipeline stages when the input hasn't changed, enabling fast iteration.
- The **self-repair loop** runs up to 3 correction cycles before halting, ensuring the system doesn't enter an infinite repair state.

---

## License

This project is an academic/internship deliverable. All rights reserved.

---

*Nexus Studio — AI-Native Application Generation Platform*
