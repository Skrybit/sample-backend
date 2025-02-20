// server.mjs
import express from 'express';
import Database from 'better-sqlite3';
import * as btc from '@scure/btc-signer';
import * as ordinals from 'micro-ordinals';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { createInscription } from './createInscription.mjs';
import fs from 'fs';
import multer from 'multer';

const app = express();
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
        file_size, recipient_address, fee_rate
    ) VALUES (?, ?, ?, ?, ?, ?)
`);

const getInscription = db.prepare('SELECT * FROM inscriptions WHERE id = ?');

const updateInscription = db.prepare(`
    UPDATE inscriptions 
    SET commit_tx_id = ?, reveal_tx_hex = ?, status = ? 
    WHERE id = ?
`);

// Endpoint to create commit transaction
app.post('/create-commit', upload.single('file'), (req, res) => {
    try {
        const { recipientAddress, feeRate } = req.body;
        
        if (!req.file || !recipientAddress || !feeRate) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // Read the uploaded file
        const fileBuffer = fs.readFileSync(req.file.path);

        // Create inscription
        const inscription = createInscription(fileBuffer, parseFloat(feeRate), recipientAddress);

        // Save to database
        const result = insertInscription.run(
            inscription.tempPrivateKey,
            inscription.address,
            inscription.requiredAmount,
            inscription.fileSize,
            recipientAddress,
            feeRate
        );

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
            inscriptionId: result.lastInsertRowid,
            fileSize: inscription.fileSize,
            address: inscription.address,
            requiredAmount: inscription.requiredAmount,
            tempPrivateKey: inscription.tempPrivateKey
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
            inscriptionData.temp_private_key
        );

        // Create reveal transaction
        const revealTx = inscription.createRevealTx(
            commitTxId,
            parseInt(vout),
            parseInt(amount)
        );

        // Update database with commit tx id and reveal tx hex
        updateInscription.run(
            commitTxId,
            revealTx,
            'reveal_ready',
            inscriptionId
        );

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
            revealTxHex: revealTx,
            debug: {
                generatedAddress: inscription.address,
                pubkey: hex.encode(secp256k1.getPublicKey(hex.decode(inscription.tempPrivateKey), true)),
                amount: parseInt(amount),
                fees: parseInt(amount) - 546
            }
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
            created_at: row.created_at
        });
    } catch (error) {
        console.error('Error fetching inscription:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT)
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
