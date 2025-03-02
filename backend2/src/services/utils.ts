import { RunResult } from 'better-sqlite3';

type UpdateInscriptionPaymentFn = (status: string, id: number) => RunResult;

export async function checkPaymentToAddress(
  inscriptionId: number,
  address: string,
  amountInSats: number,
  updateInscriptionPayment: UpdateInscriptionPaymentFn,
): Promise<boolean> {
  console.log(`Checking ${address} for ${amountInSats}`);

  // Placeholder for actual RPC check implementation
  const paymentReceived = false;

  if (paymentReceived) {
    updateInscriptionPayment('paid', inscriptionId);
  }

  return paymentReceived;
}
