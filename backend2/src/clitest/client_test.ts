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

// if we hard code it, it will be rejected
const INSCRIBE_FILE = 'test.txt'; // must be in the same directory

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

const checkInscriptionStep = async () => {
  // 3. Check inscription status and details
  // const inscriptionId = 44; // main net
  const inscriptionId = 53; // test net

  const inscriptionData = await getInscription(inscriptionId);
  console.log('inscription data', inscriptionData);

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

  const address = 'tb1p3u39zjqtus86lk3a55u3pyfsa3v5g3lqf0d53n0tjmaj7ax43sjqgsdyu5';
  const id = '60';

  const requiredAmount = '1026';

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

  const address = 'tb1pve4cpn4ewscr7mzdp9zw4x5u67xkftkvx5zur4zwxvshw5r8vc0suz4zgm';
  const id = '38';

  // const address = 'bc1plmxjy6yx993hs6h9vu2z36agt82m77pmkxfg30h46282pw8gn66sx4z32d';
  // const id = '44';
  const requiredAmount = '155';

  // const paymentUtxoResponse = await getInscriptionPaymentUtxo(address, id, senderAddress, requiredAmount);
  // console.log('paymentUtxoResponse', paymentUtxoResponse);

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
  // 5. After funding and confirmation, create reveal
  const vout = 0;
  // const amount = 0.0000015; // 150
  const amount = 0.00001026; // 1_000

  const id = '60';
  const paymentTxid = 'e8a1655a01fb4324678a4f96a2f6f5dcc4bd1e6f27a00f69e6a82b4df9c6fb54';

  const utxoAmountInSats = btcToSats(amount);

  const revealResult = await createReveal({
    inscription_id: id,
    commit_tx_id: paymentTxid,
    vout: `${vout}`,
    amount: `${utxoAmountInSats!}`,
    file_path: path.join(__dirname, INSCRIBE_FILE),
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
  const id = '60';
  // const revealTxHex = '';

  const revealTxHex =
    '0200000000010154fbc6f94d2ba8e6690fa0276f1ebdc4dcf5f6a2964f8a672443fb015a65a1e80000000000ffffffff01220200000000000016001476649a1a1cf948f43a50da902411e8a2a638612c0340e59a31b14db67ef3ea1c841963cd08ad6aaf58c52e8405ab8ed28a5564b89fb05ed404da87ceb1753fb081acc3d85e31f19a65af20b3aa2e4cf7617e5c9b221bfd1f0420881461cad213203137d79fbbb65029bf9a9586de2506ded0231d4cb658325a1fac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d38004d0802686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c2079654dcc01732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a6821c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac000000000';
  // const revealTxHex =
  //   '020000000001015f69e6547df13db10d8458621de8d2e5cc9991186b5e9c2217b2ad123c4af08a0000000000ffffffff014d0300000000000016001476649a1a1cf948f43a50da902411e8a2a638612c03400ade7a4792cc7d80ab831691ca6a4957c9d3fd7a14bca386d0500990d8ad3885b4b6e384c9e4b6cf9095516d6f152b6fbb71c1ddfa1151dc63fc052484ec7071b7200456b434e7e7f655ccaad6aa7d268a8ea1e2a1aaa0f07632ecbeff98729020abac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d38004c70686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a686579206974206973206d652c207965732c206974206973206d650a6821c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac000000000';
  const revealTxResult = await broadcastRevealTx(id, revealTxHex);
  console.log('\nReveal Transaction Broadcasted result:', revealTxResult);
  if (!revealTxResult.success) {
    console.log('\nReveal Transaction Broadcasted result:', revealTxResult.error);
  }

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
    // ? 2. Get a list of current sender inscriptions
    // await getSenderInscriptionsStep();
    //
    // ? 3. Check inscription status and details
    // await checkInscriptionStep();
    //
    // 4. Check inscription payment (would trigger status update on remote end if paid)
    // and return UTXO if it is there
    // await checkInscriptionPaymentStep();
    //
    // 5. After funding and confirmation, create reveal
    // await getInscriptionRevealDetailsStep();
    //
    // 6. Broadcast reveal transaction
    await broadcastRevealTxHexStep();
    //
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

main();
