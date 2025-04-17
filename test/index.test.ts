import { Wechatmpc } from "../src";

const testControl = {
  connectWallet : true,
}


test("🍺 Test Wechat Mpc", async () => {
  if(testControl.connectWallet)
  {
    const mpc = new Wechatmpc()
    console.log(
      mpc
    )
    // console.log(
    //   await mpc.connect(
    //     {t:1,i:1}
    //     ,"")
    // )
  }else{
    console.info("⚠Test Module Off")
  }
})
