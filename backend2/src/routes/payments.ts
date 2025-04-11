import { Router } from 'express';
import { appdb } from '../db';
import { getCurrentBlockHeight, checkPaymentToAddress } from '../services/utils';
import { ErrorDetails, ApiErrorResponse, PaymentStatusBody, InscriptionPayment } from '../types';
import { Request, Response } from 'express';

const router = Router();

async function validatePaymentRequest(address: string, amount: string, sender: string, id: string) {
  const errors = [];
  if (!address) errors.push('address is required');
  if (!amount) errors.push('required_amount is required');
  if (!sender) errors.push('sender_address is required');
  if (!id) errors.push('id is required');

  if (errors.length > 0) {
    return { error: { error: 'Missing required fields', details: errors } };
  }

  const inscriptionId = parseInt(id);

  if (isNaN(inscriptionId)) {
    return { error: { error: 'Invalid inscription ID format' } };
  }

  const inscription = await appdb.getInscription(inscriptionId);
  // console.log('OUR inscription ', inscription);

  if (!inscription) {
    return { error: { error: 'Inscription not found' } };
  }

  if (inscription.sender_address !== sender.trim()) {
    return { error: { error: 'Sender address mismatch' } };
  }

  if (inscription.address !== address.trim()) {
    return { error: { error: 'Address mismatch' } };
  }

  return { inscription };
}

function formatPaymentResponse(inscription: any) {
  return {
    id: inscription.id,
    payment_address: inscription.address,
    required_amount_in_sats: inscription.required_amount,
    sender_address: inscription.sender_address,
    status: inscription.status,
  };
}

/**
 * @swagger
 * /payments/status:
 *   post:
 *     tags: [Payments]
 *     summary: Check payment status for an inscription
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentStatusBody'
 *     responses:
 *       200:
 *         description: Payment status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/InscriptionPayment'
 *                 - type: object
 *                   properties:
 *                     is_paid: { type: 'boolean' }
 *                     error_details: { $ref: '#/components/schemas/ErrorDetails' }
 *                     payment_utxo: { type: 'null' }
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/status',
  async (
    req: Request,
    res: Response<
      InscriptionPayment | ApiErrorResponse | { is_paid: boolean; payment_utxo: null; error_details: ErrorDetails }
    >,
  ) => {
    try {
      const { payment_address, required_amount_in_sats, sender_address, id } = req.body as PaymentStatusBody;

      const validation = await validatePaymentRequest(payment_address, required_amount_in_sats, sender_address, id);

      if (validation.error) return res.status(400).json(validation.error);

      const { inscription } = validation;

      // console.log('aaa inscription', inscription);
      const currentStatus = await appdb.getCurrentStatus(inscription.id);
      // console.log('aaa currentStatus', currentStatus);

      const currentBlock = await getCurrentBlockHeight();

      const paymentStatus = await checkPaymentToAddress(
        inscription.id,
        // inscription.status,
        currentStatus,
        inscription.address,
        inscription.required_amount,
        inscription.last_checked_block,
        currentBlock,
      );

      if (!paymentStatus.success) {
        return res.json({
          is_paid: false,
          error_details: paymentStatus.error,
          payment_utxo: null,
        });
      }

      const isPaid = paymentStatus.result;

      if (isPaid) {
        const paymentUtxo = paymentStatus.utxo;

        return res.json({
          ...formatPaymentResponse(inscription),
          is_paid: true,
          payment_utxo: paymentUtxo,
        });
      }

      res.json({
        ...formatPaymentResponse(inscription),
        is_paid: paymentStatus.result,
        payment_utxo: null,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Payment check failed' });
    }
  },
);

export default router;
