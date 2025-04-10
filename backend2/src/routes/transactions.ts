import { Router, Request, Response } from 'express';
// import { getInscription, updateInscriptionPayment, updateInscriptionRevealTxId } from '../db/sqlite';
import { getInscription, updateInscriptionPayment, updateInscriptionRevealTxId } from '../db/pg';
import { broadcastTx } from '../services/utils';
import { ErrorDetails, ApiErrorResponse, BroadcastRevealResponse, BroadcastRevealTxBody } from '../types';
// import { Inscription } from '../types';

const router = Router();

/**
 * @swagger
 * /transactions/broadcast-reveal:
 *   post:
 *     tags: [Transactions]
 *     summary: Broadcast a reveal transaction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BroadcastRevealTxBody'
 *     responses:
 *       200:
 *         description: Transaction broadcast result
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/BroadcastRevealResponse'
 *                 - type: object
 *                   properties:
 *                     inscription_id:
 *                       type: string
 *                     reveal_tx_id:
 *                       type: 'null'
 *                     error_details:
 *                       $ref: '#/components/schemas/ErrorDetails'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/broadcast-reveal',
  async (
    req: Request,
    res: Response<
      | BroadcastRevealResponse
      | ApiErrorResponse
      | {
          inscription_id: string;
          reveal_tx_id: null;
          error_details: ErrorDetails;
        }
    >,
  ) => {
    try {
      // const { reveal_tx_hex: txHex, inscription_id: id } = req.body as BroadcastRevealTxBody;
      const { inscription_id: id } = req.body as BroadcastRevealTxBody;

      // if (!txHex || !id) {
      if (!id) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const inscriptionId = parseInt(id);

      if (isNaN(inscriptionId)) {
        return res.status(400).json({ error: 'Invalid inscription ID format' });
      }

      // const inscription = getInscription.get(inscriptionId) as Inscription | undefined;
      const inscription = await getInscription(inscriptionId);

      if (!inscription) {
        return res.status(400).json({ error: 'Inscription not found' });
      }

      if (!inscription.reveal_tx_hex) {
        return res.status(400).json({ error: 'Inscription has no reveal_tx_hex' });
      }

      const broadcastResult = await broadcastTx(inscriptionId, inscription.reveal_tx_hex);

      if (!broadcastResult.success) {
        return res.status(400).json({
          reveal_tx_id: null,
          inscription_id: inscriptionId + '',
          error_details: broadcastResult.error,
        });
      }

      // updateInscriptionPayment.run('completed', inscriptionId);
      await updateInscriptionPayment(inscriptionId, 'completed');

      // updateInscriptionRevealTxId.run(broadcastResult.result, inscriptionId);
      await updateInscriptionRevealTxId(inscriptionId, broadcastResult.result);

      res.json({
        reveal_tx_id: broadcastResult.result,
        inscription_id: inscriptionId + '',
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Broadcast failed' });
    }
  },
);

export default router;
