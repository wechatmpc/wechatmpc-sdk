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
const devnetToken = new PublicKey('Dtt6Zet8QaC4k27KF2NnpPRoomNysDZ3Wmom1cYSwpdd')

const testControl = {
  dataFetch : true,
  pumpBuy : false,
  pumpSell: false,
  pumpCreate:false,
  pumplendStake:false,
  pumplendWithdraw:false,
  pumplendBorrow : false,
  pumplendRepay : false,
  pumplendCloseInPump : false,
  pumplendMaxBorrowCul:false,
  pumplendMaxLeverageCul:false
}


test("🍺 Test Data Fetch", async () => {
  if(testControl.dataFetch)
  {
    let lend = new Pumplend()
    console.log(
      "Account information ::",kp.publicKey.toBase58()
    )
    console.log(
      "Get some data ::",
      await lend.tryGetUserStakingData(connection,testUser),
      await lend.tryGetSystemConfigData(connection),
      await lend.tryGetPoolStakingData(connection),
      lend.tryGetUserAccounts(testUser),
    )

    console.log("Token info :: ",
      await connection.getAccountInfo(
        getAssociatedTokenAddressSync(devnetToken,kp.publicKey)
      )
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
let tx = new Transaction();
const pumpSellTokenTx = await lend.pump_sell(
  mainnetToken,
  testUser,
  1e7,
  0,
  
);
if(pumpSellTokenTx)
{
  tx.add(
    pumpSellTokenTx
  )
  const simulate = await mainnet.simulateTransaction(
    tx,
    [kp],
    [kp.publicKey],
  );

  console.log("Pump token sell mainnet simulate ::",simulate);
  tx = lend.txTips(tx,simulate,500);

  console.log(
    "Pump token sell mainnet ::",tx,
    await mainnet.sendTransaction(tx,[kp])
  )
}else{
  console.log(pumpSellTokenTx)
}
}
})

test("🍺 Test Pumplend Stake", async () => {
  if(testControl.pumplendStake)
  {
    let lend = new Pumplend("devnet")
    console.log(

    );
    const stakeTx = await lend.stake(1e8,kp.publicKey,kp.publicKey);
    let tx = new Transaction();
    if(stakeTx)
      {
        tx.add(
          stakeTx
        )
        console.log(
          "Pumplend stake devnet ::",tx,
          await connection.sendTransaction(tx,[kp])
        )
      }else{
        console.log(stakeTx)
      }
    console.log(
      "Staking data ::",await lend.tryGetUserStakingData(connection,kp.publicKey)
    )
  
  }else{
    console.info("⚠Test Module Off")
  }
})


test("🍺 Test Pumplend Withdraws", async () => {
  if(testControl.pumplendWithdraw)
  {
    let lend = new Pumplend("devnet")
    const withdrawTx = await lend.withdraw(99999790,kp.publicKey,kp.publicKey);
    let tx = new Transaction();
    if(withdrawTx)
      {
        tx.add(
          withdrawTx
        )
        console.log(
          "Pumplend withdraws devnet ::",tx,
          await connection.sendTransaction(tx,[kp])
        )
      }else{
        console.log(withdrawTx)
      }
    console.log(
      "Withdraws data ::",await lend.tryGetUserStakingData(connection,kp.publicKey)
    )
  
  }else{
    console.info("⚠Test Module Off")
  }
})



test("🍺 Test Pumplend Borrow", async () => {
  if(testControl.pumplendBorrow)
  {
    let lend = new Pumplend("devnet")
    const borrowTx = await lend.borrow(5000000*1e6,devnetToken,kp.publicKey,kp.publicKey);
    let tx = new Transaction();
    const associatedUser = getAssociatedTokenAddressSync(devnetToken, kp.publicKey);
    const pumpTokenAccountTxn = createAssociatedTokenAccountInstruction(kp.publicKey,associatedUser,kp.publicKey,devnetToken)
    if(borrowTx)
      {
        // tx.add(
        //   pumpTokenAccountTxn
        // )
        tx.add(
          borrowTx
        )
        console.log(
          "Pumplend borrow devnet ::",tx,
          await connection.sendTransaction(tx,[kp])
        )
      }else{
        console.log(borrowTx)
      }
    console.log(
      "Borrow data ::",await lend.tryGetUserBorrowData(connection,devnetToken,kp.publicKey)
    )
  
  }else{
    console.info("⚠Test Module Off")
  }
})



test("🍺 Test Pumplend Repay", async () => {
  if(testControl.pumplendRepay)
  {
    let lend = new Pumplend("devnet")
    const borrowData = await lend.tryGetUserBorrowData(connection,devnetToken,kp.publicKey)
    console.log(
      "Borrow data ::",borrowData
    )
  

    if(!borrowData)
    {
      return false;
    }

    const repayTx = await lend.repay(Number(borrowData.borrowedAmount),devnetToken,kp.publicKey,kp.publicKey);
    let tx = new Transaction();
    if(repayTx)
      {
        tx.add(
          repayTx
        )
        console.log(
          "Pumplend repay devnet ::",tx,
          await connection.sendTransaction(tx,[kp])
        )
      }else{
        console.log(repayTx)
      }

  }else{
    console.info("⚠Test Module Off")
  }
})

test("🍺 Test Max Borrow", async () => {
  if(testControl.pumplendMaxBorrowCul)
  {
    let lend = new Pumplend()
    const borrowData =  await lend.tryGetUserBorrowData(connection,devnetToken,kp.publicKey);
    console.log("borrowData",borrowData)
    console.log(
      "Max Borrow ::",lend.pumplend_culcuate_max_borrow(
        borrowData
       ,
        1e16
        ,
        await lend.tryGetPoolStakingData(connection)
      )
    )
  }else{
    console.info("⚠Test Module Off")
  }
})

test("🍺 Test Max Leverage", async () => {
  if(testControl.pumplendMaxLeverageCul)
  {
    let lend = new Pumplend()
    const borrowData =  await lend.tryGetUserBorrowData(connection,devnetToken,kp.publicKey);
    const curve = await lend.tryGetPumpTokenCurveData(mainnet,mainnetToken)
    console.log("borrowData",borrowData)
    console.log(
      "Max Leverage ::",lend.pumplend_culcuate_max_leverage(
        borrowData
       ,
        1e9
        ,
        curve
      )
    )
  }else{
    console.info("⚠Test Module Off")
  }
})