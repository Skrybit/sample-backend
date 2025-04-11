import { Router, Request, Response } from 'express';
import { broadcastTx } from '../services/utils';
import { getCurrentBlockHeight } from '../services/utils';
import { appdb } from '../db';
import { ErrorDetails, ApiErrorResponse, BroadcastRevealResponse, BroadcastRevealTxBody } from '../types';

// const { getInscription, updateInscriptionStatus, updateInscriptionRevealTxId } = appdb;

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
      const { inscription_id: id } = req.body as BroadcastRevealTxBody;

      if (!id) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const inscriptionId = parseInt(id);

      if (isNaN(inscriptionId)) {
        return res.status(400).json({ error: 'Invalid inscription ID format' });
      }

      const inscription = await appdb.getInscription(inscriptionId);

      console.log('OUR inscription', inscription);

      if (!inscription) {
        return res.status(400).json({ error: 'Inscription not found' });
      }

      const revealTxHex = await appdb.getTransactionsByInscription(inscriptionId);
      console.log('revealTxHex!!', revealTxHex);

      // if (!inscription.reveal_tx_hex) {
      if (!revealTxHex) {
        return res.status(400).json({ error: 'Inscription has no reveal_tx_hex' });
      }

      const broadcastResult = await broadcastTx(inscriptionId, revealTxHex);

      if (!broadcastResult.success) {
        return res.status(400).json({
          reveal_tx_id: null,
          inscription_id: inscriptionId + '',
          error_details: broadcastResult.error,
        });
      }

      // await updateInscriptionStatus({
      //   id: inscriptionId,
      //   status: 'completed',
      // });

      await appdb.updateInscriptionStatus({
        id: inscriptionId,
        status: 'completed',
      });

      // await updateInscriptionRevealTxId({
      //   id: inscriptionId,
      //   revealTxId: broadcastResult.result,
      // });

      const currentBlock = await getCurrentBlockHeight();

      await appdb.insertTransaction({
        inscriptionId,
        type: 'reveal',
        txId: broadcastResult.result,
        txHex: '',
        blockNumber: currentBlock,
      });

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
