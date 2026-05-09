# Builder Agent Chain

## Overview
Builder Agent Chain is an orchestration platform that automates core entrepreneurship workflows. It helps founders validate ideas, conduct market research, design go-to-market strategies, and manage ongoing venture operations through an integrated AI toolchain.

## Key Capabilities
- Automates venture hypothesis discovery with guided questionnaires and AI summarization.
- Executes market research pipelines and aggregates third-party intelligence into actionable reports.
- Generates business plans, financial projections, and pitch materials tailored to target segments.
- Orchestrates experimentation, tracks KPIs, and provides continuous improvement recommendations.
- Integrates with human operators and downstream tools (Cursor, Roo, CI) for collaborative delivery.

## Architecture Snapshot
- **Frontend**: React single-page application delivering dashboards and configuration flows.
- **Backend**: Node.js (Express) REST API that validates inputs, persists venture data, and streams progress updates.
- **AI Engine**: TypeScript service using ZAI GLM-5 API (OpenAI-compatible SDK) for multi-agent business analysis workflows.
- **Data Layer**: In-memory processing with structured JSON handoffs between phases. Database integration planned for future iterations.
- **Infrastructure**: Docker and Kubernetes deployment planned for future epics.

Refer to `docs/architecture.md` for a deeper discussion of service boundaries and data flow.

## Getting Started
### Prerequisites
- Node.js 18+ and npm for frontend/backend/AI engine work.
- ZAI API key for GLM-5 model access.

### Setup Steps
1. Clone the repository and create a feature branch following the `feat/{feature-name}` convention.
2. Install shared tooling dependencies from the repo root.
   ```bash
   npm install
   ```
3. Populate environment variables for local development (`.env` templates will be introduced alongside implementation work).
4. Run unit and integration tests relevant to your changes before opening a pull request (placeholder scripts are provided until runtime code lands).
5. Review `logs/` entries (prompt chains, tool invocations, handoff summaries) to understand in-flight work before picking up a new story.
6. Consult `CONTRIBUTING.md` for evolving workflows and tooling guidelines.

## Repository Layout
```
builder-agent-chain/
├── .editorconfig          # Repository-wide formatting defaults
├── .gitignore             # Ignore rules for Node/Python/tooling artifacts
├── .prettierrc.json       # Prettier formatting preferences
├── AGENTS.md              # Operational playbook for Codex and companion agents
├── CONTRIBUTING.md        # Onboarding and workflow guide for collaborators
├── README.md              # Project overview (this file)
├── ai-engine/             # TypeScript AI service (GLM-5 multi-agent orchestration)
├── backend/               # Node.js API service (Story S-002 will bootstrap Express runtime)
├── docs/                  # Architecture, workflow, and integration references
│   ├── architecture.md
│   ├── codex/
│   │   └── integration_guide.md
│   ├── integration_mapping.md
│   └── ldd/
│       └── workflow.md
├── frontend/              # React application (Story S-003 will scaffold SPA entry point)
├── infrastructure/        # Infrastructure-as-code assets (future epics add Terraform/Kubernetes)
├── logs/                  # LDD prompt chain, tool invocation, and handoff artifacts
├── eslint.config.js       # Shared ESLint flat config (extend inside service packages)
└── package.json           # npm workspace definition and shared scripts
```

## Workspace Tooling
- `.editorconfig` standardizes indentation, line endings, and trailing whitespace across languages.
- `.gitignore` omits Node, Python, and IDE artifacts while allowing `logs/` to be tracked.
- `package.json` configures npm workspaces for `frontend`, `backend`, and `ai-engine`, and exposes placeholder `lint`, `test`, and `format` scripts until runtime scaffolds are delivered.
- `eslint.config.js` and `.prettierrc.json` define baseline linting/formatting defaults that service-level packages will extend in subsequent stories.

## Development Workflow
This project follows Log-Driven Development (LDD). Each change should capture:
- Intent, plan, implementation, verification, and handoff logs (see `docs/ldd/workflow.md`).
- Strict adherence to the response template and logging requirements defined in `AGENTS.md`.
- Synchronization with upstream plans before editing implementation code.

## Roadmap (Epic E-001: Platform Foundation)

| Story | Description | Status |
|-------|-------------|--------|
| S-001 | Define Monorepo Structure and Tooling | Completed |
| S-002 | Scaffold Backend API Service (Express + Jest) | Completed |
| S-003 | Scaffold Frontend React Application (Vite + Vitest) | Completed |
| S-004 | Bootstrap AI Engine Service (TypeScript + GLM-5) | Completed |
| S-005 | Configure CI and Containerization Baseline | Proposed |

- Architecture and security designs are approved.
- Next actions: S-005 (CI/Docker).

## Reference Materials
- `AGENTS.md`: Agent operating manual and communication standards.
- `docs/architecture.md`: High-level system design.
- `docs/integration_mapping.md`: Toolchain roles and external services.
- `docs/codex/integration_guide.md`: Day-to-day guidance for Codex integration.
- `docs/codex/github_mcp_server.md`: Setup notes for wiring Codex to the GitHub MCP server tool.
- `docs/ldd/workflow.md`: Details on maintaining the LDD lifecycle.

## License
License information has not been finalized. Additions will be documented once available.
