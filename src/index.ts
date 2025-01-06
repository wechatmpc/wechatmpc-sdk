
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

function sqrtBigInt(value: bigint): bigint {
  if (value < BigInt(0)) {
    throw new Error("Cannot calculate square root of a negative number");
  }

  let x = value;
  let y = (x + BigInt(1)) / BigInt(2);

  while (y < x) {
    x = y;
    y = (x + value / x) / BigInt(2);
  }

  return x;
}


type Reserves = {
  solReserves: bigint;
  tokenReserves: bigint;
};

function getMaxBorrowAmountByAMM(
  reserves: Reserves,
  baseVirtualSolReserves: bigint,
  baseVirtualTokenReserves: bigint,
  collateralAmount: bigint,
  remaining_collateral_amount:bigint
) {
  try {
    const x0 = BigInt(baseVirtualSolReserves);
    const y0 = BigInt(baseVirtualTokenReserves);
    const x1 = BigInt(reserves.solReserves);
    const y1 = BigInt(reserves.tokenReserves);
    const k = BigInt(collateralAmount) - BigInt(remaining_collateral_amount);

    const a = ((y1 - y0) * BigInt(7)) / BigInt(10);
    const b =
      ((x0 * y1 * BigInt(7)) / BigInt(10)) - x1 * y0 + k * y1 - k * y0;
    const c = k * x0 * y1;

    const b_4ac = b * b - a * c * BigInt(4);

    if (b_4ac < BigInt(0)) {
      throw new Error("MathOverflow: Negative square root");
    }

    const b_4ac_sqrt = sqrtBigInt(b_4ac);

    const xn = (-b - b_4ac_sqrt) / (a * BigInt(2));
    const yn = y1 - (x1 * y1) / (x1 + xn);

    if (xn < BigInt(0) || yn < BigInt(0)) {
      throw new Error("MathOverflow: Resulting values are negative");
    }

    return {
      sol:xn, 
      token:yn
    };
  } catch (error) {
    console.error("Error calculating max borrow amount:", error);
    // return new Error("MathError: Unable to calculate borrow amount");
    return false;
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
  pumpLendProgramId = new PublicKey("6m6ixFjRGq7HYAPsu8YtyEauJm8EE8pzA3mqESt5cGYf");
  pumpLendVault = new PublicKey("zzntY4AtoZhQE8UnfUoiR4HKK2iv8wjW4fHVTCzKnn6")
  pumpfunProgramId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  network = "mainnet"
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
      return this;
  }

/**
 * Pumplend data fetch functions
 */

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
    return {
      collateralAmount:0,
      depositSolAmount:0,
      borrowedAmount:0,
      referrer:new PublicKey(0),
      lastUpdated:Date.now()
    }
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
        lastUpdated:Date.now()
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
      const pumpFunProgram = new PublicKey(data.slice(offset + 65, offset + 97)).toBase58();
      const baseVirtualTokenReserves = BigInt(data.readBigUInt64LE(offset + 97));
      const baseVirtualSolReserves = BigInt(data.readBigUInt64LE(offset + 105));
      const poolTokenAuthorityBumpSeed = data.readUInt8(offset + 113);
      const borrowRatePerSecond = BigInt(data.readBigUInt64LE(offset + 114));
  
      return {
        initialized,
        authority,
        poolTokenAuthority,
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


public async leverage_pump(amount:number , token:PublicKey , user:PublicKey ,referral ?:PublicKey)
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
              new Uint8Array(sighash("global","borrow_loop_pump")),
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

public async close_pump( token:PublicKey , user:PublicKey ,referral ?:PublicKey)
{
  try {



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
              new Uint8Array(sighash("global","liquidate_pump")),
          ]
      )
      console.log(
        [
          { pubkey: user.toBase58(), isSigner: true, isWritable: true },
          { pubkey: user.toBase58(), isSigner: true, isWritable: true },
          { pubkey: baseInfo.poolStakingData.toBase58(), isSigner: false, isWritable: true },
          { pubkey: userTokenAccounts.userBorrowData.toBase58(), isSigner: false, isWritable: true },
          { pubkey: userTokenAccounts.poolTokenAuthority.toBase58(), isSigner: false, isWritable: true },
          { pubkey: userTokenAccount.toBase58(), isSigner: false, isWritable: true },
          { pubkey: userTokenAccounts.poolTokenAccount.toBase58(), isSigner: false, isWritable: true },
          { pubkey: baseInfo.systemConfig.toBase58(), isSigner: false, isWritable: true },
          { pubkey: token.toBase58(), isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID.toBase58(), isSigner: false, isWritable: true },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
          { pubkey: this.pumpfunProgramId.toBase58(), isSigner: false, isWritable: true },
          //Remnaining Account
          { pubkey: tokenPumpAccounts.global.toBase58(), isSigner: false, isWritable: false },
          { pubkey: tokenPumpAccounts.feeRecipient.toBase58(), isSigner: false, isWritable: true },
          { pubkey: tokenPumpAccounts.mint.toBase58(), isSigner: false, isWritable: true },
          { pubkey: tokenPumpAccounts.bondingCurve.toBase58(), isSigner: false, isWritable: true },
          { pubkey: tokenPumpAccounts.associatedBondingCurve.toBase58(), isSigner: false, isWritable: true },
          { pubkey: userTokenAccounts.poolTokenAccount.toBase58(), isSigner: false, isWritable: true },
          { pubkey: userTokenAccounts.poolTokenAuthority.toBase58(), isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID.toBase58(), isSigner: false, isWritable: true },
          { pubkey: tokenPumpAccounts.rent.toBase58(), isSigner: false, isWritable: false },
          { pubkey: tokenPumpAccounts.eventAuthority.toBase58(), isSigner: false, isWritable: false },
        ]
      )
        const instruction = new TransactionInstruction({
          keys: [
              { pubkey: user, isSigner: true, isWritable: true },
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
  const newToken = borrowedToken+curveBaseToken;
  const newSol = borrowedSol+curveBaseSol;
  const dSol = newSol-((newSol*newToken)/(newToken+newBorrowToken))
  let ret =  Number((Number(dSol)*0.7).toFixed(0));
  if(stakeStatus && ret>(stakeStatus.totalStaked -stakeStatus.totalBorrowed ))
  {
    ret = Number(Number(stakeStatus.totalStaked -stakeStatus.totalBorrowed).toFixed(0))
  }

  return ret;
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
          solReserves:BigInt(0),
          tokenReserves:BigInt(0),
        }
      }else{
        curve = {
          solReserves:curve.virtualSolReserves,
          tokenReserves:curve.virtualTokenReserves,
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
  const newToken = borrowedToken+curveBaseToken;
  const newSol = borrowedSol+curveBaseSol;
  const dToken = getMaxBorrowAmountByAMM(
    {
      solReserves:curve.solReserves,
      tokenReserves:curve.tokenReserves,
    },
    newSol,
    newToken,
    newBorrowSol,
    BigInt(amount*0.1)
  )
  return dToken;
}

}
