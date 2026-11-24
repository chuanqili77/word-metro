# Word Metro

Word Metro is an open-book word ladder race for language clubs and small groups. Hosts establish a four-letter route and a move budget. Players change one letter per stop and race to produce the first route certified by independent GenLayer validators.

[Play on Stable Studionet](https://chuanqili77.github.io/word-metro/) · [Deployed contract](https://explorer-studio.genlayer.com/address/0x4314CaCd2721849d4b94709Dc312B30E70B24A48) · [Deployment record](deployment.json)

## Play

- Visitors can find a race by number and inspect its finalized route receipts.
- Hosts connect a wallet, set the endpoints and move limit, then publish and share the race link. Only the host may close an open race.
- Players edit a route at the platform, review the signing intent and submit. The first certified route wins. A route with missing Wiktionary entries is recorded and leaves the race open.

Use MetaMask or OKX via the wallet desk, or create in-memory Demo / Test Wallets and request Studionet faucet funds. Test wallets disappear on tab reload. Chain ID 61999 is required. There are no prizes or transferable rewards.

## Consensus and storage

The contract locks the race parameters after creation. A route uses unique four-letter lowercase ASCII terms, with exactly one changed character per hop. The lexicon is the English Wiktionary site's main article namespace. Any existing exact title qualifies, including entries describing other languages. Every validator independently fetches one MediaWiki query and agrees via strict equality on the ordered page IDs. Zero means the API explicitly reported a missing title. Unexpected, incomplete or unavailable data cannot be counted as a missing title. A rejected lexical route is distinct from a reverted transaction.

On-chain race states are OPEN, SOLVED and CLOSED. The race stores the host, endpoints, page IDs, move limit and winner. Each receipt records the signer, words, corresponding page IDs and score outcome. A repeated route from the same signer is rejected. Successful writes are followed by a latest-final read. Entries and winning routes are public, and server-side dictionary entries can change after a race.

## Develop and reproduce

Use Node.js 24 and Python 3. SDK and dependency versions are pinned in the npm lockfile.

```sh
npm ci
npm test
npm run build
python -m pip install genvm-linter==0.11.0
genvm-lint check contracts/word_metro.py
node scripts/deploy.mjs 0xa9f89217b1e5f425e6f7c51bc526beea2cee68f0cf8d33ac8d2e3e4e21501f8f
```

Passing the deployment hash checks the existing deployment and compares the downloaded contract source byte for byte. See [lint evidence](evidence/genvm-lint.txt) and [deployment failures](evidence/deployment-failures.json).

## Verified race

[Open race 1](https://chuanqili77.github.io/word-metro/?race=1). Two browser Demo wallets signed on Studionet. XOLD and XORD were missing, so the first route was recorded without advancing the race. The exact replay reverted and added no receipt. COLD → CORD → CARD → WARD → WARM then certified and locked the winner.

Run `node scripts/verify.mjs` to recheck the source, the deployment, the four signed race transactions and latest-final state. See the [readback and receipts](evidence/studionet.json) and the [viewport test notes](evidence/VIEWPORTS.md). Live extension signing and physical-device testing were outside the browser evidence.
