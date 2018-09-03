let StresstestShared = require('./stresstest-shared')

let main = async () => {
  // Generally set useRest to true. Only set to false if you are running on a local node
  let useRest = false

  // Settings for local node mode below:
  let numParallelTx = 20 // Number of parallel tx your node can handle
  let bitboxConfig = { // Your node's RPC creds
    protocol: 'http',
    host: 'localhost',
    port: 8899,
    username: 'the_beer_engineer',
    password: '7yvzZYCHMfOrwOS12q8cMDS8rG3WSOoWpzCq7Lct4jw=',
    corsproxy: false,
    restURL: 'https://trest.bitcoin.com/v1/',
  }

  let stShared = new StresstestShared(useRest, numParallelTx, bitboxConfig)
  await stShared.start()
}

main()