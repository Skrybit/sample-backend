import express, { Request, Response, NextFunction } from 'express';

const router = express.Router();

router.get('/inscription/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid inscription ID' });
    }

    const row = getInscription.get(id) as Inscription | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Inscription not found' });
    }

    return res.json({
      id: row.id,
      address: row.address,
      required_amount: row.required_amount,
      status: row.status,
      commit_tx_id: row.commit_tx_id,
      created_at: row.created_at,
    });
  } catch (error) {
    next(error);
  }
});

// Export router
export default router;
