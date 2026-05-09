# AI Engine

TypeScript-based AI Engine for Builder Agent Chain. Uses ZAI GLM-5 API (OpenAI-compatible) for LLM-powered business planning agent workflows.

## Architecture

AI Engine is implemented as a library imported by the Express backend (not a separate service). It provides 5 business planning agents orchestrated in a 4-phase pipeline.

## Agents

| Phase | Agent | Description |
|-------|-------|-------------|
| 1 | SelfAnalysisAgent | SWOT analysis, career/skills/achievements evaluation |
| 2 | MarketResearchAgent | TAM/SAM/SOM, 20+ competitor analysis, blue ocean identification |
| 3 | PersonaAgent | 3-5 target personas, customer journey maps |
| 4 | ProductConceptAgent | USP, business model canvas, revenue model |
| - | EntrepreneurAgent | Orchestrator: chains Phase 1→2→3→4 |

## Setup

```bash
# Install dependencies (from repo root)
npm install

# Type check
cd ai-engine && npx tsc --noEmit
```

## Environment Variables

Copy `.env.example` and set your ZAI API key:

```
ZAI_API_KEY=your-api-key-here
LLM_MODEL=glm-5
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

## Backend API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/ai/phases/:phase` | POST | Execute a single phase (1-4) |
| `POST /api/ai/workflow` | POST | Run full 4-phase pipeline |

## Directory Structure

```
src/
  agents/          # Agent implementations (BaseAgent + 5 concrete agents)
  prompts/         # System prompts and user prompt templates
  services/        # LLM client, prompt builder, response parser
  types/           # TypeScript interfaces for each agent's I/O
  config/          # Phase enum, constants
  index.ts         # Public API exports
```
