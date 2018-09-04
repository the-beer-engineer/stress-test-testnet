let BITBOXCli
let BITBOX
let rpcConf
let feeRate
// Interactive stuff - contributed by sploit BIP47
const readline = require('readline')
function askQuestion(query) {
  const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
      rl.close();
      resolve(ans);
  }))
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

class StresstestShared {
  constructor(useRest, numParallelTx, bitboxConfig) {
    if (useRest) {
      BITBOXCli = require('bitbox-cli/lib/bitbox-cli').default
      BITBOX = new BITBOXCli({
        // restURL: 'http://localhost:3000/v1/',
        restURL: 'https://trest.bitcoin.com/v1/',
      })
    }
    else {
      BITBOXCli = require('bitbox-cli/lib/bitbox-cli').default
      BITBOX = new BITBOXCli(bitboxConfig)
      rpcConf = bitboxConfig;
      console.log(rpcConf);
    }

    this.useRest = useRest
    this.numParallelTx = numParallelTx

    this.opReturnTagText = "All test and no main makes this a dull transaction. All test and no main makes this a dull transaction. All test and no main makes this a dull transaction. All test and no main makes this a dull transaction.";
    this.opReturnTagBuffer = BITBOX.Script.nullData.output.encode(Buffer.from(this.opReturnTagText, 'ascii'));
  }

  async sendTxAsync(hex) {
    return new Promise((resolve, reject) => {
      BITBOX.RawTransactions.sendRawTransaction(hex, true, rpcConf.username,rpcConf.password,rpcConf.port).then((result) => {
       // console.log('txid:', result)
        if (result.length != 64) { // Very rough txid size check for failure
          reject("send tx failure: " + result)
        }
        else {
          resolve(result)
        }
      }, (err) => {
        reject(err)
      })
    })
  }

  async sendTxChainAsync(hexList) {
    return new Promise(async (resolve, reject) => {
      let totalSent = 0
      for (let i = 0; i < hexList.length; i++) {
        try {
          await this.sendTxAsync(hexList[i])
          totalSent += 1

          // sleep 1 second when using rest, sleep 200ms when connected to local node
          if (this.useRest)
            await sleep(1000)
          else
            await sleep(80)
        } catch (ex) {
          console.log("send tx chain failure, chain " + i + " ex:", ex)
          reject(ex)
          break
        }
      }

      resolve(totalSent)
    })
  }

  async getUtxos(address) {
    return new Promise((resolve, reject) => {
      BITBOX.Address.utxo(address).then((result) => {
        resolve(result)
      }, (err) => {
        console.log(err)
        reject(err)
      })
    })
  }

  async pollForUtxo(address) {
    // poll for utxo
    // let count = 1
    try {
      while (true) {
        // rate limit
        await sleep(5 * 1000)

        let utxos = await this.getUtxos(address)
        // return highest value utxo when first utxo is found
        
        if (utxos && utxos.length > 0) {
          let utxo = utxos.sort((a, b) => { return a.satoshis - b.satoshis })[utxos.length - 1]
          console.log("utxo: ", utxo)
          return utxo
        } else {
          // if (count == 1)
          //   console.log("Waiting for funding...")
          // else
          //   console.log (count)
          // count += 1
        }
      }
    } catch (ex) {
      console.log("Poll for utxo ex: ", ex)
    }
  }

  async getTxDetails(txid) {
    let vout = 0
    return new Promise((resolve, reject) => {
      // BITBOX.Transaction.details(txid).then((result) => {
        BITBOX.Transaction.details(txid, vout, rpcConf.username,rpcConf.password,rpcConf.port).then((result) => {
        //console.log("tx details", result)
        resolve(result)
      }, (err) => {
        reject(err)
      })
    })
  }

  async pollForConfirmation(txid) {
    // poll for utxo
    while (true) {
      try {
        // rate limit
        await sleep(30 * 1000)

        let txDetails = await this.getTxDetails(txid)
        // console.log(txDetails)

        // return highest value utxo when first utxo is found
        if (txDetails && txDetails.confirmations > 0)
          return txDetails
        else
          console.log("Waiting for split tx confirmation...")
      } catch (ex) {
        console.log("Poll for confirmation ex: ", ex)
      }
    }
  }

  async start() {
    //let mnemonic = "menu athlete limb arch march luggage broken ride early hedgehog orange canoe explain emerge seat witness judge shock edit protect logic talent any intact" 
    let mnemonic = await askQuestion("Type in mnemonic or press <Enter> to generate one: ")
    if (mnemonic.length == 0)
       mnemonic = BITBOX.Mnemonic.generate(256)

    let rootSeed = BITBOX.Mnemonic.toSeed(mnemonic)
    let masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, 'testnet')
    let hdNode = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")
    feeRate = await askQuestion("Enter fee rate in Satoshis/B:")

    // derive the first internal change address HDNode which is going to spend utxo and receive refund
    let node0 = BITBOX.HDNode.derivePath(hdNode, "1/0")
    let node0CashAddress = BITBOX.HDNode.toCashAddress(node0)
    let node0LegacyAddress = BITBOX.HDNode.toLegacyAddress(node0)
    let node0WIF = BITBOX.ECPair.toWIF(BITBOX.HDNode.toKeyPair(node0))
    let msg = "https://www.youtube.com/watch?v=e4q6eaLn2mY";
    let signature = BITBOX.BitcoinCash.signMessageWithPrivKey(node0WIF, msg);

    // bitcoind.call(
    //   { "jsonrpc": "1.0", "id": "bch", "method": "sendrawtransaction", "params": [hex] },
    //    function (err, res) {
    //           if (err) { console.log(err, "!"); reject(err) }
    //           //else { resolve(res.result) };
    //           if(res.result){
    //             resolve(res.result) 
    //           }else{
    //             reject(res);
    //           }
    //         })


    console.log("WIF:", node0WIF);
    console.log("Mnemonic:", mnemonic)
    console.log(`Send BCH to ${node0CashAddress} or ${node0LegacyAddress} to start`)
    
    // Wait for utxo to arrive to build starting wallet
    let utxo = await this.pollForUtxo(node0LegacyAddress)

    // TODO: Get refund address from tx details
    let refundAddress = node0LegacyAddress // utxo.legacyAddress

    console.log("UTXO found. Change will be sent to:", refundAddress)

    let wallet = {
      satoshis: utxo.satoshis,
      txid: utxo.txid,
      vout: utxo.vout
    }

    let dustLimitSats = 547
    let maxTxChain = 24
    let feePerTx = BITBOX.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: 3 }) * feeRate
    let satsPerAddress = feePerTx * maxTxChain + dustLimitSats
    let splitFeePerAddress = BITBOX.BitcoinCash.getByteCount({ P2PKH: 0 }, { P2PKH: 1 }) * feeRate
    let numAddresses = Math.floor((wallet.satoshis) / (satsPerAddress + splitFeePerAddress))

    // Check for max tx size limit
    let maxAddresses = 2900
    if (numAddresses > maxAddresses)
      numAddresses = maxAddresses

    // Reduce number of addresses as required for split tx fee
    let byteCount = 0
    let satsChange = 0
    while (satsChange < dustLimitSats) {
      // Calculate splitTx fee and change to return to refundAddress
      byteCount = BITBOX.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: numAddresses + 3 }) * feeRate
      satsChange = wallet.satoshis - byteCount - (numAddresses * satsPerAddress)

      if (satsChange < dustLimitSats) {
        numAddresses = numAddresses - 1
      }
    }

    console.log(`Creating ${numAddresses} addresses to send ${numAddresses * maxTxChain} transactions with ${satsChange} sats change to be refunded`)
   // await askQuestion("<Enter> to start (Ctrl+C to cancel): ")

    let splitAddressResult = this.splitAddress(wallet, numAddresses, satsPerAddress, hdNode, node0, refundAddress, satsChange, maxTxChain)
    let splitTxHex = splitAddressResult.hex
    let walletChains = splitAddressResult.wallets

    // Broadcast split tx
    let splitTxid = await this.sendTxAsync(splitTxHex)
    console.log("Split txid: ", splitTxid)

    console.log("Creating batch transactions")
    // Generate transactions for each address
    let hexListByAddress = this.createChainedTransactions(walletChains, maxTxChain, refundAddress)

  
    // Wait for first confirmation before stress testing to avoid mempool chain limit
    console.log("Batch tx completed. Waiting for first confirmation of split tx...")
    await this.pollForConfirmation(splitTxid)

  //  await askQuestion(`Split tx confirmed. <Enter> to send ${numAddresses * maxTxChain} txs  (Ctrl+C to cancel): `)

    // serial for rest, parallel for local node
    if (this.useRest) {
      await this.sendBatchRest(hexListByAddress)
    } else {
      await this.sendBatchNode(hexListByAddress)
    }
  }

  async sendBatchRest(hexListByAddress) {
    let totalSent = 0
    for (let i = 0; i < hexListByAddress.length; i++) {
      try {
        let sent = await this.sendTxChainAsync(hexListByAddress[i])
        totalSent += sent
        console.log(totalSent)
      } catch (ex) {
        console.log(`Wallet chain_${i} exception:`, ex)
      }
    }
    console.log("Sent " + totalSent + " transactions successfully")
  }

  async sendBatchNode(hexListByAddress) {
    let parallelChains = []
    while (hexListByAddress.length) {
      parallelChains.push(hexListByAddress.splice(0, this.numParallelTx))
    }

    for (let i = 0; i < parallelChains.length; i++) {
      console.log("chain ", i, )
      try {
        await Promise.all(parallelChains[i].map(async (hexList) => {
            try {
                await this.sendTxChainAsync(hexList)
            } catch (ex) {
                console.log(ex)
            }
        }))
      } catch (ex) {
        console.log(`Wallet chain_${i} exception:`, ex)
      }
    }

    console.log("Broadcast complete")
  }

  txidFromHex(hex) {
    let buffer = Buffer.from(hex, "hex")
    let hash = BITBOX.Crypto.hash256(buffer).toString('hex')
    return hash.match(/[a-fA-F0-9]{2}/g).reverse().join('')
  }

  splitAddress(wallet, numAddresses, satsPerAddress, hdNode, node0, changeAddress, satsChange, maxTxChain) {
    let transactionBuilder = new BITBOX.TransactionBuilder('testnet');
    transactionBuilder.addInput(wallet.txid, wallet.vout);

    let walletChains = []
    for (let i = 0; i < numAddresses; i++) {
      let walletChain = []

      let firstNode = BITBOX.HDNode.derivePath(hdNode, `1/${i + 1}`)
      let firstNodeLegacyAddress = BITBOX.HDNode.toLegacyAddress(firstNode)

      walletChain.push({
        vout: i,
        address: firstNodeLegacyAddress,
        satoshis: satsPerAddress,
        keyPair: BITBOX.HDNode.toKeyPair(firstNode)
      })

      transactionBuilder.addOutput(firstNodeLegacyAddress, satsPerAddress)

      // Derive next maxTxChain-1 addresses and keypairs for this chain
      for (let j = 0; j < maxTxChain - 1; j++) {
        walletChain.push({
          keyPair: BITBOX.HDNode.toKeyPair(firstNode),
          address: firstNodeLegacyAddress
        })
      }

      walletChains.push(walletChain)
    }

    // write stresstestbitcoin.cash to the chain w/ OP_RETURN
    transactionBuilder.addOutput(this.opReturnTagBuffer, 0);
    
    // Check change against dust limit
    if (satsChange >= 546) {
      transactionBuilder.addOutput(changeAddress, satsChange)
    }

    let keyPair = BITBOX.HDNode.toKeyPair(node0);

    let redeemScript
    transactionBuilder.sign(0, keyPair, redeemScript, transactionBuilder.hashTypes.SIGHASH_ALL, wallet.satoshis)

    let hex = transactionBuilder.build().toHex()

    // txid of this split/fanout tx
    let splitTxid = this.txidFromHex(hex)

    let walletsWithTxid = walletChains.map((wc) => {
      wc[0].txid = splitTxid
      return wc
    })

    return {
      hex: hex,
      wallets: walletsWithTxid,
    }
  }


  createChainedMegaTransactions(walletChains, numTxToChain, refundAddress) {
    let hexByAddress = []
    let finalTx = new BITBOX.TransactionBuilder('testnet');
    let finalByteCount = BITBOX.BitcoinCash.getByteCount({ P2PKH: walletChains.length }, { P2PKH: 1 })

    for (let i = 0; i < walletChains.length; i++) {
      let walletChain = walletChains[i]
      
      let hexList = []
      let wallet = walletChain[0]
      for (let j = 0; j < numTxToChain; j++) {
        // Update keyPair to sign current tx
        wallet.keyPair = walletChain[j].keyPair
        // Send tx to next address until last tx, then send back to refundAddress
        let targetAddress

        if (j == numTxToChain - 1) {
          finaltx.addInput(walletChain[j].txid, walletChain[j].vout)
          finalTx.sign(i, walletChain[j].keyPair, redeemScript, transactionBuilder.hashTypes.SIGHASH_SINGLE, wallet.satoshis)
        } else {
          let txResult = this.createTx(wallet, walletChain[j + 1].address)
        }

        // Update wallet for next send
        wallet.txid = txResult.txid
        wallet.satoshis = txResult.satoshis
        wallet.vout = txResult.vout

        hexList.push(txResult.hex)
      }
      hexByAddress.push(hexList.slice())
    }

    let satoshisAfterFee = finaltx.satoshis - finalByteCount
    finalTx.addOutput(refundAddress, satoshisAfterFee)
    let redeemScript

    return hexByAddress
  }

  createChainedTransactions(walletChains, numTxToChain, refundAddress) {
    let hexByAddress = []
    for (let i = 0; i < walletChains.length; i++) {
      let walletChain = walletChains[i]
      
      let hexList = []
      let wallet = walletChain[0]
      for (let j = 0; j < numTxToChain; j++) {
        // Update keyPair to sign current tx
        wallet.keyPair = walletChain[j].keyPair
        // Send tx to next address until last tx, then send back to refundAddress
        let targetAddress
        if (j == numTxToChain - 1)
          targetAddress = refundAddress
        else
          targetAddress = walletChain[j + 1].address

        let txResult = this.createTx(wallet, targetAddress)

        // Update wallet for next send
        wallet.txid = txResult.txid
        wallet.satoshis = txResult.satoshis
        wallet.vout = txResult.vout

        hexList.push(txResult.hex)
      }
      hexByAddress.push(hexList.slice())
    }

    return hexByAddress
  }

  createTx(wallet, targetAddress) {
    let transactionBuilder = new BITBOX.TransactionBuilder('testnet')
    transactionBuilder.addInput(wallet.txid, wallet.vout)

    // Calculate fee @ 1 sat/byte
    let byteCount = BITBOX.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: 3 }) * feeRate

    // if (window.scaleCashSettings.isTestnet) byteCount *= 25
    // byteCount *= 25

    let satoshisAfterFee = wallet.satoshis - byteCount

    transactionBuilder.addOutput(targetAddress, satoshisAfterFee)
    
    // write stresstestbitcoin.cash to the chain w/ OP_RETURN
    transactionBuilder.addOutput(this.opReturnTagBuffer, 0);
    let redeemScript
    transactionBuilder.sign(0, wallet.keyPair, redeemScript, transactionBuilder.hashTypes.SIGHASH_ALL, wallet.satoshis)

    let hex = transactionBuilder.build().toHex()

    let txid = this.txidFromHex(hex)
    return { txid: txid, satoshis: satoshisAfterFee, vout: 0, hex: hex }
  }
}

module.exports = StresstestShared