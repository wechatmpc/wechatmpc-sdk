import { Pumplend } from "../src";

import { Keypair,LAMPORTS_PER_SOL, PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  Connection,
  clusterApiUrl,
  TransactionInstruction,
  Struct,
  SendTransactionError,
} from "@solana/web3.js";
import {
mintTo,
TOKEN_PROGRAM_ID,
TOKEN_2022_PROGRAM_ID,
ASSOCIATED_TOKEN_PROGRAM_ID,
createAssociatedTokenAccount,
getAssociatedTokenAddressSync,
getAssociatedTokenAddress,
createInitializeMintInstruction,
getMintLen,
getOrCreateAssociatedTokenAccount,
getAccount,
createAssociatedTokenAccountInstruction

} from "@solana/spl-token";

import * as dotenv from 'dotenv';
dotenv.config();

import bs58 from 'bs58'
const connection = new Connection('https://api.devnet.solana.com');
const mainnet = new Connection('https://api.mainnet-beta.solana.com')
//init
jest.setTimeout(36000000)


const sk = process.env.SK?process.env.SK:"";
const kp = Keypair.fromSecretKey(bs58.decode(sk));
const testUser = kp.publicKey;
const mainnetToken = new PublicKey('Eq1Wrk62j2F2tLf9XfdBssYJVr5k8oLJx3pqEL1rpump')

const testControl = {
  dataFetch : false,
  pumpBuy : false,
  pumpSell: true
}


test("🍺 Test Data Fetch", async () => {
  if(testControl.dataFetch)
  {
    let lend = new Pumplend()
    console.log(
      "Get some data ::",
      await lend.tryGetUserStakingData(connection,testUser),
      await lend.tryGetSystemConfigData(connection),
      await lend.tryGetPoolStakingData(connection),
      lend.tryGetUserAccounts(testUser),
    )
    console.log("Mainnet info :: ",
      await mainnet.getAccountInfo(testUser)
    )
  
  }else{
    console.info("⚠Test Module Off")
  }

  
})




test("🍺 Test Pumpfun Buy Mainnet", async () => {
  if(testControl.pumpBuy)
  {
  /**
   * Test Pump Token Buy
   * 
   */
  let lend = new Pumplend()
  const associatedUser = getAssociatedTokenAddressSync(mainnetToken, testUser);
  const pumpTokenAccountTxn = createAssociatedTokenAccountInstruction(testUser,associatedUser,testUser,mainnetToken)
  let tx = new Transaction();
  // tx.add(pumpTokenAccountTxn);
  const pumpBuyTokenTx = await lend.pump_buy(
    mainnetToken,
    testUser,
    1e7,
    1e8
  );
  if(pumpBuyTokenTx)
  {
    tx.add(
      pumpBuyTokenTx
    )
    const simulate = await mainnet.simulateTransaction(
      tx,
      [kp],
      [kp.publicKey],
    );

    console.log("Pump token buy mainnet simulate ::",simulate);
    tx = lend.txTips(tx,simulate,500);
    console.log(
      "Pump token buy mainnet ::",tx,
      await mainnet.sendTransaction(tx,[kp])
    )
  }else{
    console.log(pumpBuyTokenTx)
  }
  }else{
    console.info("⚠Test Module Off")
  }

})

test("🍺 Test Pumpfun Sell Mainnet", async () => {
if(testControl.pumpSell)
{
  /**
 * Test Pump Token Sell
 */
let lend = new Pumplend()
const tx = new Transaction();
const pumpSellTokenTx = await lend.pump_sell(
  mainnetToken,
  testUser,
  1e7,
  1e6,
  
);
if(pumpSellTokenTx)
{
  tx.add(
    pumpSellTokenTx
  )
  console.log(
    "Pump token sell mainnet ::",
    await mainnet.sendTransaction(tx,[kp])
  )
}else{
  console.log(pumpSellTokenTx)
}
}


})