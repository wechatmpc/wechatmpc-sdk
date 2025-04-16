import { Wechatmpc } from "../src";

const testControl = {
  connectWallet : true,
}


test("🍺 Test Wechat Mpc", async () => {
  if(testControl.connectWallet)
  {
    console.log(
      new Wechatmpc()
    )
  }else{
    console.info("⚠Test Module Off")
  }
})
