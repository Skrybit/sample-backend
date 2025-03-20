import { NextFunction, Router, Request, Response } from 'express';
import { upload } from '../middleware/upload';
import { createInscription } from '../createInscription';
import { DUST_LIMIT } from '../config/network';
import { getPublicKeyFromWif, getPrivateKey } from '../utils/walletUtils';
import { getUTCTimestampInSec, timestampToDateString } from '../utils/dateUtils';
import { insertInscription, getInscription, getInscriptionBySender, updateInscription } from '../db/sqlite';
import {
  Inscription,
  CreateRevealPayload,
  CreateRevealResponse,
  CreateCommitPayload,
  InscriptionResponse,
  ApiErrorResponse,
  CreateCommitResponse,
} from '../types';

import fs from 'fs';

import { createWalletAndAddressDescriptor } from '../services/utils';
import { ErrorDetails } from '../services/rpcApi';

const router = Router();

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
 *    post:
 *     tags: [Inscriptions]
 *     summary: Create a new commit transaction for inscription
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               recipientAddress:
 *                 type: string
 *               feeRate:
 *                 type: string
 *               senderAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Commit transaction created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inscription_id:
 *                   type: integer
 *                 file_size_in_bytes:
 *                   type: integer
 *                 payment_address:
 *                   type: string
 *                 recipient_address:
 *                   type: string
 *                 sender_address:
 *                   type: string
 *                 required_amount_in_sats:
 *                   type: integer
 *                 commmit_creation_successful:
 *                   type: boolean
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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

      const fileBuffer = fs.readFileSync(req.file.path);
      const inscription = createInscription(fileBuffer, parseFloat(feeRate), recipientAddress);

      const timestamp = getUTCTimestampInSec();

      const createdAtUtc = timestampToDateString(timestamp);

      const result = insertInscription.run(
        inscription.tempPrivateKey,
        inscription.address,
        inscription.requiredAmount,
        inscription.fileSize,
        recipientAddress,
        senderAddress,
        feeRate,
        createdAtUtc,
      );

      const lastInsertRowid = result.lastInsertRowid;

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
 *     summary: Get all inscriptions by sender address
 *     parameters:
 *       - in: path
 *         name: sender_address
 *         schema:
 *           type: string
 *         required: true
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
 *         description: Inscriptions not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
      const inscriptions = getInscriptionBySender.all(senderAddress) as Inscription[];

      if (inscriptions.length === 0) {
        return res.status(400).json({ error: 'No inscriptions found for this sender' });
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
 *           type: integer
 *         required: true
 *     responses:
 *       200:
 *         description: Inscription details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InscriptionResponse'
 *       400:
 *         description: Inscription not found or Invalid inscription ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/:id',
  async (req: Request<{ id: string }>, res: Response<InscriptionResponse | ApiErrorResponse>, next: NextFunction) => {
    try {
      const inscriptionId = parseInt(req.params.id);

      if (isNaN(inscriptionId)) {
        return res.status(400).json({ error: 'Invalid inscription ID' });
      }

      const inscription = await getInscription.get(inscriptionId);

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
l* /inscriptions/create-reveal:
 *    post:
 *     tags: [Inscriptions]
 *     summary: Create a new commit transaction for inscription
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               recipientAddress:
 *                 type: string
 *               feeRate:
 *                 type: string
 *               senderAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reveal transaction created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revealTxHex:
 *                   type: string
 *                 debug:
 *                   type: object
 *                   properties:
 *                     generatedAddress:
 *                       type: string
 *                     pubkey:
 *                       type: string
 *                     amount:
 *                       type: integer
 *                     fees:
 *                       type: integer
 *       400:
 *         description: Missing required parameter or inscription is not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/create-reveal',
  upload.single('file'),
  async (req: Request, res: Response<CreateRevealResponse | ApiErrorResponse>) => {
    try {
      const { inscription_id: inscriptionId, commit_tx_id: commitTxId, vout, amount } = req.body as CreateRevealPayload;

      if (!req.file || !inscriptionId || !commitTxId || vout === undefined || !amount) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const inscription = getInscription.get(parseInt(inscriptionId)) as Inscription;

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

      updateInscription.run(commitTxId.trim(), revealTx, 'reveal_ready', Number(inscriptionId));

      const privKeyObj = getPrivateKey(inscription.temp_private_key);
      const pubkey = getPublicKeyFromWif(privKeyObj.wif);

      res.json({
        inscription_id: inscription.id + '',
        commit_tx_id: commitTxId.trim(),
        reveal_tx_hex: revealTx,
        debug: {
          payment_address: revealInscription.address,
          payment_pubkey: pubkey.hex,
          required_amount_in_sats: inscription.required_amount + '',
          given_utxo_amount_in_sats: amount,
          sender_address: inscription.sender_address,
          recipient_address: inscription.recipient_address,
          fees: `${BigInt(parseInt(amount)) - DUST_LIMIT}`,
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
