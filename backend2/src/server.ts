import express, { Request, Application, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createInscription } from './createInscription';
import { DUST_LIMIT } from './config/network';
import { getPublicKeyFromWif, getPrivateKey } from './utils/walletUtils';
import { checkPaymentToAddress, getPaymentUtxo, broadcastTx, createWalletAndAddressDescriptor } from './services/utils';
import { getUTCTimestampInSec, timestampToDateString } from './utils/dateUtils';
import { address } from 'bitcoinjs-lib';

console.log('__filename', __filename);
console.log(' __dirname: %s', __dirname);

// Resolve DB path relative to project root
const DB_PATH = path.resolve(__dirname, '../ordinals.db');

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

interface PaymentStatusBody {
  address: string;
  required_amount: string;
  sender_address: string;
  id: string;
}

interface BroadcastRevealTxBody {
  txHex: string;
  id: string;
}

// Express app setup
const app: Application = express();

app.use(express.json());

// bigint parse middleware
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (obj) {
    const sanitized = JSON.parse(
      JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
    );
    return originalJson.call(this, sanitized);
  };
  next();
});

// Multer configuration
const upload = multer({
  dest: UPLOAD_DIR,
});

// Database setup
const db = new Database(DB_PATH, { verbose: console.log });
// const db = new Database('./ordinals.db', { verbose: console.log });

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      temp_private_key TEXT NOT NULL,
      address TEXT NOT NULL,
      required_amount INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      recipient_address TEXT NOT NULL,
      sender_address TEXT NOT NULL,
      fee_rate REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      commit_tx_id TEXT,
      reveal_tx_hex TEXT,
      status TEXT DEFAULT 'pending'
    )
  `);
  console.log('Database initialized successfully');
}

initDatabase();

// Prepared statements with TypeScript types
const insertInscription = db.prepare(`
  INSERT INTO inscriptions (
    temp_private_key, address, required_amount,
    file_size, recipient_address, sender_address, fee_rate, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const getInscription = db.prepare<number>('SELECT * FROM inscriptions WHERE id = ?');
const getInscriptionBySender = db.prepare<string>('SELECT * FROM inscriptions WHERE sender_address = ?');

const updateInscription = db.prepare<[string, string, string, number]>(`
  UPDATE inscriptions 
  SET commit_tx_id = ?, reveal_tx_hex = ?, status = ? 
  WHERE id = ?
`);

const updateInscriptionPayment = db.prepare<[string, number]>(`
  UPDATE inscriptions 
  SET status = ? 
  WHERE id = ?
`);

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

    // res.json({
    //   inscriptionId: result.lastInsertRowid,
    //   fileSize: inscription.fileSize,
    //   address: inscription.address,
    //   recipientAddress,
    //   senderAddress,
    //   requiredAmount: inscription.requiredAmount,
    // });
  } catch (error) {
    console.error('Error creating commit:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  } finally {
    if (req.file?.path) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// Get particular inscription details
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

// Get all inscriptions by given sender address. could be used in an inial call from the landing page
app.get(
  '/sender-inscriptions/:sender_address',
  (req: Request<{ sender_address: string }>, res: Response, next: NextFunction) => {
    try {
      const rows = getInscriptionBySender.all(req.params.sender_address) as Inscription[];

      if (!rows.length) {
        return res.status(404).json({ error: 'Inscriptions for this sender not found' });
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

// Check if payment was made to the inscription address with required amount
// could be triggered by frontend , when user loads the app and if the inscription is paid,
// it updates its status withing the updateInscriptionPayment method
app.post(
  '/payment-status',
  (req: Request<Record<string, never>, {}, PaymentStatusBody>, res: Response, next: NextFunction) => {
    try {
      const { address, required_amount, sender_address, id } = req.body;

      if (!address || !required_amount || !sender_address || !id) {
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

      if (row.sender_address !== sender_address.trim()) {
        return res.status(400).json({ error: 'Sender address mismatch' });
      }

      if (row.required_amount !== Number(required_amount)) {
        return res.status(400).json({ error: 'Amount mismatch' });
      }

      if (row.address !== address.trim()) {
        return res.status(400).json({ error: 'Address mismatch' });
      }

      checkPaymentToAddress(
        row.id,
        row.status,
        row.created_at,
        row.address,
        row.required_amount,
        (status: string, id: number) => updateInscriptionPayment.run(status, id),
      )
        .then((checkPaymentResult) => {
          if (!checkPaymentResult.success) {
            return res.json({
              is_paid: false,
              id: row.id,
              address: row.address,
              amount: row.required_amount,
              sender_address: row.sender_address,
              error_details: checkPaymentResult.error,
            });
          }

          const { result } = checkPaymentResult;

          return res.json({
            is_paid: result,
            id: row.id,
            address: row.address,
            amount: row.required_amount,
            sender_address: row.sender_address,
          });
        })
        .catch((error) =>
          res.status(400).json({ error: error instanceof Error ? error.message : 'Payment check failed' }),
        );
    } catch (error) {
      next(error);
    }
  },
);

// Returns an utxo that was sent to the inscription address (paypent proof)
// so tx and vout could be used to create reveal
app.post(
  '/payment-utxo',
  (req: Request<Record<string, never>, {}, PaymentStatusBody>, res: Response, next: NextFunction) => {
    try {
      const { address, required_amount, sender_address, id } = req.body;

      if (!address || !required_amount || !sender_address || !id) {
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

      if (row.sender_address !== sender_address.trim()) {
        return res.status(400).json({ error: 'Sender address mismatch' });
      }

      if (row.required_amount !== Number(required_amount)) {
        return res.status(400).json({ error: 'Amount mismatch' });
      }

      if (row.address !== address.trim()) {
        return res.status(400).json({ error: 'Address mismatch' });
      }

      getPaymentUtxo(row.id, row.address, row.required_amount)
        .then((checkPaymentUtxoResult) => {
          if (!checkPaymentUtxoResult.success) {
            return res.json({
              paymentUtxo: null,
              id: row.id,
              error_details: checkPaymentUtxoResult.error,
            });
          }

          const { result } = checkPaymentUtxoResult;

          return res.json({
            paymentUtxo: result,
            id: row.id,
            address: row.address,
            amount: row.required_amount,
            sender_address: row.sender_address,
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

// Last step, to get the hex of the reveal tx
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
        pubkey,
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

// Server startup
const PORT = Number(process.env.PORT) || 3001;

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
