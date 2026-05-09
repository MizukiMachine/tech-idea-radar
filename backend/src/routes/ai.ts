import { Router, Request, Response } from 'express';
import { Phase } from 'ai-engine';
import { executePhase, runWorkflow } from '../services/ai-engine';

const VALID_PHASES = new Set<number>([Phase.SelfAnalysis, Phase.MarketResearch, Phase.Persona, Phase.ProductConcept]);

const PHASE_NAMES: Record<number, string> = {
  [Phase.SelfAnalysis]: 'SelfAnalysis',
  [Phase.MarketResearch]: 'MarketResearch',
  [Phase.Persona]: 'Persona',
  [Phase.ProductConcept]: 'ProductConcept',
};

function sseSend(res: Response, event: string, data: unknown, disconnected: boolean): boolean {
  if (disconnected) return false;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return res.write(payload);
}

const router = Router();

router.post('/phases/:phase', async (req: Request, res: Response) => {
  const phaseNumber = parseInt(req.params.phase, 10);
  if (!VALID_PHASES.has(phaseNumber)) {
    res.status(400).json({ error: 'Phase must be one of: 1 (SelfAnalysis), 2 (MarketResearch), 3 (Persona), 4 (ProductConcept)' });
    return;
  }

  try {
    const result = await executePhase(phaseNumber as Phase, req.body);
    res.json({ phase: phaseNumber, status: 'completed', output: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ phase: phaseNumber, status: 'error', error: message });
  }
});

router.post('/workflow', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let disconnected = false;
  req.on('close', () => { disconnected = true; });

  try {
    const result = await runWorkflow(req.body, (phaseResult) => {
      sseSend(res, 'phase_complete', {
        phase: phaseResult.phase,
        name: PHASE_NAMES[phaseResult.phase],
        output: phaseResult.output,
      }, disconnected);
    });

    sseSend(res, 'workflow_complete', result, disconnected);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sseSend(res, 'error', { error: message }, disconnected);
  }

  if (!disconnected) res.end();
});

export default router;
