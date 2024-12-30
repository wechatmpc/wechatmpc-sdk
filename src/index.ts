
/**
 * Pumplend :: Major class of pumplend SDK
 */

export class Pumplend {
  pumpLendProgramId = "Bn1a31GcgB7qquETPGHGjZ1TaRimjsLCkJZ5GYZuTBMG";
  pumpfunProgramId = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
  public constructor(pumpLendProgramId?:string,pumpfunProgramId?:string) {
    if(pumpLendProgramId)
    {
      this.pumpLendProgramId = pumpLendProgramId
    }
      
    if(pumpfunProgramId)
      {
        this.pumpfunProgramId = pumpfunProgramId
      }
      return this;
  }

/**
 * Data fetch functions
 */
  public tryGetUserBorrowData(connection:any , user:any)
  {

  }

/**
 * Pumplend base function
 */

/**
 * Pumpfun base function
 */

}
