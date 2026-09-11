# Deploying Levee.sol via Remix

## 1. Compile

1. Open [remix.ethereum.org](https://remix.ethereum.org).
2. Create a new file `Levee.sol` under `contracts/` and paste in the contents of this repo's `contracts/Levee.sol`.
3. Open the **Solidity Compiler** tab.
   - Compiler version: **0.8.20** (or any 0.8.x that satisfies `^0.8.20` — Remix defaults to the latest 0.8 patch, that's fine).
   - EVM version: default (leave as `default`/`paris`, no special setting needed for Base Sepolia).
   - Leave optimization off (not required for a contract this size).
4. Click **Compile Levee.sol**. Confirm no errors.

## 2. Deploy

1. Open the **Deploy & Run Transactions** tab.
2. Environment: select **Injected Provider - MetaMask**.
3. In MetaMask, switch your network to **Base Sepolia** (chain ID 84532). Add it first if it's not already configured (RPC: `https://sepolia.base.org`, or use the "Add network" prompt Remix/MetaMask offers).
4. Make sure your wallet has Base Sepolia testnet ETH (use a faucet if needed) — you'll need a small amount for deploy gas and for the deposit in the test transactions below.
5. Contract dropdown: select **Levee**.
6. Click **Deploy**, confirm the transaction in MetaMask, and wait for it to mine.
7. Once deployed, the contract instance appears under **Deployed Contracts** in Remix — expand it to see all functions.

## 3. Test transactions

These three calls prove deposit → commit → blocked spend → release all work correctly.

### Test 1 — Deposit and commit

1. In the deployed contract panel, set the **Value** field at the top (next to the Environment dropdown) to `0.01` and units to `ether`.
2. Call `deposit()`. Confirm in MetaMask.
3. Call `balanceOf(<your address>)` — should return `10000000000000000` (0.01 ETH in wei).
4. Call `commit` with:
   - `amount`: `6000000000000000` (0.006 ETH)
   - `unlockDate`: a Unix timestamp ~5 minutes in the future (e.g. current time + 300 — get current time from [epochconverter.com](https://www.epochconverter.com) or `Date.now()/1000` in a browser console)
   - `label`: `"rent"`
5. Confirm in MetaMask. Check the transaction logs for the `Committed` event.
6. Call `freeBalance(<your address>)` — should return `4000000000000000` (0.004 ETH), confirming 0.006 is locked.

### Test 2 — Spend blocked by commitment

1. Call `canSpend(<your address>, 5000000000000000)` (0.005 ETH — more than free balance).
   - Should return `allowed = false`, `blockingId = 0`, `label = "rent"`, and the `unlockDate` you set.
2. Call `spendFree` with `amount = 5000000000000000` and `to = <any address, e.g. your own>`.
   - Should **revert** with `ExceedsFreeBalance()`.
3. Call `spendFree` with `amount = 2000000000000000` (0.002 ETH, within free balance) and `to = <your address>`.
   - Should **succeed** and emit a `Spent` event. Check `freeBalance` dropped to `2000000000000000`.

### Test 3 — Release after unlock

1. Before the unlock date passes, call `release(0)` — should **revert** with `NotYetUnlocked()`.
2. Wait until the unlock timestamp has passed (a few minutes, per the date you chose).
3. Call `release(0)` again — should **succeed**, emit a `Released` event, and `committedOf(<your address>)` should drop back to `0`.
4. Call `freeBalance(<your address>)` — should now equal `balanceOf(<your address>)`, confirming the 0.006 ETH is unlocked and spendable.
