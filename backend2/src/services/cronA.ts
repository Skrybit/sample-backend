import { appdb } from '../db';
import { Inscription, PaymentUtxo } from '../types';
import { createInscription } from '../createInscription';
import { checkPaymentToAddress, getCurrentBlockHeight, broadcastTx } from './utils';

async function checkPendingInscriptions() {
  try {
    const pendingInscriptions = await appdb.getPendingInscriptions();
    console.log(`Found ${pendingInscriptions.length} pending inscriptions`);

    for (const inscription of pendingInscriptions) {
      try {
        await processSingleInscription(inscription.id);
      } catch (error) {
        console.error(`Failed to process inscription ${inscription.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in checkPendingInscriptions:', error);
  } finally {
    process.exit();
  }
}

async function processSingleInscription(inscriptionId: number) {
  console.log(`Processing inscription ID: ${inscriptionId}`);

  const currentBlock = await getCurrentBlockHeight();

  if (!currentBlock) {
    console.log('Could not fetch current block height');
    return;
  }

  const inscription = await appdb.getInscription(inscriptionId);

  if (!inscription) {
    console.log(`Inscription with id ${inscriptionId} not found`);
    return;
  }

  try {
    const paymentResult = await checkPaymentAndStatus(inscription);

    if (!paymentResult.isPaid) {
      console.log(`Inscription is not paid. skipping`);
      return;
    }
    console.log('paymentResult', paymentResult);
    console.log('inscription', inscription);

    const validationResult = await validatePaymentUtxo(paymentResult);

    const { paymentUtxo, commitTxId } = validationResult;

    if (!paymentUtxo || !commitTxId) {
      console.log(`Inscription payment validation failed. skipping`);
      return;
    }

    const revealTxHex = await createRevealTransaction(inscription, paymentUtxo, commitTxId);

    if (!revealTxHex) {
      console.log(`Inscription reveal failed. skipping`);
      return;
    }

    const result = await updateRevealStatus(inscription.id, commitTxId, revealTxHex, currentBlock);

    if (!result) {
      console.log(`Inscription id ${inscriptionId}, revea status update failed`);
      return;
    }

    await broadcastAndComplete(inscription.id, revealTxHex, inscription.created_block);
  } catch (error) {
    console.error(`Error processing inscription ${inscription.id}:`, error);
    return;
  }
}

async function checkPaymentAndStatus(inscription: Inscription) {
  try {
    const paymentStatus = await checkPaymentToAddress(
      inscription.id,
      inscription.status,
      inscription.address,
      inscription.required_amount,
      inscription.last_checked_block,
    );

    if (!paymentStatus.success) {
      console.log({
        error_details: paymentStatus.error,
      });

      return {
        isPaid: false,
        paymentUtxo: null,
      };
    }

    return {
      isPaid: paymentStatus.result,
      paymentUtxo: paymentStatus.utxo,
    };
  } catch (error) {
    console.log('Error in checkPaymentAndStatus - ' + JSON.stringify(error));
  }

  return {
    isPaid: false,
    paymentUtxo: null,
  };
}

async function validatePaymentUtxo(paymentResult: { paymentUtxo: PaymentUtxo | null }) {
  const paymentUtxo = paymentResult.paymentUtxo;

  if (!paymentUtxo?.txid || paymentUtxo.vout === undefined || !paymentUtxo.amount) {
    console.log('Invalid payment UTXO structure');
    return { paymentUtxo, commitTxId: '' };
  }

  return { paymentUtxo, commitTxId: paymentUtxo.txid };
}

async function createRevealTransaction(inscription: Inscription, paymentUtxo: PaymentUtxo, commitTxId: string) {
  try {
    const fileData = await appdb.getInscriptionFile(inscription.id);

    if (!fileData) {
      console.log('Associated file not found for the inscription ' + inscription.id);
      return;
    }

    const revealInscription = createInscription(
      fileData.data,
      inscription.fee_rate,
      inscription.recipient_address,
      inscription.temp_private_key,
    );

    return revealInscription.createRevealTx(commitTxId, paymentUtxo.vout, paymentUtxo.amount);
  } catch (error) {
    console.log(`Reveal TX creation failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function updateRevealStatus(inscriptionId: number, commitTxId: string, revealTxHex: string, blockNumber: number) {
  try {
    await appdb.updateInscriptionStatus({ id: inscriptionId, status: 'reveal_ready' });
    await appdb.insertCommitTransaction({
      inscriptionId: Number(inscriptionId),
      txId: commitTxId.trim(),
      revealTxHex,
      blockNumber,
    });
    return true;
  } catch (error) {
    console.log(
      `Inscription id ${inscriptionId}, Status update failed: ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

async function broadcastAndComplete(inscriptionId: number, revealTxHex: string, createBlock: number) {
  try {
    const broadcastResult = await broadcastTx(inscriptionId, revealTxHex);
    if (!broadcastResult.success) {
      console.log('Could not broadcast reveal tx for inscription ' + inscriptionId);
      console.log({
        error_details: broadcastResult.error,
      });
      return;
    }

    const currentBlock = await getCurrentBlockHeight();

    if (!currentBlock) {
      console.log('Could not fetch current block to create an inscription reveal');
      return;
    }

    await appdb.insertRevealTransaction({
      inscriptionId,
      txId: broadcastResult.result,
      blockNumber: currentBlock || createBlock,
    });

    await appdb.updateInscriptionStatus({
      id: inscriptionId,
      status: 'completed',
    });

    console.log(`Successfully completed inscription ${inscriptionId}`);
  } catch (error) {
    console.log(`Broadcast/completion failed: ${error instanceof Error ? error.message : error}`);
  }
}

checkPendingInscriptions();
