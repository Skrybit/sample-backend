import express, { Request, Application, Response, NextFunction } from 'express';

import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createInscription } from './createInscription';
import corsMiddleware from './middleware/cors';
import { swaggerSpec } from './config/swagger';
import { DUST_LIMIT } from './config/network';
import {
  initDatabase,
  insertInscription,
  getInscription,
  getInscriptionBySender,
  updateInscription,
} from './db/sqlite';
import paymentsRouter from './routes/payments';
import { getPublicKeyFromWif, getPrivateKey } from './utils/walletUtils';
import { broadcastTx, createWalletAndAddressDescriptor } from './services/utils';
import { getUTCTimestampInSec, timestampToDateString } from './utils/dateUtils';

console.log('__filename', __filename);
console.log(' __dirname: %s', __dirname);

// Server startup
const PORT = Number(process.env.PORT) || 3001;

import swaggerUi from 'swagger-ui-express';

// Resolve uploads directory relative to project root
const UPLOAD_DIR = path.resolve(__dirname, '../uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Type definitions
interface Inscription {
  id: number;
  temp_private_key: string;
  address: string;
  required_amount: number;
  file_size: number;
  recipient_address: string;
  sender_address: string;
  fee_rate: number;
  created_at: string;
  commit_tx_id?: string;
  reveal_tx_hex?: string;
  status: string;
}

interface CreateCommitBody {
  recipientAddress: string;
  feeRate: string;
  senderAddress: string;
}

interface CreateRevealBody {
  inscriptionId: string;
  commitTxId: string;
  vout: string;
  amount: string;
}

interface BroadcastRevealTxBody {
  txHex: string;
  id: string;
}

// Express app setup
const app: Application = express();

// Initialize database
initDatabase();

// Middleware
app.use(corsMiddleware);
app.use(express.json());

// bigint parse middleware
app.use((_req, res, next) => {
  const originalJson = res.json;
  res.json = function (obj) {
    const sanitized = JSON.parse(
      JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
    );
    return originalJson.call(this, sanitized);
  };
  next();
});

// Docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/payments', paymentsRouter);

// Multer configuration
const upload = multer({
  dest: UPLOAD_DIR,
});

/**
 * @swagger
 * /create-commit:
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
 *                 inscriptionId:
 *                   type: integer
 *                 fileSize:
 *                   type: integer
 *                 address:
 *                   type: string
 *                 recipientAddress:
 *                   type: string
 *                 senderAddress:
 *                   type: string
 *                 requiredAmount:
 *                   type: integer
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/create-commit', upload.single('file'), (req: Request, res: Response) => {
  try {
    const { recipientAddress, feeRate, senderAddress } = req.body as CreateCommitBody;

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

    console.log('req.file.path commit', req.file?.path);

    const lastInsertRowid = result.lastInsertRowid;

    createWalletAndAddressDescriptor(lastInsertRowid, inscription.address)
      .then((broadcastResult) => {
        if (!broadcastResult.success) {
          return res.json({
            result: null,
            address: inscription.address,
            error_details: broadcastResult.error,
          });
        }

        const { result } = broadcastResult;

        return res.json({
          inscriptionId: lastInsertRowid,
          fileSize: inscription.fileSize,
          address: inscription.address,
          recipientAddress,
          senderAddress,
          requiredAmount: inscription.requiredAmount,
          createResult: result,
        });
      })
      .catch((error) =>
        res.status(400).json({ error: error instanceof Error ? error.message : 'Wallet create failed' }),
      );
  } catch (error) {
    console.error('Error creating commit:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  } finally {
    if (req.file?.path) {
      fs.unlinkSync(req.file.path);
    }
  }
});

/**
 * @swagger
 * /inscription/{id}:
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
 *               $ref: '#/components/schemas/Inscription'
 *       404:
 *         description: Inscription not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/inscription/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const row = getInscription.get(Number(req.params.id)) as Inscription | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Inscription not found' });
    }

    res.json({
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

/**
 * @swagger
 * /sender-inscriptions/{sender_address}:
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
 *                 $ref: '#/components/schemas/Inscription'
 */
app.get(
  '/sender-inscriptions/:sender_address',
  (req: Request<{ sender_address: string }>, res: Response, next: NextFunction) => {
    try {
      const rows = getInscriptionBySender.all(req.params.sender_address) as Inscription[];

      if (!rows.length) {
        return res.json([]);
      }

      const data = rows.map((row) => ({
        id: row.id,
        address: row.address,
        required_amount: row.required_amount,
        status: row.status,
        commit_tx_id: row.commit_tx_id,
        sender_address: row.sender_address,
        recipient_address: row.recipient_address,
        created_at: row.created_at,
      }));

      res.json(data);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /create-reveal:
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
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/create-reveal', upload.single('file'), (req: Request, res: Response) => {
  try {
    const { inscriptionId, commitTxId, vout, amount } = req.body as CreateRevealBody;

    console.log('body', req.body);
    console.log('req.fil', req.file);
    console.log('req.fil p', req.file?.path);

    if (!req.file || !inscriptionId || !commitTxId || vout === undefined || !amount) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const inscriptionData = getInscription.get(Number(inscriptionId)) as Inscription | undefined;

    if (!inscriptionData) {
      return res.status(404).json({ error: 'Inscription not found' });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const inscription = createInscription(
      fileBuffer,
      inscriptionData.fee_rate,
      inscriptionData.recipient_address,
      inscriptionData.temp_private_key,
    );

    const revealTx = inscription.createRevealTx(commitTxId, parseInt(vout), parseInt(amount));
    updateInscription.run(commitTxId, revealTx, 'reveal_ready', Number(inscriptionId));

    const privKeyObj = getPrivateKey(inscriptionData.temp_private_key);
    const pubkey = getPublicKeyFromWif(privKeyObj.wif);

    res.json({
      revealTxHex: revealTx,
      debug: {
        generatedAddress: inscription.address,
        pubkey: pubkey.hex,
        amount: parseInt(amount),
        fees: BigInt(parseInt(amount)) - DUST_LIMIT,
      },
    });
  } catch (error) {
    console.error('Error creating reveal:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  } finally {
    if (req.file?.path) {
      fs.unlinkSync(req.file.path);
    }
  }
});

/**
 * @swagger
 * /broadcast-reveal-tx:
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
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post(
  '/broadcast-reveal-tx',
  (req: Request<Record<string, never>, {}, BroadcastRevealTxBody>, res: Response, next: NextFunction) => {
    try {
      const { txHex, id } = req.body;

      if (!txHex || !id) {
        return res.status(400).json({ error: 'Missing required data' });
      }

      const parsedId = parseInt(id);

      if (isNaN(parsedId)) {
        return res.status(400).json({ error: 'Invalid inscription ID' });
      }

      const row = getInscription.get(parsedId) as Inscription | undefined;

      if (!row) {
        return res.status(404).json({ error: 'Inscription not found' });
      }

      broadcastTx(row.id, txHex, row.reveal_tx_hex)
        .then((broadcastResult) => {
          if (!broadcastResult.success) {
            return res.json({
              txId: null,
              id: row.id,
              error_details: broadcastResult.error,
            });
          }

          const { result } = broadcastResult;

          return res.json({
            txId: result,
            id: row.id,
          });
        })
        .catch((error) =>
          res.status(400).json({ error: error instanceof Error ? error.message : 'Payment utxo check failed' }),
        );
    } catch (error) {
      next(error);
    }
  },
);

app
  .listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  })
  .on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please try a different port.`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });
