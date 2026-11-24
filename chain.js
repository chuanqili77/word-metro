import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

export const rpc = 'https://studio.genlayer.com/api';
export const chain = { ...studionet, rpcUrls: { default: { http: [rpc] } } };
export const reader = createClient({ chain });
export const explorer = 'https://explorer-studio.genlayer.com';
export const read = (address, functionName, args = []) => reader.readContract({
  address, functionName, args, transactionHashVariant: 'latest-final',
});
export async function finality(hash, progress = () => {}) {
  for (let i = 0; i < 180; i++) {
    const tx = await reader.getTransaction({ hash }).catch(() => null);
    if (tx) {
      const statusName = tx.statusName ?? ({ 7: 'FINALIZED', 8: 'CANCELED' }[tx.status] || tx.status);
      progress(statusName);
      if (['FINALIZED', 'UNDETERMINED', 'CANCELED', 'CANCELLED'].includes(statusName)) {
        const receipts = [tx.consensus_data?.leader_receipt].flat();
        const leader = receipts.find(receipt => receipt?.mode === 'leader') ?? receipts[0];
        return { ...tx, statusName, txExecutionResultName: leader?.execution_result ?? tx.txExecutionResultName, reason: leader?.result?.payload };
      }
    }
    await new Promise(resolve => setTimeout(resolve, 3500));
  }
  throw new Error('Finality is still unconfirmed. Use the transaction link to track this submission.');
}
export const succeeded = tx => tx.statusName === 'FINALIZED' && (tx.result_name === 'MAJORITY_AGREE' || [6, 'MAJORITY_AGREE'].includes(tx.result)) && tx.txExecutionResultName === 'SUCCESS';

export async function transactionFees() {
  const { distribution, feeValue } = await reader.estimateTransactionFees();
  return { distribution, feeValue };
}
export async function fundTestWallet(address) {
  return reader.request({ method: 'sim_fundAccount', params: [address, '1000000000000000000'] });
}
