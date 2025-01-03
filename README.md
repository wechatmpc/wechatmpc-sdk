# PUMPLEND SDK 

This repo is the NPM SDK of pumplend protocol 

Allows developer to build their own contract call base on SDK

You can fetch our SDK [Here](https://www.npmjs.com/package/@pumplend/pumplend-sdk)

## Function method support

- `stake`
    - Stake SOL into protocol

- `withdraw`
    - Withdraw SOL from protocol

- `borrow`
    - Deposite token and borrow out SOL from contract

- `repay`
    - Repay SOL and take token back

- `liquidate_pump`
    - From borrow account : Close the position of user token in pump.fun
    - From other account : liquidate the user token position in pump.fun

- `liquidate_raydium`
    - From borrow account : Close the position of user token in raydium
    - From other account : liquidate the user token position in raydium

- Pump.fun Functions
    - `pump_buy`
        - Buy Tokens in pump.fun
    - `pump_sell`
        - Sell Tokens in pump.fun
    - `mint`
        - New Token Mint via pump.fun

## Data fetch support

- `UserBorrowData`
    - The borrow data information

- `PoolStakingData`
    - Currently staking information of pool

- `UserStakingData`
    - Staking data of users

- `SystemConfigData`
    - Protocol base states and currently status

- `pumplend_culcuate_max_borrow`
    - Get max borrw able amount with tokenamount input

- `pumplend_culcuate_max_leverage`
    - Get max leverage able amount with SOLamount input

- Pump.fun Datas
    - `BondingCurve`
        - Details information of Bonding Curve

## Contract information

- pumplend programID address
    ```Bn1a31GcgB7qquETPGHGjZ1TaRimjsLCkJZ5GYZuTBMG```

- pumplend vault address
    ```zzntY4AtoZhQE8UnfUoiR4HKK2iv8wjW4fHVTCzKnn6```

- pumpfun programID address
    ```6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P```
    