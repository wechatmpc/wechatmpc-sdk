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
test("🍺 Test Pumplend SDK", async () => {
  console.log("Test User ::",testUser)
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

  const associatedUser = getAssociatedTokenAddressSync(mainnetToken, testUser);
  const pumpTokenAccountTxn = createAssociatedTokenAccountInstruction(testUser,associatedUser,testUser,mainnetToken)
  let tx = new Transaction();
  // tx.add(pumpTokenAccountTxn);
  const pumpBuyTokenTx =     await lend.pump_buy(
    mainnetToken,
    testUser,
    1000000,
    100000000
  );
  if(pumpBuyTokenTx)
  {
    tx.add(
      pumpBuyTokenTx
    )
    console.log(
      await mainnet.sendTransaction(tx,[kp])
    )
  }else{
    console.log(pumpBuyTokenTx)
  }

})