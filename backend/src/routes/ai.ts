import { Router, Request, Response } from 'express';
import { executePhase, runWorkflow } from '../services/ai-engine';

const router = Router();

router.post('/phases/:phase', async (req: Request, res: Response) => {
  const phaseNumber = parseInt(req.params.phase, 10);
  if (phaseNumber < 1 || phaseNumber > 4) {
    res.status(400).json({ error: 'Phase must be between 1 and 4' });
    return;
  }

  try {
    const result = await executePhase(phaseNumber, req.body);
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
