import {
  createCommit,
  createReveal,
  getInscriptionStatus,
  getSenderInscriptions,
  isInscriptionPaid,
  getInscriptionPaymentUtxo,
  broadcastRevealTx,
} from './client';
import path from 'path';
import { btcToSats } from '../utils/helpers';
import 'dotenv/config';

// from who we create the inscription
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS || '';
// for who we create the inscription
const SENDER_ADDRESS = process.env.SENDER_ADDRESS || '';

// if we hard code it, it will be rejected
const FEE_RATE = 1.5;
// const INSCRIBE_FILE = 'test.txt'; // must be in the same directory
// const INSCRIBE_FILE = 'my_btc.webp'; // must be in the same directory
const INSCRIBE_FILE = 'ordinals.png'; // must be in the same directory

const createCommitStep = async () => {
  // 1. Create commit inscription
  const commitResult = await createCommit({
    recipientAddress: RECIPIENT_ADDRESS,
    senderAddress: SENDER_ADDRESS,
    feeRate: FEE_RATE,
    filePath: path.join(__dirname, INSCRIBE_FILE),
  });

  console.log('Full server response: ', commitResult);

  if (!commitResult.success) {
    throw new Error('could not create commit');
  }

  console.log('Commit Transaction Created:');
  console.log('Fund this address:', commitResult.result.address);
  console.log('Required amount:', commitResult.result.requiredAmount);
  console.log('Inscription ID:', commitResult.result.inscriptionId);

  /**
   * EXAMPLE
   *
    Full server response:  {
      success: true,
      result: {
        inscriptionId: 35,
        fileSize: 112,
        address: 'tb1p2xv0y3wk6602avmzcnfdwk2kudd8vc8fzk5gkd5tp3p2q583gygq6y2fnp',
        recipientAddress: 'tb1q22kp7nu2ue57s7gd0vq9fjdc50e4d5hjgy9r6j',
        senderAddress: 'tb1q7ny5lyyhrqhkzx7x4pvm32pvyjr4pd2ecfl4kf',
        requiredAmount: '155',
        createResult: true
      }
    }
   *
   **/
};

const getSenderInscriptionsStep = async () => {
  // 2. Get a list of current sender inscriptions
  const senderAddress = SENDER_ADDRESS; // to be sent from the wallet

  const senderInscriptionsResult = await getSenderInscriptions(senderAddress);
  console.log('Sender inscriptions: ', senderInscriptionsResult);

  /**
   *
    Sender inscriptions:  [
      {
        id: 4,
        address: 'tb1pqjct323e3rq8any0q8ls22994z2n0qcknzfecy34j6sfmame2wrq9t69gx',
        required_amount: 118,
        status: 'pending',
        commit_tx_id: null,
        sender_address: 'tb1q7ny5lyyhrqhkzx7x4pvm32pvyjr4pd2ecfl4kf',
        recipient_address: 'tb1q22kp7nu2ue57s7gd0vq9fjdc50e4d5hjgy9r6j',
        created_at: '2025-02-24 22:55:20'
      },
      {
        id: 35,
        address: 'tb1p2xv0y3wk6602avmzcnfdwk2kudd8vc8fzk5gkd5tp3p2q583gygq6y2fnp',
        required_amount: 155,
        status: 'pending',
        commit_tx_id: null,
        sender_address: 'tb1q7ny5lyyhrqhkzx7x4pvm32pvyjr4pd2ecfl4kf',
        recipient_address: 'tb1q22kp7nu2ue57s7gd0vq9fjdc50e4d5hjgy9r6j',
        created_at: '2025-03-03 22:10:26'
      }
    ]
   * */
};

const checkInscriptionStatusStep = async () => {
  // 3. Check inscription status and details
  const inscriptionId = 38; // this id was paid

  const inscriptionStatus = await getInscriptionStatus(inscriptionId);
  console.log('inscriptionStatus ', inscriptionStatus);

  /*
   *
    inscriptionStatus  {
      success: true,
      result: {
        id: 20,
        address: 'tb1p2knzwr9txs8ynsx5efy57lxp2dlz0xk7vqtn8xypffphr9g6lysqqsgvgc',
        required_amount: 118,
        status: 'reveal_ready',
        commit_tx_id: 'bb523d9b345de1f59c5eaeaf7a45e86369ee5bc56b76f0fb44007d1e962deee2',
        created_at: '2025-02-26 00:37:59'
      }
    }

      OR, etc

    inscriptionStatus  {
      success: true,
      result: {
        id: 35,
        address: 'tb1p2xv0y3wk6602avmzcnfdwk2kudd8vc8fzk5gkd5tp3p2q583gygq6y2fnp',
        required_amount: 155,
        status: 'pending',
        commit_tx_id: null,
        created_at: '2025-03-03 22:10:26'
      }
    }

   * */
};

const checkInscriptionPaymentStep = async () => {
  // 4. Check inscription payment (would trigger status update on remote end if paid)

  const address = 'tb1pve4cpn4ewscr7mzdp9zw4x5u67xkftkvx5zur4zwxvshw5r8vc0suz4zgm'; //
  const id = '38';
  const requiredAmount = '155';

  const senderAddress = SENDER_ADDRESS;

  const isInscriptiionPaidResponse = await isInscriptionPaid(address, id, senderAddress, requiredAmount);
  console.log('isInscriptiionPaidResponse', isInscriptiionPaidResponse);

  /*
   * 
    isInscriptiionPaidResponse {
      success: true,
      result: {
        is_paid: true,
        id: 20,
        address: 'tb1p2knzwr9txs8ynsx5efy57lxp2dlz0xk7vqtn8xypffphr9g6lysqqsgvgc',
        amount: 118,
        sender_address: 'tb1q7ny5lyyhrqhkzx7x4pvm32pvyjr4pd2ecfl4kf'
      }
    }


    isInscriptiionPaidResponse {
      success: true,
      result: {
        is_paid: false,
        id: 35,
        address: 'tb1p2xv0y3wk6602avmzcnfdwk2kudd8vc8fzk5gkd5tp3p2q583gygq6y2fnp',
        amount: 155,
        sender_address: 'tb1q7ny5lyyhrqhkzx7x4pvm32pvyjr4pd2ecfl4kf'
      }
    }
   * */
};

const getInscriptionUtxoStep = async () => {
  // 5. Check inscription payment UTXO
  const senderAddress = SENDER_ADDRESS;

  const address = 'tb1pve4cpn4ewscr7mzdp9zw4x5u67xkftkvx5zur4zwxvshw5r8vc0suz4zgm'; //
  const id = '38';
  const requiredAmount = '155';

  const paymentUtxoResponse = await getInscriptionPaymentUtxo(address, id, senderAddress, requiredAmount);
  console.log('paymentUtxoResponse', paymentUtxoResponse);

  /*

paymentUtxoResponse {
  success: true,
  result: {
    paymentUtxo: {
      txid: '9d9ac5988f06f3468ac5747c505e879597b45472abc51527d672be438b9a8829',
      vout: 0,
      address: 'tb1p2xv0y3wk6602avmzcnfdwk2kudd8vc8fzk5gkd5tp3p2q583gygq6y2fnp',
      label: 'insc_wallet_35_lbl',
      scriptPubKey: '51205198f245d6d69eaeb362c4d2d75956e35a7660e915a88b368b0c42a050f14110',
      amount: 0.00001,
      confirmations: 27,
      spendable: true,
      solvable: true,
      desc: 'rawtr(5198f245d6d69eaeb362c4d2d75956e35a7660e915a88b368b0c42a050f14110)#df0fpeyk',
      parent_descs: [Array],
      safe: true
    },
    id: 35,
    address: 'tb1p2xv0y3wk6602avmzcnfdwk2kudd8vc8fzk5gkd5tp3p2q583gygq6y2fnp',
    amount: 155,
    sender_address: 'tb1q7ny5lyyhrqhkzx7x4pvm32pvyjr4pd2ecfl4kf'
  }
}
   * */
};

const getInscriptionRevealDetailsStep = async () => {
  // 6. After funding and confirmation, create reveal
  const vout = 0;
  // const amount = 0.0000015; // 150
  const amount = 0.00001; // 1_000

  const id = '38';
  const paymentTxid = '8c6f77b918dfbdcc82e1100ab091c05c46331d30a24463e807cf0e2b26826506';

  const utxoAmountInSats = btcToSats(amount);

  const revealResult = await createReveal({
    inscriptionId: id,
    commitTxId: paymentTxid,
    vout,
    amount: utxoAmountInSats!,
    filePath: path.join(__dirname, INSCRIBE_FILE),
  });

  console.log('Full server response: ', revealResult);
  /*
   *
    Full server response:  {
      success: true,
      result: {
        revealTxHex: '0200000000010129889a8b43be72d62715c5ab7254b49795875e507c74c58a46f3068f98c59a9d0000000000ffffffff014d0300000000000016001452ac1f4f8ae669e8790d7b0054c9b8a3f356d2f203408ca124815169e1f0ebe66eeec5e349f78538ab0fcea09641290c98a097fd53c7ac1885e76e65f09ec495002048f5f7e836f1b87c3d4f5ba95acff38f6caaf03fb720e3e0f257bfa582a147cbe690e3a17f05afe1dd5e94d8e99e6055d79e0ee57ef9ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d38004c70686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a6821c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac000000000',
        debug: {
          generatedAddress: 'tb1p2xv0y3wk6602avmzcnfdwk2kudd8vc8fzk5gkd5tp3p2q583gygq6y2fnp',
          pubkey: '031d0d4c59583fd9e83fe3fd7658089ff7323a6cf53d3098d9bb86b90115af61e3',
          amount: 1000,
          fees: '454'
        }
      }
    }

   * */
};

const broadcastRevealTxHexStep = async () => {
  // 7. Broadcast reveal transaction
  const id = '38';
  const revealTxHex =
    '02000000000101066582262b0ecf07e86344a2301d33465cc091b00a10e182ccbddf18b9776f8c0000000000ffffffff014d0300000000000016001452ac1f4f8ae669e8790d7b0054c9b8a3f356d2f20340ce38658419dc6e41018014af2f9ccf342d9f61d39204035652dc3b5799d32feaab5d8452796be65f39724cd7428c8742353f2548ce00161e164a4d2261100640b7201d0d4c59583fd9e83fe3fd7658089ff7323a6cf53d3098d9bb86b90115af61e3ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d38004c70686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a6821c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac000000000';

  const revealTxResult = await broadcastRevealTx(id, revealTxHex);
  console.log('\nReveal Transaction Broadcasted result:', revealTxResult);

  /*
   *
    Reveal Transaction Broadcasted result: {
      success: true,
      result: {
        txId: 'efb077b8acad7405ff285493b992a02f889f70f47c5b0978c0c6733ae11340a9',
        id: 35
      }
    }


Reveal Transaction Broadcasted result: {
  success: true,
  result: {
    txId: null,
    id: 35,
    error_details: {
      errCode: 'ERR_BAD_RESPONSE',
      errMsg: 'Request failed with status code 500',
      errStatus: 500,
      responseStatus: 500,
      responseStatusText: 'Internal Server Error',
      dataErrCode: -27,
      dataErrMsg: 'Transaction already in block chain',
      details: 'RPC Error: {"code":-27,"message":"Transaction already in block chain"}',
      originalResponseError: [Object]
    }
  }
}
   * */
};

async function main() {
  try {
    // 1. Create commit inscription
    // await createCommitStep();
    //
    // 2. Get a list of current sender inscriptions
    await getSenderInscriptionsStep();
    //
    // 3. Check inscription status and details
    // await checkInscriptionStatusStep();
    //
    // 4. Check inscription payment (would trigger status update on remote end if paid)
    // await checkInscriptionPaymentStep();
    //
    // 5. Check inscription payment UTXO
    // await getInscriptionUtxoStep();
    //
    // 6. After funding and confirmation, create reveal
    // await getInscriptionRevealDetailsStep();
    //
    // 7. Broadcast reveal transaction
    // await broadcastRevealTxHexStep();
    //
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

main();
