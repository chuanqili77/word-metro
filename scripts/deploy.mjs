import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createAccount, createClient } from 'genlayer-js';
import { chain, reader, finality, succeeded, read, transactionFees, fundTestWallet } from '../chain.js';

const code = await readFile(new URL('../contracts/word_metro.py', import.meta.url), 'utf8');
assert.equal(await reader.getChainId(), 61999);
assert.equal(await reader.getGasPrice(), 0n);
const signer = createClient({ chain, account: createAccount() });
if (!process.argv[2]) await fundTestWallet(signer.account.address);
const hash = process.argv[2] ?? await signer.deployContract({ code, args: [], leaderOnly: false, fees: await transactionFees() });
console.log('Deployment', hash);
const tx = await finality(hash);
console.log(tx.statusName, tx.txExecutionResultName);
assert(succeeded(tx), JSON.stringify(tx, (_, v) => typeof v === 'bigint' ? String(v) : v));
const address = tx.data.contract_address;
assert.equal(await reader.getContractCode(address), code);
assert.equal(Number(await read(address, 'race_count')), 0);
await writeFile('deployment.json', JSON.stringify({
  address, hash, chainId: 61999, status: tx.statusName, execution: tx.txExecutionResultName,
  sourceSha256: createHash('sha256').update(code).digest('hex'),
}, null, 2) + '\n');
console.log(address);
