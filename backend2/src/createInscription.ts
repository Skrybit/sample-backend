import * as btc from '@scure/btc-signer';
import * as ordinals from 'micro-ordinals';
import { hex } from '@scure/base';
import { detectContentType } from './utils/helpers';
import { getPrivateKey, getSchnorrPublicKey } from './utils/walletUtils';
import { DUST_LIMIT, BTC_SIGNER_NETWORK } from './config/network';

interface InscriptionResult {
  fileSize: number;
  tempPrivateKey: string;
  address: string;
  requiredAmount: string;
  createRevealTx: (txid: string, index: number, amount: bigint | number) => string;
}

interface InscriptionData {
  tags: {
    contentType: string;
  };
  body: Uint8Array;
}

export function createInscription(
  fileContent: Uint8Array,
  feeRate: number,
  recipientAddress: string,
  existingPrivKey?: string | Uint8Array | null,
): InscriptionResult {
  const privKeyObj = getPrivateKey(existingPrivKey);
  const { wif: privKeyWif } = privKeyObj;
  const pubKey = getSchnorrPublicKey(privKeyWif);

  const contentType = detectContentType(fileContent);

  const inscription: InscriptionData = {
    tags: { contentType },
    body: fileContent,
  };

  const customScripts = [ordinals.OutOrdinalReveal];

  const revealPayment = btc.p2tr(
    undefined,
    ordinals.p2tr_ord_reveal(pubKey, [inscription]),
    BTC_SIGNER_NETWORK,
    false,
    customScripts,
  );

  const witnessSize = fileContent.length + 100; // Add padding for witness overhead
  const totalSize = witnessSize + 200; // Add padding for transaction overhead

  const feeInSats = Math.ceil((totalSize * feeRate) / 4);
  console.log('feeInSats', feeInSats);

  const fee = BigInt(feeInSats);

  function createRevealTx(txid: string, index: number, amount: bigint | number): string {
    const tx = new btc.Transaction({ customScripts });
    const inputAmount = BigInt(amount);
    const outputAmount = inputAmount - fee;

    if (outputAmount < DUST_LIMIT) {
      throw new Error(`Output amount (${outputAmount} sats) below dust limit (${DUST_LIMIT} sats)`);
    }

    tx.addInput({
      ...revealPayment,
      txid,
      index,
      witnessUtxo: { script: revealPayment.script, amount: inputAmount },
    });

    // Send to provided recipient address
    tx.addOutputAddress(recipientAddress, outputAmount, BTC_SIGNER_NETWORK);

    tx.sign(privKeyObj.raw);
    tx.finalize();

    return hex.encode(tx.extract());
  }

  return {
    fileSize: fileContent.length,
    tempPrivateKey: privKeyObj.wif,
    address: revealPayment.address!,
    requiredAmount: fee.toString(),
    createRevealTx,
  };
}
