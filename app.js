import { createAccount, createClient } from 'genlayer-js';
import { formatEther } from 'viem';
import deployment from './deployment.json';
import { chain, reader, rpc, read, finality, succeeded, explorer, transactionFees, fundTestWallet } from './chain.js';
import './style.css';

const $ = id => document.getElementById(id);
const address = deployment.address;
const providers = new Map();
const demos = [];
let wallet;
let race;
let raceId;
let busy = false;
let readVersion = 0;

function node(tag, text, parent) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
function message(text, hash) {
  $('message').textContent = text;
  if (hash) $('tx').href = explorer + '/transactions/' + hash;
  $('tx').hidden = !hash;
}
function permissions() {
  const enabled = !busy && wallet?.network === 61999;
  const host = race && wallet && same(race.host, wallet.address);
  $('fund').hidden = !wallet?.account;
  $('publish').disabled = !enabled;
  $('submit-route').disabled = !enabled || !race || host || race.phase !== 'OPEN';
  $('close').hidden = !(host && race.phase === 'OPEN');
  $('close').disabled = !enabled;
  for (const id of ['reload', 'race-id', 'demo', 'disconnect', 'reset', 'switch', 'demo-list', 'fund'])
    $(id).disabled = busy;
  document.querySelectorAll('[data-wallet], #find button, #races button').forEach(button => button.disabled = busy);
  $('rule').textContent = host ? 'Hosts cannot compete in their own race.' :
    enabled ? 'Verification can lock this race for your wallet.' : 'Connect a player wallet on Studionet to submit.';
}

async function syncWallet() {
  const current = wallet;
  if (!current) {
    $('identity').textContent = 'No wallet connected.';
    $('switch').hidden = true;
    permissions();
    return;
  }
  try {
    if (current.provider) {
      const [accounts, network] = await Promise.all([
        current.provider.request({ method: 'eth_accounts' }),
        current.provider.request({ method: 'eth_chainId' }),
      ]);
      if (wallet !== current) return;
      if (!accounts.length) return disconnect();
      current.address = accounts[0];
      current.network = Number(network);
    }
    $('switch').hidden = !current.provider || current.network === 61999;
    const label = current.name + ' · ' + current.address + ' · Chain ' + current.network;
    $('identity').textContent = label;
    permissions();
    if (current.network === 61999) {
      const balance = await reader.getBalance({ address: current.address });
      if (wallet === current) $('identity').textContent = label + ' · ' + formatEther(balance) + ' test GEN';
    }
  } catch {
    if (wallet !== current) return;
    current.network = 0;
    $('identity').textContent = 'Wallet or RPC unavailable. Reconnect to continue.';
    permissions();
  }
}
const accountChange = () => { void syncWallet(); };
function disconnect() {
  if (wallet?.provider) {
    for (const event of ['accountsChanged', 'chainChanged']) wallet.provider.removeListener?.(event, accountChange);
    wallet.provider.removeListener?.('disconnect', disconnect);
  }
  wallet = undefined;
  $('demo-list').value = '';
  void syncWallet();
}
window.addEventListener('eip6963:announceProvider', event => {
  const { info, provider } = event.detail;
  providers.set(info.rdns, provider);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
for (const button of document.querySelectorAll('[data-wallet]')) button.onclick = async () => {
  const name = button.dataset.wallet;
  const provider = name === 'MetaMask'
    ? providers.get('io.metamask') || (window.ethereum?.isMetaMask ? window.ethereum : undefined)
    : providers.get('com.okex.wallet') || providers.get('com.okx.wallet') || window.okxwallet;
  if (!provider) return message(name + ' was not found in this browser.');
  try {
    await provider.request({ method: 'eth_requestAccounts' });
    disconnect();
    wallet = { provider, name };
    for (const event of ['accountsChanged', 'chainChanged']) provider.on?.(event, accountChange);
    provider.on?.('disconnect', disconnect);
    await syncWallet();
  } catch { message('Wallet connection was declined or unavailable.'); }
};
$('switch').onclick = async () => {
  const provider = wallet?.provider;
  if (!provider) return;
  const chainId = '0xf22f';
  try {
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
    catch (error) {
      if (error.code !== 4902) throw error;
      await provider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId, chainName: 'Stable Studionet', rpcUrls: [rpc],
        nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }, blockExplorerUrls: [explorer],
      }] });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    }
    await syncWallet();
  } catch { message('The network change was declined or unavailable.'); }
};
function selectDemo(index) {
  disconnect();
  const account = demos[index];
  wallet = { account, address: account.address, network: 61999, name: 'Demo / Test Wallet ' + (index + 1) };
  $('demo-list').value = index;
  void syncWallet();
}
$('demo').onclick = () => {
  demos.push(createAccount());
  const index = demos.length - 1;
  const choice = node('option', 'Demo wallet ' + (index + 1), $('demo-list'));
  choice.value = index;
  $('demo-list').hidden = false;
  selectDemo(index);
};
$('demo-list').onchange = () => { if ($('demo-list').value !== '') selectDemo(Number($('demo-list').value)); };
$('disconnect').onclick = disconnect;
$('fund').onclick = async () => {
  const current = wallet;
  if (!current?.account || !confirm('Request 1 test GEN from the Studionet faucet for ' + current.address + '?')) return;
  try {
    await fundTestWallet(current.address);
    await syncWallet();
    message('Studionet faucet request completed. Check your displayed balance.');
  } catch { message('Studionet faucet was unavailable. Try again later.'); }
};
$('reset').onclick = () => {
  if (!confirm('Discard all temporary Demo wallet keys in this tab?')) return;
  if (wallet?.account) disconnect();
  demos.length = 0;
  $('demo-list').replaceChildren();
  $('demo-list').hidden = true;
};
$('wallet-toggle').onclick = () => {
  $('wallet-panel').hidden = !$('wallet-panel').hidden;
  $('wallet-toggle').setAttribute('aria-expanded', String(!$('wallet-panel').hidden));
};

function renderStations(words = []) {
  $('stations').replaceChildren();
  words.forEach((word, i) => {
    const label = node('label', 'Stop ' + (i + 1), $('stations'));
    const input = node('input', '', label);
    input.value = word;
    input.maxLength = 4;
    input.pattern = '[A-Za-z]{4}';
    input.required = true;
    input.readOnly = i === 0 || i === words.length - 1;
  });
  $('add').disabled = words.length >= race.steps + 1;
  $('remove').disabled = words.length <= 2;
}
const route = () => [...$('stations').querySelectorAll('input')].map(input => input.value.toLowerCase());
$('add').onclick = () => { const words = route(); words.splice(-1, 0, ''); renderStations(words); };
$('remove').onclick = () => { const words = route(); words.splice(-2, 1); renderStations(words); };
async function refresh(id, offset = 0) {
  const version = ++readVersion;
  const count = Number(await read(address, 'race_count'));
  const selected = id ?? count;
  const raw = selected > 0 ? await read(address, 'get_race', [BigInt(selected)]) : '';
  const result = raw ? JSON.parse(raw) : null;
  const end = result ? Math.max(0, result.attempts - offset) : 0;
  const rows = await Promise.all(Array.from({ length: Math.min(end, 10) }, async (_, i) => {
    const number = end - i;
    return { number, ...JSON.parse(await read(address, 'get_attempt', [BigInt(selected), BigInt(number)])) };
  }));
  if (version !== readVersion) return;
  const keepDraft = raceId === selected && race?.phase === 'OPEN' && result?.phase === 'OPEN';
  raceId = selected;
  race = result;
  $('races').replaceChildren();
  for (let number = count; number >= Math.max(1, count - 4); number--) {
    const button = node('button', 'Race ' + number, $('races'));
    button.onclick = () => browse(number);
  }
  $('race').replaceChildren();
  $('history').replaceChildren();
  $('route').hidden = result?.phase !== 'OPEN';
  if (result) {
    $('race-id').value = selected;
    $('line-label').textContent = result.start.toUpperCase() + ' → ' + result.finish.toUpperCase();
    node('h3', 'Race ' + selected + ' · ' + result.phase, $('race'));
    node('p', 'Host ' + result.host + ' · ' + result.steps + ' moves available', $('race'));
    node('p', result.winner ? 'Winner ' + result.winner : result.phase === 'CLOSED' ? 'The host closed the race.' : 'First verified route wins.', $('race'));
    const link = node('a', 'Shareable race link', $('race'));
    link.href = '?race=' + selected;
    if (!keepDraft) renderStations([result.start, '', result.finish]);
    node('h3', 'Route receipts · ' + result.attempts, $('history'));
    for (const row of rows) {
      const details = node('details', '', $('history'));
      node('summary', '#' + row.number + ' · ' + (row.result === 'CERTIFIED' ? 'Verified' : 'Missing station'), details);
      node('p', 'Submitted by ' + row.player, details);
      const list = node('ul', '', details);
      row.words.forEach((word, i) => {
        const item = node('li', word.toUpperCase() + (row.pages[i] ? ' · ' : ' · no matching Wiktionary page'), list);
        if (row.pages[i]) {
          const source = node('a', 'Page ' + row.pages[i], item);
          source.href = 'https://en.wiktionary.org/?curid=' + row.pages[i];
        }
      });
    }
    if (end > 10) node('button', 'Older routes', $('history')).onclick = () => browse(selected, offset + 10);
    if (offset) node('button', 'Newer routes', $('history')).onclick = () => browse(selected, Math.max(0, offset - 10));
  } else {
    $('line-label').textContent = 'Pick a race below';
    node('p', count ? 'Race not found.' : 'No races yet. Open the first line.', $('race'));
  }
  permissions();
}
function browse(id, offset) {
  return refresh(id, offset).catch(error => message('Finalized state could not be read. ' + error.message));
}
$('reload').onclick = () => browse(raceId || undefined);
$('find').onsubmit = event => { event.preventDefault(); void browse($('race-id').valueAsNumber); };
$('contract').href = explorer + '/address/' + address;

async function transact(description, method, args, after, outcome = () => '') {
  if (busy || !wallet) return;
  const chosen = wallet;
  const signer = chosen.address;
  if (chosen.network !== 61999) return message('Switch to Stable Studionet first.');
  busy = true;
  permissions();
  let hash;
  try {
    const fees = await transactionFees();
    if (!confirm(description + '\n' + signer + '\nStable Studionet · 61999\nFee deposit: ' + formatEther(fees.feeValue) + ' test GEN')) return;
    if (wallet !== chosen) throw new Error('Wallet changed before signing.');
    if (chosen.provider) {
      const [accounts, id] = await Promise.all([
        chosen.provider.request({ method: 'eth_accounts' }), chosen.provider.request({ method: 'eth_chainId' }),
      ]);
      if (wallet !== chosen || Number(id) !== 61999 || !same(accounts[0], signer)) throw new Error('Wallet identity or network changed. Confirm the new identity and retry.');
    }
    message('Waiting for signature…');
    const client = createClient({ chain, account: chosen.account || signer, provider: chosen.provider });
    hash = await client.writeContract({ address, functionName: method, args, value: 0n, leaderOnly: false, fees });
    message('Submitted. Waiting for consensus…', hash);
    const tx = await finality(hash, status => message('Consensus status · ' + status, hash));
    if (!succeeded(tx)) {
      const reason = method === 'open_race' ? 'Check that both stations exist and the move limit is valid. The lexicon may also be temporarily unavailable.' :
        'Refresh the race and check eligibility, route rules and previous submissions before retrying.';
      return message('Transaction did not execute successfully. ' + tx.statusName + ' · ' + (tx.txExecutionResultName || 'unknown') + '. ' + (typeof tx.reason === 'string' && tx.reason ? tx.reason : reason), hash);
    }
    try {
      await refresh(after);
      message('Finalized · Execution succeeded. ' + outcome(), hash);
    } catch {
      message('Execution succeeded. Finalized data could not be refreshed. Use Refresh before taking another action.', hash);
    }
  } catch (error) {
    message(hash ? error.message : error.code === 4001 ? 'Signature declined.' : 'Could not submit. ' + (error.shortMessage || error.message), hash);
  } finally {
    busy = false;
    permissions();
    void syncWallet();
  }
}
$('open').onsubmit = event => {
  event.preventDefault();
  const values = new FormData(event.target);
  void transact('Publish a new word race', 'open_race', [values.get('start').toLowerCase(), values.get('finish').toLowerCase(), BigInt(values.get('steps'))]);
};
$('route').onsubmit = event => {
  event.preventDefault();
  const words = route();
  if (new Set(words).size !== words.length || words.slice(1).some((word, i) =>
    [...word].filter((letter, j) => letter !== words[i][j]).length !== 1)) {
    return message('Change exactly one letter per move and avoid reusing stations.');
  }
  void transact('Verify ' + words.join(' → '), 'submit_route', [BigInt(raceId), words], raceId,
    () => race.phase === 'SOLVED' ? 'This race has a winner.' : 'The race remains open. Review the station checks.');
};
$('close').onclick = () => transact('Close race ' + raceId, 'close_race', [BigInt(raceId)], raceId);
permissions();
const initial = Number(new URLSearchParams(location.search).get('race'));
void browse(Number.isSafeInteger(initial) && initial > 0 ? initial : undefined);
