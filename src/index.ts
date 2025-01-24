
/**
 * Pumplend :: Major class of pumplend SDK
 */

import { Keypair,LAMPORTS_PER_SOL, PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  Connection,
  clusterApiUrl,
  TransactionInstruction,
  Struct,
  SendTransactionError,
  SimulatedTransactionResponse,
  ComputeBudgetProgram
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
import {
  LIQUIDITY_STATE_LAYOUT_V4,
  Liquidity,
  LiquidityPoolKeysV4,
  MARKET_STATE_LAYOUT_V3,
  Market,
  SPL_MINT_LAYOUT,
  DEVNET_PROGRAM_ID
} from '@raydium-io/raydium-sdk'
import { createHash } from 'crypto';
import { serialize } from "borsh";

// @ts-ignore
import BN from 'bn.js';

//Setting 
const curveBaseToken = BigInt('1073000000000000')
const curveBaseSol = BigInt('30000000000')

//Utils
function sighash(namespace: string, name: string): Buffer {
  const preimage = `${namespace}:${name}`;
  const hash = createHash('sha256'); 
  hash.update(preimage);
  const fullHash = hash.digest(); 
  return fullHash.slice(0, 8);  
}

type Reserves = {
  solReserves: bigint; // SOL reserves in the pool
  tokenReserves: bigint; // Token reserves in the pool
  realTokenReserves: bigint; // Real token reserves in the pool
};

function loopMaxBuy(
  amount : bigint,
  curve:Reserves,
  userBorrowDataDetails:any,
  remaining_collateral_amount:bigint
){
  let finalSol = amount;
  let finalToken = BigInt(0);
  let lastBorrow = amount;
  while(true)
  {

    //Buy
    const estimate = pumpGetAmountsOut(lastBorrow,curve)
    curve = estimate.newCurve;
    finalToken += estimate.dToken;
    lastBorrow = estimate.dToken

    //Borrow 
    const newBorrowToken = lastBorrow;
    const borrowedToken =userBorrowDataDetails.collateralAmount;
    const borrowedSol =userBorrowDataDetails.borrowedAmount; 

    const oldToken = curveBaseToken-borrowedToken;
    const oldSol = curveBaseSol+borrowedSol;

    const newToken = oldToken-newBorrowToken
    const newSol = (oldSol*oldToken)/(newToken)
    const dSol = newSol - oldSol;
    const fSol = BigInt((Number(dSol)*0.7 ).toFixed(0))
    finalSol+=fSol;
    userBorrowDataDetails.collateralAmount+=newBorrowToken;
    userBorrowDataDetails.borrowedAmount+=fSol;
    lastBorrow = fSol

    if(lastBorrow <=remaining_collateral_amount )
      {
        return {
          sol:finalSol, 
          token:finalToken
        }
      }
  }
}
function pumpGetAmountsOut(amount:bigint,curve:Reserves)
{
 
  if(!curve)
    {
      curve = {
        solReserves:curveBaseSol,
        tokenReserves:curveBaseToken,
        realTokenReserves:BigInt(0),
      }
  }
  const oldToken = curve.tokenReserves;
  const oldSol = curve.solReserves;
  const oldRealToken = curve.realTokenReserves;
  
  const newSol = oldSol+amount
  const newToken = (oldSol*BigInt(oldToken))/(newSol)
  const dToken = oldToken - newToken;
  const newRealToken = oldRealToken+ dToken

  return {
    dToken,
    newCurve:{
      solReserves : newSol,
      tokenReserves:newToken,
      realTokenReserves:newRealToken
    }
  };
}


// Placeholder function for `buy_token_to_sol`, you need to implement its logic
function buyTokenToSol(
  baseVirtualSolReserves: bigint,
  baseVirtualTokenReserves: bigint,
  userCollateralAmount: bigint,
  userBorrowedAmount: bigint,
  poolVirtualSolReserves: bigint,
  poolVirtualTokenReserves: bigint,
  solInputAmount: bigint
): { tokenAmountOut: bigint; newBorrowAmount: bigint } {
  // Calculate effective SOL input after fees
  const effectiveSolInput = (solInputAmount * BigInt(99)) / BigInt(100);
  console.log("sol_input_amount:", effectiveSolInput.toString());

  // Calculate virtual token reserves
  const virtualTokenReserves =
    (poolVirtualSolReserves * poolVirtualTokenReserves) /
    (poolVirtualSolReserves + effectiveSolInput);

  const tokenAmountOut = poolVirtualTokenReserves - virtualTokenReserves;
  // console.log("Buy Token To Sol: token_output_amount:", tokenAmountOut.toString());

  // Calculate virtual SOL reserves
  const virtualSolReserves =
    (baseVirtualSolReserves * baseVirtualTokenReserves) /
    (baseVirtualTokenReserves + userCollateralAmount + tokenAmountOut);

  // console.log("virtual_sol_reserves:", virtualSolReserves.toString());
  // console.log("base_virtual_sol_reserves:", baseVirtualSolReserves.toString());
  // console.log("base_virtual_token_reserves:", baseVirtualTokenReserves.toString());

  // Calculate SOL delta and new borrow amount
  const solDelta = baseVirtualSolReserves - virtualSolReserves;
  const totalBorrowedAmount = (solDelta * BigInt(7)) / BigInt(10);
  // console.log("total_borrowed_amount:", totalBorrowedAmount.toString());
  // console.log("user_borrowed_amount:", userBorrowedAmount.toString());

  const newBorrowAmount = totalBorrowedAmount - userBorrowedAmount;
  // console.log("new_borrow_amount:", newBorrowAmount.toString());

  return { tokenAmountOut, newBorrowAmount };
}

function getMaxBorrowAmountByAMM(
  reserves: Reserves,
  baseVirtualSolReserves: bigint,
  baseVirtualTokenReserves: bigint,
  userBorrowedAmount: bigint,
  userCollateralAmount: bigint,
  collateralAmount: bigint,
  remaining_collateral_amount:bigint
) {

  try{


  let tokenAmountIn = BigInt(0);
  let tokenAmountOut = BigInt(0);

  let userBorrowed = userBorrowedAmount;
  let userCollateral = userCollateralAmount;
  let poolVirtualSolReserves = reserves.solReserves;
  let poolVirtualTokenReserves = reserves.tokenReserves;
  let solInputAmount = collateralAmount;

  for (let i = 0; i < 24; i++) {
    const { tokenAmountOut: _tokenAmountOut, newBorrowAmount: _newBorrowAmount } =
      buyTokenToSol(
        baseVirtualSolReserves,
        baseVirtualTokenReserves,
        userCollateral,
        userBorrowed,
        poolVirtualSolReserves,
        poolVirtualTokenReserves,
        solInputAmount
      );

    tokenAmountIn += solInputAmount;
    tokenAmountOut += _tokenAmountOut;

    if (_newBorrowAmount < remaining_collateral_amount) {
      break;
    }

    if (reserves.realTokenReserves < tokenAmountOut) {
      throw new Error("Reach max buyable");
    }

    userCollateral += _tokenAmountOut;
    userBorrowed += _newBorrowAmount;
    poolVirtualSolReserves += solInputAmount;
    poolVirtualTokenReserves -= _tokenAmountOut;
    solInputAmount = _newBorrowAmount;
  }

    return {
    sol:tokenAmountIn, 
    token:tokenAmountOut
  };
    }catch(e:any)
      
    {
      console.error(e)
      return false;
    }
}


async function raydiumFormatAmmKeysById(id: PublicKey, connection: Connection): Promise<LiquidityPoolKeysV4> {
  const account = await connection.getAccountInfo(id)
  if (account === null) throw Error(' get id info error ')
  const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data)

  const marketId = info.marketId
  const marketAccount = await connection.getAccountInfo(marketId)
  if (marketAccount === null) throw Error(' get market info error')
  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

  const lpMint = info.lpMint
  const lpMintAccount = await connection.getAccountInfo(lpMint)
  if (lpMintAccount === null) throw Error(' get lp mint info error')
  const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data)

  return {
      id: new PublicKey(id),
      baseMint: info.baseMint,
      quoteMint: info.quoteMint,
      lpMint: info.lpMint,
      baseDecimals: info.baseDecimal.toNumber(),
      quoteDecimals: info.quoteDecimal.toNumber(),
      lpDecimals: lpMintInfo.decimals,
      version: 4,
      programId: account.owner,
      authority: Liquidity.getAssociatedAuthority({ programId: account.owner }).publicKey,
      openOrders: info.openOrders,
      targetOrders: info.targetOrders,
      baseVault: info.baseVault,
      quoteVault: info.quoteVault,
      withdrawQueue: info.withdrawQueue,
      lpVault: info.lpVault,
      marketVersion: 3,
      marketProgramId: info.marketProgramId,
      marketId: info.marketId,
      marketAuthority: Market.getAssociatedAuthority({ programId: info.marketProgramId, marketId: info.marketId }).publicKey,
      marketBaseVault: marketInfo.baseVault,
      marketQuoteVault: marketInfo.quoteVault,
      marketBids: marketInfo.bids,
      marketAsks: marketInfo.asks,
      marketEventQueue: marketInfo.eventQueue,
      lookupTableAccount: PublicKey.default,
  }
  }

//Args class
class BaseArgs extends Struct {
  amount: BN;
  
  constructor(fields: { amount: BN }) {
      super(fields);
      this.amount = fields.amount;
  }
}
const BaseArgsSchema = new Map([
  [BaseArgs, { kind: "struct", fields: [["amount", "u64"]] }]
]);


class PumpBuyArgs extends Struct {
  amount: BN;
  maxSolCost : BN;
  constructor(fields: { amount: BN , maxSolCost : BN }) {
      super(fields);
      this.amount = fields.amount;
      this.maxSolCost = fields.maxSolCost;
  }
}
const PumpBuyArgsSchema = new Map([
  [PumpBuyArgs, { kind: "struct", fields: [
    ["amount", "u64"],
    ["maxSolCost","u64"]
  ] }]
]);



//Major pumplend class
export class Pumplend {
  wsol =  new PublicKey("So11111111111111111111111111111111111111112")
  pumpLendProgramId = new PublicKey("6m6ixFjRGq7HYAPsu8YtyEauJm8EE8pzA3mqESt5cGYf");
  pumpLendVault = new PublicKey("zzntY4AtoZhQE8UnfUoiR4HKK2iv8wjW4fHVTCzKnn6")
  pumpfunProgramId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  network = "mainnet"

  systemAccounts = {
    systemConfig:new PublicKey(0),
    poolStakingData:new PublicKey(0),
    poolTokenAuthority:new PublicKey(0),
    poolTokenAuthorityWsolAccount:new PublicKey(0),
  }

  raydiumAccounts = {
    ammProgram : new PublicKey("HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8"),
    
  }
  public constructor(network ?: string,pumpLendProgramId?:PublicKey,pumpfunProgramId?:PublicKey,pumpLendVault?:PublicKey) {
    if(pumpLendProgramId)
    {
      this.pumpLendProgramId = pumpLendProgramId
    }
      
    if(pumpfunProgramId)
      {
        this.pumpfunProgramId = pumpfunProgramId
      }
    if(pumpLendVault)
    {
      this.pumpLendVault = pumpLendVault
    }
    if(network)
    {
      this.network = network;
    }
    const accs = this.tryGetSystemAccounts()
    this.systemAccounts.systemConfig = accs.systemConfig;
    this.systemAccounts.poolStakingData = accs.poolStakingData;
    this.systemAccounts.poolTokenAuthority = accs.poolTokenAuthority;
    this.systemAccounts.poolTokenAuthorityWsolAccount =  getAssociatedTokenAddressSync(
      accs.poolTokenAuthority,
      this.wsol
  )
    return this;
  }

/**
 * Pumplend data fetch functions
 */

public tryGetSystemAccounts()
{

  const systemConfig = PublicKey.findProgramAddressSync(
      [
        Buffer.from("system_config")
      ],
      this.pumpLendProgramId
    )[0];

  const poolStakingData = PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool_staking_data")
    ],
    this.pumpLendProgramId
  )[0];

  const poolTokenAuthority = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool_token_authority")
      ],
      this.pumpLendProgramId
    )[0];

    return {
      systemConfig,
      poolStakingData,
      poolTokenAuthority
    }
}


public tryGetUserAccounts(user:PublicKey)
{

  const systemConfig = PublicKey.findProgramAddressSync(
      [
        Buffer.from("system_config")
      ],
      this.pumpLendProgramId
    )[0];

  const poolStakingData = PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool_staking_data")
    ],
    this.pumpLendProgramId
  )[0];

  const userStakingData = PublicKey.findProgramAddressSync(
    [
      Buffer.from("user_staking_data"),
      user.toBuffer()
    ],
    this.pumpLendProgramId
  )[0];

  const poolTokenAuthority = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool_token_authority")
      ],
      this.pumpLendProgramId
    )[0];

    return {
      systemConfig,
      poolStakingData,
      userStakingData,
      poolTokenAuthority
    }
}

public tryGetUserTokenAccount(user:PublicKey , token:PublicKey)
{
  return  getAssociatedTokenAddressSync(
      token,
      user
  )
}

public tryGetUserTokenAccounts(user:PublicKey , token:PublicKey)
{
  try{
    const userBorrowData = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_borrow_data"),
          token.toBuffer(),
          user.toBuffer()
        ],
        this.pumpLendProgramId
      )[0];
  
    const poolTokenAuthority = PublicKey.findProgramAddressSync(
        [
          Buffer.from("pool_token_authority")
        ],
        this.pumpLendProgramId
      )[0];
    const poolTokenAccount = getAssociatedTokenAddressSync(
        token,
        poolTokenAuthority,
        true
      );
      return {
        userBorrowData,
        poolTokenAuthority,
        poolTokenAccount
      }

  }catch(e)
  {
    return false;
  }
}

  public async tryGetUserBorrowData(connection:Connection , token:PublicKey , user:PublicKey)
  {
    try {
      const userBorrowData = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_borrow_data"),
          token.toBuffer(),
          user.toBuffer()
        ],
        this.pumpLendProgramId
      )[0];
      const accountInfo = await connection.getAccountInfo(userBorrowData);
      if (!accountInfo) {
        throw new Error("Account not found");
      }

      const data = accountInfo.data;
      const collateralAmount = BigInt(data.readBigUInt64LE(8));
      const depositSolAmount = BigInt(data.readBigUInt64LE(16));
      const borrowedAmount = BigInt(data.readBigUInt64LE(24));
      const referrer = new PublicKey(data.slice(32, 64));
      const lastUpdated = BigInt(data.readBigInt64LE(64)); 

      return {
        collateralAmount,depositSolAmount,borrowedAmount,referrer,lastUpdated
      }
    } catch (err: any) {
      console.error(err)
      return {
        collateralAmount:0,
        depositSolAmount:0,
        borrowedAmount:0,
        referrer:new PublicKey(0),
        lastUpdated:Math.floor(Date.now()/1000),
      }
    }
  }


  public async tryGetPoolStakingData(connection:Connection)
  {
    try {
      const poolStakingData = PublicKey.findProgramAddressSync(
        [
          Buffer.from("pool_staking_data")
        ],
        this.pumpLendProgramId
      )[0];
      const accountInfo = await connection.getAccountInfo(new PublicKey(poolStakingData));

      if (!accountInfo) {
        throw new Error("Account not found");
      }

      const data = accountInfo.data;

      const totalStaked = BigInt(data.readBigUInt64LE(8));
      const totalShares = BigInt(data.readBigUInt64LE(16));
      const totalBorrowed = BigInt(data.readBigUInt64LE(24));
      const pendingVaultProfit = BigInt(data.readBigUInt64LE(32));

      return {
        totalStaked,
        totalShares,
        totalBorrowed,
        pendingVaultProfit
      }
    } catch (err: any) {
        return false;
    }
  }

  public async tryGetUserStakingData(connection:Connection , user:PublicKey)
  {
    try {
      const userStakingData = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_staking_data"),
          user.toBuffer()
        ],
        this.pumpLendProgramId
      )[0];
      const accountInfo = await connection.getAccountInfo(new PublicKey(userStakingData));

      if (!accountInfo) {
        throw new Error("Account not found");
      }

      const data = accountInfo.data;
      const shares = BigInt(data.readBigUInt64LE(8));

      return {
        shares
      }
    } catch (err: any) {
        return false;
    }
  }


    public async tryGetSystemConfigData(connection:Connection)
  {
    try {
      const systemConfig = PublicKey.findProgramAddressSync(
        [
          Buffer.from("system_config")
        ],
        this.pumpLendProgramId
      )[0];
      const accountInfo = await connection.getAccountInfo(new PublicKey(systemConfig));
  
      if (!accountInfo) {
        throw new Error("Account not found");
      }
  
      const data = accountInfo.data;
  
      const offset = 8;
  
      const initialized = Boolean(data.readUInt8(offset));
      const authority = new PublicKey(data.slice(offset + 1, offset + 33)).toBase58();
      const poolTokenAuthority = new PublicKey(data.slice(offset + 33, offset + 65)).toBase58();
      const vault = new PublicKey(data.slice(offset + 65, offset + 97)).toBase58();
      const pumpFunProgram = new PublicKey(data.slice(offset + 97, offset + 129)).toBase58();
      const baseVirtualTokenReserves = BigInt(data.readBigUInt64LE(offset + 129));
      const baseVirtualSolReserves = BigInt(data.readBigUInt64LE(offset + 137));
      const poolTokenAuthorityBumpSeed = data.readUInt8(offset + 145);
      const borrowRatePerSecond = BigInt(data.readBigUInt64LE(offset + 146));
  
      return {
        initialized,
        authority,
        poolTokenAuthority,
        vault,
        pumpFunProgram,
        baseVirtualTokenReserves,
        baseVirtualSolReserves,
        poolTokenAuthorityBumpSeed,
        borrowRatePerSecond
      };
    } catch (err: any) {
      console.error('Error fetching system config data:', err);
      return false;
    }
  }
  
/**
 * Pumpfun data fetch functions
 */


public tryGetPumpTokenDataAccount(token:PublicKey)
  {
    
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [
          Buffer.from("bonding-curve"),
          token.toBuffer()
      ],
      this.pumpfunProgramId
  );
  const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
      [
          bondingCurve.toBuffer(),
          new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(),
          token.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
    const mint = token;
    let feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"); //Devnet
    if(this.network == "mainnet")
      {
        feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"); //Mainnet
      }
    if(this.network == "devnet")
    {
      feeRecipient = new PublicKey("68yFSZxzLWJXkxxRGydZ63C6mHx1NLEDWmwN9Lb5yySg")
    }
    const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");

    const rent = new PublicKey("SysvarRent111111111111111111111111111111111");
    const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
  
    return{
      bondingCurve,
      associatedBondingCurve,
      mint,
      feeRecipient,
      global,
      rent,
      eventAuthority
    }
  }
  
  public async tryGetPumpTokenCurveData(connection:Connection , token:PublicKey)
{
  try {
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [
          Buffer.from("bonding-curve"),
          token.toBuffer()
      ],
      this.pumpfunProgramId
    );

    const accountInfo = await connection.getAccountInfo(new PublicKey(bondingCurve));

    if (!accountInfo) {
      throw new Error("Account not found");
    }

    const data = accountInfo.data;
    const virtualTokenReserves = BigInt(data.readBigUInt64LE(8));
    const virtualSolReserves = BigInt(data.readBigUInt64LE(16));
    const realTokenReserves = BigInt(data.readBigUInt64LE(24));
    const realSolReserves = BigInt(data.readBigUInt64LE(32));
    const tokenTotalSupply = BigInt(data.readBigUInt64LE(40));
    const complete = BigInt(data.readUintLE(48,1));

    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete
    }
  } catch (err: any) {
      return false;
  }
}
/**
 * Pumplend base function
 */

public async stake(amount:number ,user:PublicKey ,referral ?:PublicKey)
{
  try {

    const stakeAmountInLamports = new BN(amount);

    const args = new BaseArgs({ amount: stakeAmountInLamports });
    const stakeBuffer = serialize(BaseArgsSchema, args);

    const baseInfo = this.tryGetUserAccounts(user);
    if(!referral)
    {
      referral = user
    }

      const data = Buffer.concat(
          [
              new Uint8Array(sighash("global","stake")),
              stakeBuffer
          ]
      )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: user, isSigner: true, isWritable: true },
              { pubkey: referral, isSigner: false, isWritable: true },
              { pubkey: baseInfo.poolStakingData, isSigner: false, isWritable: true },
              { pubkey: baseInfo.userStakingData, isSigner: false, isWritable: true },
              { pubkey: baseInfo.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: baseInfo.systemConfig, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
            ],
          programId: this.pumpLendProgramId,
          data: data
      });

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = user;

      return transaction;

      
      } catch (err: any) {
        console.error('Error fetching system config data:', err);
        return false;
      }
}

public async withdraw(amount:number ,  user:PublicKey ,referral ?:PublicKey)
{
  try {

    const stakeAmountInLamports = new BN(amount);

    const args = new BaseArgs({ amount: stakeAmountInLamports });
    const stakeBuffer = serialize(BaseArgsSchema, args);

    const baseInfo = this.tryGetUserAccounts(user);
    if(!referral)
    {
      referral = user
    }

      const data = Buffer.concat(
          [
              new Uint8Array(sighash("global","withdraw")),
              stakeBuffer
          ]
      )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: user, isSigner: true, isWritable: true },
              { pubkey: referral, isSigner: false, isWritable: true },
              { pubkey: baseInfo.poolStakingData, isSigner: false, isWritable: true },
              { pubkey: baseInfo.userStakingData, isSigner: false, isWritable: true },
              { pubkey: baseInfo.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: baseInfo.systemConfig, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
            ],
          programId: this.pumpLendProgramId,
          data: data
      });

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = user;

      return transaction;

      
      } catch (err: any) {
        console.error('Error fetching system config data:', err);
        return false;
      }
}

public async borrow(amount:number , token:PublicKey , user:PublicKey ,referral ?:PublicKey)
{
  try {

    const stakeAmountInLamports = new BN(amount);

    const args = new BaseArgs({ amount: stakeAmountInLamports });
    const stakeBuffer = serialize(BaseArgsSchema, args);

    const baseInfo = this.tryGetUserAccounts(user);
    const userTokenAccount = this.tryGetUserTokenAccount(user,token);
    const userTokenAccounts = this.tryGetUserTokenAccounts(user,token)
    const tokenPumpAccounts = this.tryGetPumpTokenDataAccount(token)
    if(!userTokenAccount || !userTokenAccounts)
    {
      return false;
    }
    if(!referral)
    {
      referral = user
    }

      const data = Buffer.concat(
          [
              new Uint8Array(sighash("global","borrow")),
              stakeBuffer
          ]
      )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: user, isSigner: true, isWritable: true },
              { pubkey: baseInfo.poolStakingData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.userBorrowData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: userTokenAccount, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
              { pubkey: baseInfo.systemConfig, isSigner: false, isWritable: true },
              { pubkey: token, isSigner: false, isWritable: true },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: this.pumpfunProgramId, isSigner: false, isWritable: true },
              
              { pubkey: tokenPumpAccounts.bondingCurve, isSigner: false, isWritable: true },
              { pubkey: referral, isSigner: false, isWritable: true },
              { pubkey: this.pumpLendVault, isSigner: false, isWritable: true },//vault
            ],
          programId: this.pumpLendProgramId,
          data: data
      });


      const transaction = new Transaction().add(instruction);
      transaction.feePayer = user;

      return transaction;

      
      } catch (err: any) {
        console.error('Error fetching system config data:', err);
        return false;
      }
}
public async repay(amount:number , token:PublicKey , user:PublicKey ,referral ?:PublicKey)
{
  try {

    const stakeAmountInLamports = new BN(amount);

    const args = new BaseArgs({ amount: stakeAmountInLamports });
    const stakeBuffer = serialize(BaseArgsSchema, args);

    const baseInfo = this.tryGetUserAccounts(user);
    const userTokenAccount = this.tryGetUserTokenAccount(user,token);
    const userTokenAccounts = this.tryGetUserTokenAccounts(user,token)
    const tokenPumpAccounts = this.tryGetPumpTokenDataAccount(token)
    if(!userTokenAccount || !userTokenAccounts)
    {
      return false;
    }
    if(!referral)
    {
      referral = user
    }

      const data = Buffer.concat(
          [
              new Uint8Array(sighash("global","repay")),
              stakeBuffer
          ]
      )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: user, isSigner: true, isWritable: true },
              { pubkey: referral, isSigner: false, isWritable: true },
              { pubkey: baseInfo.poolStakingData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.userBorrowData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: userTokenAccount, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
              { pubkey: baseInfo.systemConfig, isSigner: false, isWritable: true },
              { pubkey: token, isSigner: false, isWritable: true },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
          programId: this.pumpLendProgramId,
          data: data
      });

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = user;

      return transaction;

      
      } catch (err: any) {
        console.error('Error fetching system config data:', err);
        return false;
      }
}


public async leverage_pump(amount:number , token:PublicKey , user:PublicKey ,referral ?:PublicKey,minAmountsOut = 0)
{
  try {

    const stakeAmountInLamports = new BN(amount);

    const args = new PumpBuyArgs({ amount: stakeAmountInLamports , maxSolCost : minAmountsOut });
    const argBuffer = serialize(PumpBuyArgsSchema, args);

    const baseInfo = this.tryGetUserAccounts(user);
    const userTokenAccount = this.tryGetUserTokenAccount(user,token);
    const userTokenAccounts = this.tryGetUserTokenAccounts(user,token)
    const tokenPumpAccounts = this.tryGetPumpTokenDataAccount(token)
    if(!userTokenAccount || !userTokenAccounts)
    {
      return false;
    }
    if(!referral)
    {
      referral = user
    }

      const data = Buffer.concat(
          [
              new Uint8Array(sighash("global","borrow_loop_pump")),
              argBuffer
          ]
      )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: user, isSigner: true, isWritable: true },
              { pubkey: baseInfo.poolStakingData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.userBorrowData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: userTokenAccount, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
              { pubkey: baseInfo.systemConfig, isSigner: false, isWritable: true },
              { pubkey: token, isSigner: false, isWritable: true },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.bondingCurve, isSigner: false, isWritable: true },
              { pubkey: this.pumpfunProgramId, isSigner: false, isWritable: true },
              { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              //Remnaining Account
              { pubkey: tokenPumpAccounts.global, isSigner: false, isWritable: false },
              { pubkey: tokenPumpAccounts.feeRecipient, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.mint, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.bondingCurve, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.associatedBondingCurve, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.rent, isSigner: false, isWritable: false },
              { pubkey: tokenPumpAccounts.eventAuthority, isSigner: false, isWritable: false },
              { pubkey: referral, isSigner: false, isWritable: true },
              { pubkey: this.pumpLendVault, isSigner: false, isWritable: true },//vault
            ],
          programId: this.pumpLendProgramId,
          data: data
      });

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = user;

      return transaction;

      
      } catch (err: any) {
        console.error('Error fetching system config data:', err);
        return false;
      }
}

public async leverage_raydium(connection:Connection,amount:number , token:PublicKey  , pool:PublicKey, user:PublicKey ,referral ?:PublicKey,minAmountsOut = 0 )
{
  // try {

  //   const stakeAmountInLamports = new BN(amount);

  //   const args = new PumpBuyArgs({ amount: stakeAmountInLamports , maxSolCost : minAmountsOut });
  //   const argBuffer = serialize(PumpBuyArgsSchema, args);

  //   const baseInfo = this.tryGetUserAccounts(user);
  //   const userTokenAccount = this.tryGetUserTokenAccount(user,token);
  //   const userTokenAccounts = this.tryGetUserTokenAccounts(user,token)

  //   const poolTokenAuthorityTokenAccount = getAssociatedTokenAddressSync(
  //     token,
  //     this.systemAccounts.poolTokenAuthority
  // )

  //   const ray = await raydiumFormatAmmKeysById(
  //     pool,connection
  //   )
  //   if(!userTokenAccount || !userTokenAccounts)
  //   {
  //     return false;
  //   }
  //   if(!referral)
  //   {
  //     referral = user
  //   }

  //     const data = Buffer.concat(
  //         [
  //             new Uint8Array(sighash("global","borrow_loop_pump")),
  //             argBuffer
  //         ]
  //     )
  //       const instruction = new TransactionInstruction({
  //         keys: [
  //             { pubkey: user, isSigner: true, isWritable: true },
  //             { pubkey: baseInfo.poolStakingData, isSigner: false, isWritable: true },
  //             { pubkey: userTokenAccounts.userBorrowData, isSigner: false, isWritable: true },
  //             { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
  //             { pubkey: userTokenAccount, isSigner: false, isWritable: true },
  //             { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
  //             { pubkey: baseInfo.systemConfig, isSigner: false, isWritable: true },
  //             { pubkey: token, isSigner: false, isWritable: true },
  //             { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
  //             { pubkey: tokenPumpAccounts.bondingCurve, isSigner: false, isWritable: true },
  //             { pubkey: this.raydiumAccounts.ammProgram, isSigner: false, isWritable: true },
  //             { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
  //             { pubkey: this.systemAccounts.poolTokenAuthorityWsolAccount, isSigner: false, isWritable: true },
  //             { pubkey: this.wsol, isSigner: false, isWritable: true },
  //             { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  //             { pubkey: this.pumpfunProgramId, isSigner: false, isWritable: true },

  //             //Remnaining Account

  //             //amm
  //             //amm_authority
  //             //amm_open_orders
  //             //amm_coin_vault
  //             //amm_pc_vault
  //             { pubkey: ray.marketProgramId, isSigner: false, isWritable: true },
  //             { pubkey: ray.market, isSigner: false, isWritable: true },
  //             { pubkey: ray.market_bids, isSigner: false, isWritable: true },
  //             { pubkey: ray.market_asks, isSigner: false, isWritable: true },
  //             { pubkey: ray.marketEventQueue, isSigner: false, isWritable: true },
  //             //market_coin_vault
  //             //market_pc_vault
  //             //market_vault_signer
  //             //user_token_source
  //             { pubkey: this.systemAccounts.poolTokenAuthorityWsolAccount, isSigner: false, isWritable: true },
  //             //user_token_destination
  //             { pubkey: poolTokenAuthorityTokenAccount, isSigner: false, isWritable: true },
  //             //user_source_owner
              
  //             // { pubkey: tokenPumpAccounts.global, isSigner: false, isWritable: false },
  //             // { pubkey: tokenPumpAccounts.feeRecipient, isSigner: false, isWritable: true },
  //             // { pubkey: tokenPumpAccounts.mint, isSigner: false, isWritable: true },
  //             // { pubkey: tokenPumpAccounts.bondingCurve, isSigner: false, isWritable: true },
  //             // { pubkey: tokenPumpAccounts.associatedBondingCurve, isSigner: false, isWritable: true },
  //             // { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
  //             // { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
  //             // { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  //             // { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
  //             // { pubkey: tokenPumpAccounts.rent, isSigner: false, isWritable: false },
  //             // { pubkey: tokenPumpAccounts.eventAuthority, isSigner: false, isWritable: false },
  //             // { pubkey: referral, isSigner: false, isWritable: true },
  //             // { pubkey: this.pumpLendVault, isSigner: false, isWritable: true },//vault
  //           ],
  //         programId: this.pumpLendProgramId,
  //         data: data
  //     });

  //     const transaction = new Transaction().add(instruction);
  //     transaction.feePayer = user;

  //     return transaction;

      
  //     } catch (err: any) {
  //       console.error('Error fetching system config data:', err);
  //       return false;
  //     }
}


public async close_pump( token:PublicKey , user:PublicKey ,referral ?:PublicKey ,liquitor ?:PublicKey)
{
  try {
    const baseInfo = this.tryGetUserAccounts(user);
    const userTokenAccounts = this.tryGetUserTokenAccounts(user,token)
    const tokenPumpAccounts = this.tryGetPumpTokenDataAccount(token)

    if(!referral)
    {
      referral = user
    }
    if(!liquitor)
    {
      liquitor = user
    }
    const userTokenAccount = this.tryGetUserTokenAccount(liquitor,token);
    if(!userTokenAccount || !userTokenAccounts)
    {
      return false;
    }

      const data = Buffer.concat(
          [
              new Uint8Array(sighash("global","liquidate_pump")),
          ]
      )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: liquitor, isSigner: true, isWritable: true },
              { pubkey: user, isSigner: false, isWritable: true },
              { pubkey: baseInfo.poolStakingData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.userBorrowData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
              { pubkey: baseInfo.systemConfig, isSigner: false, isWritable: true },
              { pubkey: token, isSigner: false, isWritable: true },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: this.pumpfunProgramId, isSigner: false, isWritable: true },
              //Remnaining Account

              { pubkey: tokenPumpAccounts.global, isSigner: false, isWritable: false },
              { pubkey: tokenPumpAccounts.feeRecipient, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.mint, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.bondingCurve, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.associatedBondingCurve, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.rent, isSigner: false, isWritable: false },
              { pubkey: tokenPumpAccounts.eventAuthority, isSigner: false, isWritable: false },
              { pubkey: referral, isSigner: false, isWritable: true },
              { pubkey: this.pumpLendVault, isSigner: false, isWritable: true },//vault
              
            ],
          programId: this.pumpLendProgramId,
          data: data
      });
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = user;

      return transaction;

      
      } catch (err: any) {
        console.error('Error fetching system config data:', err);
        return false;
      }
}


public async close_raydium( token:PublicKey , pool:PublicKey, user:PublicKey ,referral ?:PublicKey ,liquitor ?:PublicKey)
{
  try {
    const baseInfo = this.tryGetUserAccounts(user);
    const userTokenAccounts = this.tryGetUserTokenAccounts(user,token)
    const tokenPumpAccounts = this.tryGetPumpTokenDataAccount(token)

    if(!referral)
    {
      referral = user
    }
    if(!liquitor)
    {
      liquitor = user
    }
    const userTokenAccount = this.tryGetUserTokenAccount(liquitor,token);
    if(!userTokenAccount || !userTokenAccounts)
    {
      return false;
    }

    const data = Buffer.concat(
        [
            new Uint8Array(sighash("global","liquidate_pump")),
        ]
    )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: liquitor, isSigner: true, isWritable: true },
              { pubkey: user, isSigner: false, isWritable: true },
              { pubkey: baseInfo.poolStakingData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.userBorrowData, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
              { pubkey: this.systemAccounts.poolTokenAuthorityWsolAccount, isSigner: false, isWritable: true },
              { pubkey: baseInfo.systemConfig, isSigner: false, isWritable: true },
              { pubkey: token, isSigner: false, isWritable: true },
              { pubkey: this.wsol, isSigner: false, isWritable: true },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: pool, isSigner: false, isWritable: true },
              //Remnaining Account

              { pubkey: tokenPumpAccounts.global, isSigner: false, isWritable: false },
              { pubkey: tokenPumpAccounts.feeRecipient, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.mint, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.bondingCurve, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.associatedBondingCurve, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAccount, isSigner: false, isWritable: true },
              { pubkey: userTokenAccounts.poolTokenAuthority, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.rent, isSigner: false, isWritable: false },
              { pubkey: tokenPumpAccounts.eventAuthority, isSigner: false, isWritable: false },
              { pubkey: referral, isSigner: false, isWritable: true },
              { pubkey: this.pumpLendVault, isSigner: false, isWritable: true },//vault
              
            ],
          programId: this.pumpLendProgramId,
          data: data
      });
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = user;

      return transaction;

      
      } catch (err: any) {
        console.error('Error fetching system config data:', err);
        return false;
      }
}

/**
 * Pumpfun base function
 */
public async pump_buy( token:PublicKey , user:PublicKey ,amount:number,maxSolCost:number )
{
  try {
    const tokenPumpAccounts = this.tryGetPumpTokenDataAccount(token)
    const associatedUser = getAssociatedTokenAddressSync(token, user);

    const args = new PumpBuyArgs({ amount: new BN(amount)  ,maxSolCost:new BN(maxSolCost) });
    const buyBuffer = serialize(PumpBuyArgsSchema, args);

      const data = Buffer.concat(
          [
              new Uint8Array(sighash("global","buy")),
              buyBuffer
          ]
      )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: tokenPumpAccounts.global, isSigner: false, isWritable: false },
              { pubkey: tokenPumpAccounts.feeRecipient, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.mint, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.bondingCurve, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.associatedBondingCurve, isSigner: false, isWritable: true },
              { pubkey: associatedUser, isSigner: false, isWritable: true },
              { pubkey: user, isSigner: true, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.rent, isSigner: false, isWritable: false },
              { pubkey: tokenPumpAccounts.eventAuthority, isSigner: false, isWritable: false },
              { pubkey: this.pumpfunProgramId, isSigner: false, isWritable: true },

            ],
          programId: this.pumpfunProgramId,
          data: data
      });

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = user;

      return transaction;

      
      } catch (err: any) {
        console.error('Error fetching system config data:', err);
        return false;
      }
}

public async pump_sell( token:PublicKey , user:PublicKey ,minSolOut:number,amount:number )
{
  try {
    const tokenPumpAccounts = this.tryGetPumpTokenDataAccount(token)
    const associatedUser = getAssociatedTokenAddressSync(token, user);

    const args = new PumpBuyArgs({ amount: new BN(minSolOut)  ,maxSolCost:new BN(amount) });
    const buyBuffer = serialize(PumpBuyArgsSchema, args);

      const data = Buffer.concat(
          [
              new Uint8Array(sighash("global","sell")),
              buyBuffer
          ]
      )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: tokenPumpAccounts.global, isSigner: false, isWritable: false },
              { pubkey: tokenPumpAccounts.feeRecipient, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.mint, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.bondingCurve, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.associatedBondingCurve, isSigner: false, isWritable: true },
              { pubkey: associatedUser, isSigner: false, isWritable: true },
              { pubkey: user, isSigner: true, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
              { pubkey: tokenPumpAccounts.eventAuthority, isSigner: false, isWritable: false },
              { pubkey: this.pumpfunProgramId, isSigner: false, isWritable: true },

            ],
          programId: this.pumpfunProgramId,
          data: data
      });
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = user;

      return transaction;

      
      } catch (err: any) {
        console.error('Error fetching system config data:', err);
        return false;
      }
}

/**
 * Utils fn ::
 */
public txTips( tx:Transaction , simulate:any , tips = 500 ,unitPrice =20000 )
{
  if(!simulate || !(simulate as any)?.value || !(simulate as any)?.value.unitsConsumed)
  {
    return tx;
  }
  const unitsConsumed = (simulate as any).value.unitsConsumed + tips;
  const unitsPrice = unitPrice;
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: unitsConsumed,
    }),
  );
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: unitsPrice,
    }),
  );
  return tx;
}

public pump_get_amounts_out(amount:bigint,curve?:any)
{
  return pumpGetAmountsOut(amount,curve)
}

public pumplend_culcuate_max_borrow(userBorrowDataDetails:any,amount:number ,stakeStatus?:any )
{
 
  if(!userBorrowDataDetails || !userBorrowDataDetails?.collateralAmount || !userBorrowDataDetails?.borrowedAmount)
  {
    userBorrowDataDetails = {
      collateralAmount:BigInt(0),
      borrowedAmount:BigInt(0),
    }
  }
  const newBorrowToken = BigInt(amount);
  const borrowedToken =userBorrowDataDetails.collateralAmount;
  const borrowedSol =userBorrowDataDetails.borrowedAmount; 
  const oldToken = curveBaseToken;
  const oldSol = curveBaseSol;
  const newToken = oldToken-(newBorrowToken+borrowedToken)
  const newSol = (oldSol*oldToken)/(newToken)
  const dSol = newSol - oldSol;
  let ret =  Number(((Number(dSol)*0.7)-Number(borrowedSol)).toFixed(0));
  if(stakeStatus && ret>(stakeStatus.totalStaked -stakeStatus.totalBorrowed ))
  {
    ret = Number(Number(stakeStatus.totalStaked -stakeStatus.totalBorrowed).toFixed(0))
  }
  return ret;
}

public pumplend_culcuate_max_borrow_rate(userBorrowDataDetails:any,amount:number , rate  = 0.7 )
{
 
  if(!userBorrowDataDetails || !userBorrowDataDetails?.collateralAmount || !userBorrowDataDetails?.borrowedAmount)
  {
    userBorrowDataDetails = {
      collateralAmount:BigInt(0),
      borrowedAmount:BigInt(0),
    }
  }
  const newBorrowToken = BigInt(amount);
  const borrowedToken =userBorrowDataDetails.collateralAmount;
  const borrowedSol =userBorrowDataDetails.borrowedAmount; 
  const oldToken = curveBaseToken;
  const oldSol = curveBaseSol;
  const newToken = oldToken-(newBorrowToken+borrowedToken)
  const newSol = (oldSol*oldToken)/(newToken)
  const dSol = newSol - oldSol;
  return  Number((Number(dSol)*rate - Number(borrowedSol)).toFixed(0));
}


public pumplend_culcuate_max_leverage(userBorrowDataDetails:any,amount:number,curve:any)
{
  if(!userBorrowDataDetails || !userBorrowDataDetails?.collateralAmount || !userBorrowDataDetails?.borrowedAmount)
    {
      userBorrowDataDetails = {
        collateralAmount:BigInt(0),
        borrowedAmount:BigInt(0),
      }
    }

    if(!curve || !curve?.virtualSolReserves || !curve?.virtualTokenReserves)
      {
        curve = {
          solReserves:curveBaseSol,
          tokenReserves:curveBaseToken,
          realTokenReserves:BigInt(0),
        }
      }else{
        curve = {
          solReserves:curve.virtualSolReserves,
          tokenReserves:curve.virtualTokenReserves,
          realTokenReserves:curve.realTokenReserves,
        }
      }
  const newBorrowSol = BigInt(amount);

  let borrowedToken = BigInt(0);
  let borrowedSol = BigInt(0); 
  try{
    if(userBorrowDataDetails)
    {
      borrowedToken = userBorrowDataDetails.collateralAmount;
      borrowedSol = userBorrowDataDetails.borrowedAmount;
    }
  }catch(e)
  {
    e;
  }
  const newToken = curveBaseToken-borrowedToken;
  const newSol = borrowedSol+curveBaseSol;
  // const dToken = getMaxBorrowAmountByAMM(
  //   {
  //     solReserves:curve.solReserves,
  //     tokenReserves:curve.tokenReserves,
  //     realTokenReserves:curve.realTokenReserves,
  //   },
  //   newSol,
  //   newToken,
  //   userBorrowDataDetails.borrowedAmount,
  //   userBorrowDataDetails.collateralAmount,
  //   newBorrowSol,
  //   // BigInt(amount*0.1)
  //   BigInt(1e7)
  // )
  const dToken=  loopMaxBuy(
    BigInt(amount),
    curve,
    userBorrowDataDetails,
    BigInt(1e7)
  )

  // console.log(
  //   {
  //     solReserves:curve.solReserves,
  //     tokenReserves:curve.tokenReserves,
  //     realTokenReserves:curve.realTokenReserves,
  //   },
  //   newSol,
  //   newToken,
  //   userBorrowDataDetails.borrowedAmount,
  //   userBorrowDataDetails.collateralAmount,
  //   newBorrowSol,
  //   BigInt(amount*0.1)
  // )
  return dToken;
}

public pumplend_estimate_interest(userBorrowDataDetails:any,interestRate?:number )
{
  const ir = interestRate ? interestRate : 0.01 ; //Rate in day
  const ret = {
    interest : 0,
    liquiteTime : 0,
    liquiteRemainingTime:0, //Second
  }
  if(!userBorrowDataDetails || !userBorrowDataDetails?.collateralAmount || !userBorrowDataDetails?.borrowedAmount)
  {
    return ret
  }

  ret.interest = Math.floor(
    (
    (
      (Date.now()/1000) - Number(userBorrowDataDetails.lastUpdated)
    ) //Dt . in second
    / 86400
    ) 
    *ir* Number(userBorrowDataDetails.borrowedAmount))

  const maxSol = (this.pumplend_culcuate_max_borrow_rate({},userBorrowDataDetails.collateralAmount,0.8));
  const dt = (maxSol-Number(userBorrowDataDetails.borrowedAmount)) / (
    Number(userBorrowDataDetails.borrowedAmount) * (ir /86400)
  )
  ret.liquiteTime = Math.floor(
    Number(userBorrowDataDetails.lastUpdated) + dt
  )

  ret.liquiteRemainingTime = Math.floor(
    ret.liquiteTime - (Date.now()/1000)
  )
  return ret;
}

}
