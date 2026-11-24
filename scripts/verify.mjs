import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { reader, read, finality, succeeded } from '../chain.js';
import deployment from '../deployment.json' with { type: 'json' };
import demo from '../evidence/demo-race.json' with { type: 'json' };

const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const { address } = deployment;
const code = await readFile('contracts/word_metro.py', 'utf8');
assert.equal(await reader.getChainId(), 61999);
assert.equal(await reader.getContractCode(address), code);
assert.equal(createHash('sha256').update(code).digest('hex'), deployment.sourceSha256);

const entries = [
  ['deployment', deployment.hash, true],
  ['opened', demo.opened, true, demo.host],
  ['missingStation', demo.missingStation, true, demo.player],
  ['duplicate', demo.duplicate, false, demo.player],
  ['certified', demo.certified, true, demo.player],
];
const transactions = await Promise.all(entries.map(async ([operation, hash, expected, signer]) => {
  const tx = await finality(hash);
  assert.equal(tx.statusName, 'FINALIZED');
  assert.equal(succeeded(tx), expected);
  if (!expected) assert.equal(tx.txExecutionResultName, 'ERROR');
  if (signer) {
    assert(same(tx.from_address, signer));
    assert(same(tx.to_address, address));
  }
  const leader = [tx.consensus_data?.leader_receipt].flat().find(record => record?.mode === 'leader');
  return {
    operation, hash, status: tx.statusName, execution: tx.txExecutionResultName,
    consensus: tx.result_name, from: tx.from_address,
    equivalenceOutputs: leader?.eq_outputs, error: expected ? undefined : tx.reason,
  };
}));
const id = BigInt(demo.raceId);
const [race, missing, certified, third] = await Promise.all([
  read(address, 'get_race', [id]).then(JSON.parse),
  read(address, 'get_attempt', [id, 1n]).then(JSON.parse),
  read(address, 'get_attempt', [id, 2n]).then(JSON.parse),
  read(address, 'get_attempt', [id, 3n]),
]);
assert.equal(race.phase, 'SOLVED');
assert(same(race.host, demo.host));
assert(same(race.winner, demo.player));
assert.equal(race.attempts, 2);
assert.equal(third, '');
assert.equal(missing.result, 'MISSING_STATION');
assert.deepEqual(missing.words.filter((_, i) => missing.pages[i] === 0), ['xold', 'xord']);
assert.equal(certified.result, 'CERTIFIED');
assert.deepEqual(certified.words, ['cold', 'cord', 'card', 'ward', 'warm']);
assert(certified.pages.every(Boolean));
const output = { chainId: 61999, address, sourceSha256: deployment.sourceSha256,
  transactions, latestFinal: { race, attempts: [missing, certified] } };
if (process.argv.includes('--write')) {
  await writeFile('evidence/studionet.json', JSON.stringify(output, (_, v) => typeof v === 'bigint' ? String(v) : v, 2) + '\n');
}
console.log('Verified source identity, five finalized transactions and latest-final race and attempts.');
