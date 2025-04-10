import { NextFunction, Router, Request, Response } from 'express';
import fs from 'fs';
import { upload } from '../middleware/upload';
import { createInscription } from '../createInscription';
import { getPublicKeyFromWif, getPrivateKey } from '../utils/walletUtils';
import { getCurrentBlockHeight } from '../services/utils';
import { appdb } from '../db';
import {
  Inscription,
  CreateRevealPayload,
  CreateRevealResponse,
  CreateCommitPayload,
  InscriptionResponse,
  ApiErrorResponse,
  CreateCommitResponse,
  type ErrorDetails,
} from '../types';

import { createWalletAndAddressDescriptor } from '../services/utils';

const router = Router();

const {
  deletePendingInscriptionBySender,
  insertInscription,
  getInscription,
  getInscriptionBySender,
  updateInscription,
} = appdb;

function getBaseResponse(inscription: any, id: number | bigint, recipient: string, sender: string) {
  return {
    inscription_id: id,
    file_size_in_bytes: inscription.fileSize,
    payment_address: inscription.address,
    recipient_address: recipient,
    sender_address: sender,
    required_amount_in_sats: inscription.requiredAmount,
    commmit_creation_successful: true,
  };
}

function formatInscriptionResponse(inscription: Inscription) {
  return {
    id: inscription.id,
    payment_address: inscription.address,
    required_amount_in_sats: inscription.required_amount,
    file_size_in_bytes: inscription.file_size,
    status: inscription.status,
    commit_tx_id: inscription.commit_tx_id,
    reveal_tx_hex: inscription.reveal_tx_hex,
    sender_address: inscription.sender_address,
    recipient_address: inscription.recipient_address,
    created_at: inscription.created_at,
  };
}

/**
 * @swagger
 * /inscriptions/create-commit:
 *   post:
 *     tags: [Inscriptions]
 *     summary: Create a new commit transaction for inscription
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: The file to inscribe
 *         required: true
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               recipient_address:
 *                 type: string
 *               fee_rate:
 *                 type: string
 *               sender_address:
 *                 type: string
 *             required:
 *               - recipient_address
 *               - fee_rate
 *               - sender_address
 *     responses:
 *       200:
 *         description: Commit created successfully
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/CreateCommitResponse'
 *                 - type: object
 *                   properties:
 *                     inscription_id: { type: 'integer', format: 'int64' }
 *                     payment_address: { type: 'string' }
 *                     error_details: { $ref: '#/components/schemas/ErrorDetails' }
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/create-commit',
  upload.single('file'),
  async (
    req: Request,
    res: Response<
      | CreateCommitResponse
      | ApiErrorResponse
      | { inscription_id: number | bigint; payment_address: string; error_details: ErrorDetails }
    >,
  ) => {
    try {
      const {
        recipient_address: recipientAddress,
        fee_rate: feeRate,
        sender_address: senderAddress,
      } = req.body as CreateCommitPayload;

      if (!req.file || !recipientAddress || !feeRate) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      await deletePendingInscriptionBySender(senderAddress);

      const fileBuffer = fs.readFileSync(req.file.path);
      const inscription = createInscription(fileBuffer, parseFloat(feeRate), recipientAddress);

      const createdBlock = await getCurrentBlockHeight();

      const result = await insertInscription({
        tempPrivateKey: inscription.tempPrivateKey,
        address: inscription.address,
        requiredAmount: inscription.requiredAmount,
        fileSize: inscription.fileSize,
        recipientAddress,
        senderAddress,
        feeRate,
        createdBlock,
      });

      const lastInsertRowid = result.id;

      const broadcastResult = await createWalletAndAddressDescriptor(lastInsertRowid, inscription.address);

      if (!broadcastResult.success) {
        return res.json({
          inscription_id: lastInsertRowid,
          payment_address: inscription.address,
          error_details: broadcastResult.error,
        });
      }

      res.json({
        ...getBaseResponse(inscription, lastInsertRowid, recipientAddress, senderAddress),
      });
    } catch (error) {
      console.error('Error creating commit:', error);
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Wallet create or inscription create error error' });
    } finally {
      if (req.file?.path) {
        fs.unlinkSync(req.file.path);
      }
    }
  },
);

/**
 * @swagger
 * /inscriptions/sender/{sender_address}:
 *   get:
 *     tags: [Inscriptions]
 *     summary: Get all inscriptions for a sender address
 *     parameters:
 *       - in: path
 *         name: sender_address
 *         schema:
 *           type: string
 *         required: true
 *         description: Bitcoin sender address
 *     responses:
 *       200:
 *         description: List of inscriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/InscriptionResponse'
 *       400:
 *         description: Error retrieving inscriptions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/sender/:sender_address',
  async (
    req: Request<{ sender_address: string }>,
    res: Response<Array<InscriptionResponse> | ApiErrorResponse>,
    next: NextFunction,
  ) => {
    try {
      const senderAddress = req.params.sender_address;
      const inscriptions = await getInscriptionBySender(senderAddress);

      if (inscriptions.length === 0) {
        return res.json([]);
      }

      res.json(inscriptions.map(formatInscriptionResponse));
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /inscriptions/{id}:
 *   get:
 *     tags: [Inscriptions]
 *     summary: Get inscription details by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Numeric ID of the inscription
 *     responses:
 *       200:
 *         description: Inscription details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InscriptionResponse'
 *       400:
 *         description: Invalid ID format or inscription not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/:id',
  async (req: Request<{ id: string }>, res: Response<InscriptionResponse | ApiErrorResponse>, next: NextFunction) => {
    try {
      const inscriptionId = parseInt(req.params.id);

      if (isNaN(inscriptionId)) {
        return res.status(400).json({ error: 'Invalid inscription ID' });
      }

      const inscription = await getInscription(inscriptionId);

      if (!inscription) {
        return res.status(400).json({ error: 'Inscription not found' });
      }

      res.json(formatInscriptionResponse(inscription as Inscription));
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /inscriptions/create-reveal:
 *   post:
 *     tags: [Inscriptions]
 *     summary: Create reveal transaction for an inscription
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: The original inscription file
 *         required: true
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inscription_id:
 *                 type: string
 *               commit_tx_id:
 *                 type: string
 *               vout:
 *                 type: string
 *               amount:
 *                 type: string
 *             required:
 *               - inscription_id
 *               - commit_tx_id
 *               - vout
 *               - amount
 *     responses:
 *       200:
 *         description: Reveal transaction created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateRevealResponse'
 *       400:
 *         description: Invalid input or inscription not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/create-reveal',
  upload.single('file'),
  async (req: Request, res: Response<CreateRevealResponse | ApiErrorResponse>) => {
    try {
      const { inscription_id: insId, commit_tx_id: commitTxId, vout, amount } = req.body as CreateRevealPayload;

      if (!req.file || !insId || !commitTxId || vout === undefined || !amount) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const inscriptionId = parseInt(insId);

      if (isNaN(inscriptionId)) {
        return res.status(400).json({ error: 'Invalid inscription ID' });
      }

      const inscription = await getInscription(inscriptionId);

      if (!inscription) {
        return res.status(400).json({ error: 'Inscription not found' });
      }

      const fileBuffer = fs.readFileSync(req.file.path);

      const revealInscription = createInscription(
        fileBuffer,
        inscription.fee_rate,
        inscription.recipient_address,
        inscription.temp_private_key,
      );

      const revealTx = revealInscription.createRevealTx(commitTxId, parseInt(vout), parseInt(amount));

      await updateInscription({
        id: Number(inscriptionId),
        commitTxId: commitTxId.trim(),
        revealTxHex: revealTx,
        status: 'reveal_ready',
      });

      const privKeyObj = getPrivateKey(inscription.temp_private_key);
      const pubkey = getPublicKeyFromWif(privKeyObj.wif);

      res.json({
        inscription_id: inscription.id + '',
        commit_tx_id: commitTxId.trim(),
        debug: {
          payment_address: revealInscription.address,
          payment_pubkey: pubkey.hex,
          required_amount_in_sats: inscription.required_amount + '',
          given_utxo_amount_in_sats: amount,
          sender_address: inscription.sender_address,
          recipient_address: inscription.recipient_address,
          fees: `${BigInt(parseInt(amount))}`,
        },
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Error creating reveal transaction' });
    } finally {
      if (req.file?.path) {
        fs.unlinkSync(req.file.path);
      }
    }
  },
);

export default router;
