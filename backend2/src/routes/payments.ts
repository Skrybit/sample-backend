import { Router } from 'express';
import { updateInscriptionPayment, getInscription } from '../db/sqlite';
import { checkPaymentToAddress, getPaymentUtxo } from '../services/utils';
import { ErrorDetails, ApiErrorResponse, Inscription, PaymentStatusBody, InscriptionPayment } from '../types';
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

  const inscription = (await getInscription.get(inscriptionId)) as Inscription | undefined;

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
    // payment_utxo: utxo || null,
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

      const paymentStatus = await checkPaymentToAddress(
        inscription.id,
        inscription.status,
        inscription.created_at,
        inscription.address,
        inscription.required_amount,
        (status: string, id: number) => updateInscriptionPayment.run(status, id),
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
        const utxoResult = await getPaymentUtxo(inscription.id, inscription.address, inscription.required_amount);
        console.log('utxoResult isPaid. utxoResult is - ', utxoResult);

        if (!utxoResult.success) {
          return res.json({
            is_paid: true,
            error_details: utxoResult.error,
            payment_utxo: null,
          });
        }

        return res.json({
          ...formatPaymentResponse(inscription),
          is_paid: true,
          payment_utxo: utxoResult.result,
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
