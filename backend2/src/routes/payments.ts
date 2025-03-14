import { Router } from 'express';
import { updateInscriptionPayment, getInscription } from '../db/sqlite';
import { checkPaymentToAddress, getPaymentUtxo } from '../services/utils';
import { Inscription, PaymentStatusBody } from '../types';

const router = Router();

// POST /payments/status
// was /payment-status:

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
 *             type: object
 *             required:
 *               - address
 *               - required_amount
 *               - sender_address
 *               - id
 *             properties:
 *               address:
 *                 type: string
 *               required_amount:
 *                 type: string
 *               sender_address:
 *                 type: string
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentStatus'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/status', async (req, res) => {
  try {
    const { address, required_amount, sender_address, id } = req.body as PaymentStatusBody;

    // Validate input
    const validation = await validatePaymentRequest(address, required_amount, sender_address, id);

    if (validation.error) return res.status(400).json(validation.error);

    const { inscription } = validation;

    // Check payment status
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
        ...formatPaymentResponse(inscription),
        // error: 'Payment check failed',
        is_paid: false,
        error_details: paymentStatus.error,
      });
    }

    res.json({
      ...formatPaymentResponse(inscription),
      is_paid: paymentStatus.result,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Payment check failed' });
  }
});

// POST /payments/utxo
// was /payment-utxo

/**
 * @swagger
 * /payments/utxo:
 *   post:
 *     tags: [Payments]
 *     summary: Get payment UTXO details
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - required_amount
 *               - sender_address
 *               - id
 *             properties:
 *               address:
 *                 type: string
 *               required_amount:
 *                 type: string
 *               sender_address:
 *                 type: string
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: UTXO details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paymentUtxo:
 *                   $ref: '#/components/schemas/PaymentUtxo'
 *                 id:
 *                   type: integer
 *                 address:
 *                   type: string
 *                 amount:
 *                   type: integer
 *                 sender_address:
 *                   type: string
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/utxo', async (req, res) => {
  try {
    const { address, required_amount, sender_address, id } = req.body as PaymentStatusBody;

    // Validate input
    const validation = await validatePaymentRequest(address, required_amount, sender_address, id);

    if (validation.error) return res.status(400).json(validation.error);

    const { inscription } = validation;

    // Get UTXO details
    const utxoResult = await getPaymentUtxo(inscription.id, inscription.address, inscription.required_amount);

    if (!utxoResult.success) {
      return res.json({
        paymentUtxo: null,
        id: inscription.id,
        error_details: utxoResult.error,
      });
    }

    res.json({
      ...formatPaymentResponse(inscription),
      payment_utxo: utxoResult.result,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Payment utxo check failed' });
  }
});

// Validation helper
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

  if (inscription.required_amount !== Number(amount)) {
    return { error: { error: 'Amount mismatch' } };
  }

  if (inscription.address !== address.trim()) {
    return { error: { error: 'Address mismatch' } };
  }

  return { inscription };
}

// Response formatting
function formatPaymentResponse(inscription: any) {
  return {
    id: inscription.id,
    address: inscription.address,
    amount: inscription.required_amount,
    sender_address: inscription.sender_address,
    status: inscription.status,
    // created_at: inscription.created_at,
  };
}

export default router;
