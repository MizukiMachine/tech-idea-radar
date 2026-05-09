import { Router, Request, Response } from 'express';
import { Phase } from 'ai-engine';
import { executePhase, runWorkflow } from '../services/ai-engine';

const VALID_PHASES = new Set<number>([Phase.SelfAnalysis, Phase.MarketResearch, Phase.Persona, Phase.ProductConcept]);

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
  try {
    const result = await runWorkflow(req.body);
    res.json({ status: 'completed', result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ status: 'error', error: message });
  }
});

export default router;
