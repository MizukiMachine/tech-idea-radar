# AI Engine

TypeScript-based AI Engine for Builder Agent Chain. LLM-powered agent pipeline that analyzes engineer skills and proposes product ideas.

## Architecture

AI Engine is a library imported by the Express backend. It provides 3 agents orchestrated in a sequential pipeline.

## Agents

| Step | Agent | Description |
|------|-------|-------------|
| 1 | SelfAnalysisAgent | SWOT analysis, career/skills/achievements evaluation |
| 2 | MarketResearchAgent | TAM/SAM/SOM, competitor analysis, blue ocean identification |
| 3 | IdeaProposalAgent | Persona creation, product ideas, MVP scoping, revenue model |
| - | EntrepreneurAgent | Orchestrator: chains Step 1 -> 2 -> 3 |

## Setup

```bash
npm install
```

## Environment Variables

Copy `.env.example` and set your API key:

```
ZAI_API_KEY=your-api-key-here
LLM_MODEL=glm-5
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

## Backend API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/ai/steps/:step` | POST | Execute a single step (1-3) |
| `POST /api/ai/workflow` | POST | Run full 3-step pipeline with SSE streaming |
