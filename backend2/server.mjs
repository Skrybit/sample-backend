// server.mjs
import express from 'express';
import Database from 'better-sqlite3';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import fs from 'fs';
import multer from 'multer';
import { createInscription } from './createInscription.mjs';
import { checkPaymentToAddess } from './services/utils.mjs';
import { DUST_LIMIT } from './config/network.mjs';

const app = express();

app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Initialize SQLite database
const db = new Database('ordinals.db', { verbose: console.log });

// Initialize database tables
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

// Initialize database on startup
initDatabase();

// Prepare statements
const insertInscription = db.prepare(`
    INSERT INTO inscriptions (
        temp_private_key, address, required_amount,
        file_size, recipient_address, sender_address, fee_rate
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getInscription = db.prepare('SELECT * FROM inscriptions WHERE id = ?');
const getInscriptionBySender = db.prepare('SELECT * FROM inscriptions WHERE sender_address = ?');

const updateInscription = db.prepare(`
    UPDATE inscriptions 
    SET commit_tx_id = ?, reveal_tx_hex = ?, status = ? 
    WHERE id = ?
`);

const updateInscriptionPayment = db.prepare(`
    UPDATE inscriptions 
    SET status = ? 
    WHERE id = ?
`);

// Endpoint to create commit transaction
app.post('/create-commit', upload.single('file'), (req, res) => {
  try {
    const { recipientAddress, feeRate, senderAddress } = req.body;

    if (!req.file || !recipientAddress || !feeRate) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Read the uploaded file
    const fileBuffer = fs.readFileSync(req.file.path);

    // Create inscription
    const inscription = createInscription(fileBuffer, parseFloat(feeRate));

    // Save to database
    const result = insertInscription.run(
      inscription.tempPrivateKey,
      inscription.address,
      inscription.requiredAmount,
      inscription.fileSize,
      recipientAddress,
      senderAddress,
      feeRate,
    );

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      inscriptionId: result.lastInsertRowid,
      fileSize: inscription.fileSize,
      address: inscription.address,
      recipientAddress,
      senderAddress,
      requiredAmount: inscription.requiredAmount,
    });
  } catch (error) {
    console.error('Error creating commit:', error);
    // Clean up uploaded file if it exists
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to create reveal transaction
app.post('/create-reveal', upload.single('file'), (req, res) => {
  try {
    const { inscriptionId, commitTxId, vout, amount } = req.body;

    if (!req.file || !inscriptionId || !commitTxId || vout === undefined || !amount) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Get inscription details from database
    const inscriptionData = getInscription.get(inscriptionId);

    if (!inscriptionData) {
      return res.status(404).json({ error: 'Inscription not found' });
    }

    // Read uploaded file
    const fileBuffer = fs.readFileSync(req.file.path);

    // Recreate inscription using saved private key
    const inscription = createInscription(
      fileBuffer,
      inscriptionData.fee_rate,
      inscriptionData.recipient_address,
      inscriptionData.temp_private_key,
    );

    // Create reveal transaction
    // const revealTx = inscription.createRevealTx(commitTxId, parseInt(vout), parseInt(amount));
    const revealTx = inscription.createRevealTx(commitTxId, parseInt(vout), parseInt(amount));

    // Update database with commit tx id and reveal tx hex
    updateInscription.run(commitTxId, revealTx, 'reveal_ready', inscriptionId);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      revealTxHex: revealTx,
      debug: {
        generatedAddress: inscription.address,
        pubkey: hex.encode(secp256k1.getPublicKey(hex.decode(inscription.tempPrivateKey), true)),
        amount: parseInt(amount),
        fees: parseInt(amount) - DUST_LIMIT,
      },
    });
  } catch (error) {
    console.error('Error creating reveal:', error);
    // Clean up uploaded file if it exists
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get inscription status endpoint
app.get('/inscription/:id', (req, res) => {
  try {
    const row = getInscription.get(req.params.id);

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
    console.error('Error fetching inscription:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/sender-inscriptions/:sender_address', (req, res) => {
  try {
    const rows = getInscriptionBySender.all(req.params.sender_address);

    if (!rows) {
      return res.status(404).json({ error: 'Inscription for this sender are not found' });
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
    console.error('Error fetching inscription for the sender:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if payment was made to the inscription address with required amount
// could be triggered by frontend , when user loads the app
// and if the inscription is paid, it updates its status withing the updateInscriptionPayment method
app.post('/payment-status', (req, res) => {
  try {
    const { address, required_amount, sender_address, id } = req.body || {};

    if (!address || !required_amount || !sender_address || !id) {
      return res.status(400).json({ error: 'Wrong required data' });
    }

    const parsedId = +`${id}`.trim();

    if (!parsedId) {
      return res.status(400).json({ error: 'Unexpected inscription id' });
    }
    const row = getInscription.get(parsedId);

    if (!row) {
      return res.status(404).json({ error: 'Inscription not found' });
    }

    if (row.id !== parsedId) {
      return res.status(400).json({ error: 'Unexpected inscription data' });
    }

    if (row.sender_address !== sender_address.trim()) {
      return res.status(400).json({ error: 'Unexpected sender_address for the inscription' });
    }

    if (row.required_amount !== +`${required_amount}`.trim()) {
      return res.status(400).json({ error: 'Unexpected amount for the inscription' });
    }

    if (row.address !== address.trim()) {
      return res.status(400).json({ error: 'Unexpected address for the inscription' });
    }

    checkPaymentToAddess(row.id, row.address, row.required_amount, updateInscriptionPayment)
      .then((isPaid) => {
        return res.json({
          is_paid: isPaid,
          id: row.id,
          address: row.address,
          amount: row.amount,
          sender_address: row.sender_address,
        });
      })
      .catch((err) => {
        return res.status(400).json({ error: err });
      });
  } catch (error) {
    console.error('Error fetching inscription for the sender:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;

app
  .listen(PORT)
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please try a different port.`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  })
  .on('listening', () => {
    console.log(`Server running on port ${PORT}`);
  });
