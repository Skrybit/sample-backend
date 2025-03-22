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

const INSCRIBE_FILE = 'test.txt'; // must be in the same directory

// inscription data
const inscriptionId = 62;
const inscriptionRequiredAmount = '1026';
const inscriptionPaymentAddress = 'tb1pvjgsq7zs5zrjcgn3x9d796lgf39r4su2mhkrynsp2f4mtpj75n3swwdprn';

// utxo data
const inscriptionUtxoVout = 0;
// const amount = 0.0000015; // 150
// const amount = 0.00001; // 1_000
const inscriptionUtxoAmount = 0.00001027;
const inscriptionUtxoTxId = '2ab0514f262425739406c984a1017b7ad231be2cbb1803551e45272457da44c0';

// reveal data
const inscriptionRevealTxHex =
  '02000000000101c044da572427451e550318bb2cbe31d27a7b01a184c90694732524264f51b02a0000000000ffffffff01230200000000000016001476649a1a1cf948f43a50da902411e8a2a638612c03409ea3a164f9ea8148fffdd055d9ff47308bc4de5e9600bb98efa17244ef7e6041901794d00b3bcad671f3fe31bb7a5292d6b49f19b0576492238de815bbc32ea5fd1f0420ca1563e01fce32d8400465b65134edb063909bfa58d6e039d7d953c4c8a5ec3cac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d38004d0802686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c2079654dcc01732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a6821c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac000000000';

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
  // and return UTXO if it is there
  const address = inscriptionPaymentAddress;
  const id = inscriptionId + '';
  const requiredAmount = inscriptionRequiredAmount;

  const senderAddress = SENDER_ADDRESS;

  const isInscriptiionPaidResponse = await isInscriptionPaid(address, id, senderAddress, requiredAmount);
  console.log('isInscriptiionPaidResponse', isInscriptiionPaidResponse);
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
};

const broadcastRevealTxHexStep = async () => {
  // 4. Broadcast reveal transaction
  const id = inscriptionId + '';

  const revealTxHex = inscriptionRevealTxHex;

  const revealTxResult = await broadcastRevealTx(id, revealTxHex);
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
    // and return UTXO if it is there
    await checkInscriptionPaymentStep();
    //
    // 3. After funding and confirmation, create reveal
    // await getInscriptionRevealDetailsStep();
    //
    // 4. Broadcast reveal transaction
    // await broadcastRevealTxHexStep();
    //
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

main();
