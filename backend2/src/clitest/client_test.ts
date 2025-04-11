import {
  createCommit,
  getSenderInscriptions,
  getInscription,
  isInscriptionPaid,
  createReveal,
  broadcastRevealTx,
} from './client';
import path from 'path';
import { RECIPIENT_ADDRESS, SENDER_ADDRESS, FEE_RATE } from '../config/network';
import { btcToSats } from '../utils/helpers';

const INSCRIBE_FILE = 'test_sm.txt'; // must be in the same directory

// inscription data
const inscriptionId = 4;
const inscriptionRequiredAmount = '1093';
const inscriptionPaymentAddress = 'tb1pjlxcz0l4s0erp957z0t6pvm65m3xxv7pt3nfj4e2my94rp0vkcls6mjn0f';

// utxo data
const inscriptionUtxoVout = 0;
// const amount = 0.0000015; // 150
// const amount = 0.00001; // 1_000
const inscriptionUtxoAmount = 0.00001093;
const inscriptionUtxoTxId = '';

const getSenderInscriptionsStep = async () => {
  // (optional) Get a list of current sender inscriptions
  const senderAddress = SENDER_ADDRESS;
  const senderInscriptionsResult = await getSenderInscriptions(senderAddress);

  console.log('Sender inscriptions: ', senderInscriptionsResult);
};

const checkInscriptionStep = async () => {
  // (optional) Check inscription status and details
  const id = inscriptionId;
  const inscriptionData = await getInscription(id);
  console.log('inscription data', inscriptionData);
};

const createCommitStep = async () => {
  // 1. Create commit inscription
  const commitResult = await createCommit({
    recipient_address: RECIPIENT_ADDRESS,
    sender_address: SENDER_ADDRESS,
    fee_rate: `${FEE_RATE}`,
    file_path: path.join(__dirname, INSCRIBE_FILE),
  });

  console.log('Full server response: ', commitResult);

  if (!commitResult.success) {
    throw new Error('could not create commit');
  }

  console.log('Commit Transaction Created:');
  console.log('Fund this address:', commitResult.result.payment_address);
  console.log('Required amount:', commitResult.result.required_amount_in_sats);
  console.log('Inscription ID:', commitResult.result.inscription_id);
};

const checkInscriptionPaymentStep = async () => {
  // 2. Check inscription payment
  // (would trigger status update on remote end if paid)
  // and return UTXO if it is there and reveal and broadcast
  const address = inscriptionPaymentAddress;
  const id = inscriptionId + '';
  const requiredAmount = inscriptionRequiredAmount;

  const senderAddress = SENDER_ADDRESS;

  const isInscriptiionPaidResponse = await isInscriptionPaid(address, id, senderAddress, requiredAmount);
  console.log('isInscriptiionPaidResponse', isInscriptiionPaidResponse);
  if (isInscriptiionPaidResponse.success && isInscriptiionPaidResponse.result.payment_utxo) {
    const vout = isInscriptiionPaidResponse.result.payment_utxo.vout;
    const amount = isInscriptiionPaidResponse.result.payment_utxo.amount;
    const paymentTxid = isInscriptiionPaidResponse.result.payment_utxo.txid;

    const utxoAmountInSats = btcToSats(amount);

    const revealResult = await createReveal({
      inscription_id: id,
      commit_tx_id: paymentTxid,
      vout: `${vout}`,
      amount: `${utxoAmountInSats!}`,
      file_path: path.join(__dirname, INSCRIBE_FILE),
    });
    console.log('Full server response of the reveal after payment check: ', revealResult);

    if (revealResult.success) {
      const revealTxResult = await broadcastRevealTx(id);
      console.log('\nReveal Transaction Broadcasted result (from check payment):', revealTxResult);
    }
  }
};

const getInscriptionRevealDetailsStep = async () => {
  // 3. After funding and confirmation, create reveal
  const id = inscriptionId + '';

  const vout = inscriptionUtxoVout;
  const amount = inscriptionUtxoAmount;
  const paymentTxid = inscriptionUtxoTxId;

  const utxoAmountInSats = btcToSats(amount);

  const revealResult = await createReveal({
    inscription_id: id,
    commit_tx_id: paymentTxid,
    vout: `${vout}`,
    amount: `${utxoAmountInSats!}`,
    file_path: path.join(__dirname, INSCRIBE_FILE),
  });

  console.log('Full server response: ', revealResult);

  if (revealResult.success) {
    const revealTxResult = await broadcastRevealTx(id);
    console.log('\nReveal Transaction Broadcasted result:', revealTxResult);
  }
};

const broadcastRevealTxHexStep = async () => {
  // 4. Broadcast reveal transaction
  const id = inscriptionId + '';

  const revealTxResult = await broadcastRevealTx(id);
  console.log('\nReveal Transaction Broadcasted result:', revealTxResult);
  if (!revealTxResult.success) {
    console.log('\nReveal Transaction Broadcasted result:', revealTxResult.error);
  }
};

async function main() {
  try {
    // (optional) Get a list of current sender inscriptions
    // await getSenderInscriptionsStep();
    //
    // (optional) Check inscription status and details
    // await checkInscriptionStep();
    //
    // 1. Create commit inscription
    // await createCommitStep();
    //
    // 2. Check inscription payment
    // (would trigger status update on remote end if paid)
    // (also will auto reveal and broadcast)
    // and return UTXO if it is there
    await checkInscriptionPaymentStep();
    //
    // (is done in the previous step)
    // 3. After funding and confirmation, create reveal and broadcast the revealTx
    // await getInscriptionRevealDetailsStep();
    //
    // (is done in the previous step)
    // 4. Broadcast reveal transaction (not needed)
    // await broadcastRevealTxHexStep();
    //
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

main();
