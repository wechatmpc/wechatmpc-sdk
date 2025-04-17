import nacl from "tweetnacl"

import bs58 from "bs58"

import { Buffer } from "buffer";

class Wechatmpc{

  uuid:any;
  baseurl?:any
  actionUrl?:any
  loopInterval?:any
  loopTimeout?:any

  encryptionKp:any;
  constructor(uuid?:string,config?:{
    baseurl:any,
    actionUrl:any,
    loopInterval:any,
    loopTimeout:any,
  })
  {
      if(uuid)
      {
          this.uuid = uuid
      }else{
          this.uuid = crypto.randomUUID();
      }

      if(config?.baseurl)
      {
          this.baseurl = config.baseurl
      }else{
          this.baseurl = "https://mpcapi.sidcloud.cn/"
      }

      if(config?.actionUrl)
      {
          this.actionUrl = config.actionUrl
      }else{
          this.actionUrl = 'https://mpc.sidcloud.cn/qr.html'
      }

      if(config?.loopInterval)
      {
          this.loopInterval = config.loopInterval
      }else{
          this.loopInterval = 500 //0.5
      }

      if(config?.loopTimeout)
      {
          this.loopTimeout = config.loopTimeout
      }else{
          this.loopTimeout = 120 //1min
      }

      this.encryptionKp = nacl.box.keyPair()
  }

  encode(pubKey:any, msg:any) {
    try{
      const ephemKeys = nacl.box.keyPair()
      const msgArr = Buffer.from(msg)
      const nonce = nacl.randomBytes(nacl.box.nonceLength)
      const encrypted = nacl.box(
          msgArr,
          nonce,
          pubKey,
          ephemKeys.secretKey
      )
      const nonce64 = Buffer.from(nonce).toString("base64")
      const pubKey64 = Buffer.from(ephemKeys.publicKey).toString("base64")
      const encrypted64 = Buffer.from(encrypted).toString("base64")
      return {nonce: nonce64, ephemPubKey: pubKey64, encrypted: encrypted64}
    }catch(e)
    {
      return false;
    }
  }

  decode(secretKey:any , encryption:any)
  {
    try{
      const decode =  nacl.box.open(
        new Uint8Array(Buffer.from(encryption.encrypted,"base64")),
        new Uint8Array(Buffer.from(encryption.nonce,"base64")),
        new Uint8Array(Buffer.from(encryption.ephemPubKey,"base64")),
        secretKey
      )
      return  Buffer.from(decode as any).toString("utf8")
    }catch(e)
    {
      return false;
    }
  }
  async loopCheck() {
      for(let i = 0 ; i < this.loopTimeout ; i++)
      {
          const ret = await this.check_request_action()
          if(ret?.data)
          {
            try{
              const retJson = JSON.parse(ret.data)
              {
                if(retJson?.nonce && retJson?.ephemPubKey && retJson?.encrypted)
                {
                  return this.decode(this.encryptionKp.secretKey,retJson)
                }
                return ret.data
              }
            }catch(e)
            {
              return ret.data
            }
          }
          await this.sleep(this.loopInterval)
      }
      return {
          status:false,
          reason:"user operation timeout"
      }
  }

  async sleep (ms:number) {
      return new Promise((resolve) => {
      setTimeout(resolve, ms);
      });
  }
  async check_request_action(){
      try{
          return (await fetch(this.baseurl+'/result/'+this.uuid,{
              method: "GET",
              headers: {},
              redirect: 'follow'
          })).json()
      }catch(e)
      {
          console.error(e)
          return false;
      }
  }

  async connect(chian:any,redirect:any) {
      const site = window.location.origin
      
      const d =  {
                      t:0,
                      i:this.uuid, 
                      d:site, 
                      c:chian, 
                      r:redirect || null,
                      k:Buffer.from(this.encryptionKp.publicKey).toString("base64") // Add public Key to do msg reply encryption
                  }
      window.open(this.actionUrl+bs58.encode(Buffer.from(JSON.stringify(d))),"newwindow","height=800, width=400, toolbar=no, menubar=no, scrollbars=no, resizable=no, location=no, status=no");
      return await this.loopCheck()
  }

  async sign(chian:any,sign:any,redirect:any,preconnect:any) {
      let d:any=  {
                      t:1,
                      i:this.uuid, 
                      d:sign, 
                      c:chian, 
                      r:redirect || null,
                      k:Buffer.from(this.encryptionKp.publicKey).toString("base64")// Add public Key to do msg reply encryption
                  }
      if(preconnect)
      {
        const hd = new Headers();
          hd.append("Content-Type", "application/json");
          const op = {
            method: 'POST',
            headers:hd,
            body: JSON.stringify({"data":bs58.encode(Buffer.from(JSON.stringify(d)))}),
            redirect: 'follow'
          };
          await fetch(`${this.baseurl}/preconnect/${d.i}`, op as any);
          d = {
              i:this.uuid, 
              p:1
          }
      }
      window.open(this.actionUrl+bs58.encode(Buffer.from(JSON.stringify(d))),"newwindow","height=800, width=400, toolbar=no, menubar=no, scrollbars=no, resizable=no, location=no, status=no");
      return await this.loopCheck()
  }

  async send(chian:any,txs:any,redirect:any,preconnect:any) {
      let d:any=  {
                      t:2,
                      i:this.uuid, 
                      d:txs, 
                      c:chian, 
                      r:redirect || null,
                      k:Buffer.from(this.encryptionKp.publicKey).toString("base64")// Add public Key to do msg reply encryption
                  }
      if(preconnect)
      {
          const hd = new Headers();
          hd.append("Content-Type", "application/json");
          const op = {
            method: 'POST',
            headers:hd,
            body: JSON.stringify({"data":bs58.encode(Buffer.from(JSON.stringify(d)))}),
            redirect: 'follow'
          };
          await fetch(`${this.baseurl}/preconnect/${d.i}`, op as any);
          d = {
              i:this.uuid, 
              p:1
            }
      }
      window.open(this.actionUrl+bs58.encode(Buffer.from(JSON.stringify(d))),"newwindow","height=800, width=400, toolbar=no, menubar=no, scrollbars=no, resizable=no, location=no, status=no");
      return await this.loopCheck()
  }
}

export {
  Wechatmpc
}