import { Router } from 'express';
import { getInscription, updateInscription } from '../db/sqlite';
import { broadcastTx } from '../services/utils';
import { BroadcastRevealTxBody } from '../types';
import { Inscription } from '../types';

const router = Router();

/**
 * @swagger
 * /transactions/broadcast-reveal:
 *   post:
 *     tags: [Transactions]
 *     summary: Broadcast reveal transaction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - txHex
 *               - id
 *             properties:
 *               txHex:
 *                 type: string
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction broadcast result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 txId:
 *                   type: string
 *                 id:
 *                   type: integer
 *       400:
 *         description: Missing required fields or inscription not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/broadcast-reveal', async (req, res) => {
  try {
    const { txHex, id } = req.body as BroadcastRevealTxBody;

    if (!txHex || !id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const inscriptionId = parseInt(id);

    if (isNaN(inscriptionId)) {
      return res.status(400).json({ error: 'Invalid inscription ID format' });
    }

    const inscription = getInscription.get(inscriptionId) as Inscription | undefined;

    if (!inscription) {
      return res.status(400).json({ error: 'Inscription not found' });
    }

    // Broadcast transaction
    const broadcastResult = await broadcastTx(inscriptionId, txHex, inscription.reveal_tx_hex);

    if (!broadcastResult.success) {
      return res.status(400).json({
        tx_id: null,
        inscription_id: inscriptionId,
        error_details: broadcastResult.error,
      });
    }

    updateInscription.run(inscription.commit_tx_id!, inscription.reveal_tx_hex!, 'completed', inscriptionId);

    res.json({
      tx_id: broadcastResult.result,
      id: inscriptionId,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Broadcast failed' });
  }
});

export default router;
