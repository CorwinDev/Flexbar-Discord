const { RPClient } = require('@corwinjs/rpcord')

var scopes = [
  'identify',
  'rpc',
  'rpc.voice.read',
  'rpc.voice.write',
  'rpc.video.read',
  'rpc.video.write',
  'rpc.screenshare.write',
  'rpc.screenshare.read',
  'guilds'
]

// Connect to discord ipc

console.log('connecting')

async function connect (plugin) {
  const config = await plugin.getConfig()
  console.log('Config:', config)

  if (!config.clientId) {
    console.error('No client ID provided')
    return
  }

  var rpc = new RPClient(config.clientId, {
    secret: config.clientSecret,
    scopes: scopes
  })

  await rpc
    .connect()
    .then(async () => {
      if (config.accessToken) {
        if (Date.now() > new Date(config.expires).getTime()) {
          await rpc.fetchAccessToken(config.authCode).then(async data => {
            const json = {
              ...config,
              accessToken: data.accessToken,
              authCode: data.authCode,
              expires: data.expires
            }
            await plugin.setConfig(json)
            console.log('Updated config:', json)
          })
        }

        await rpc.authenticate(config.accessToken).then(async data => {
          console.log('Authenticated:', data)
        })
      } else {
        console.log('No access data')
        await rpc
          .authorize()
          .then(async data => {
            const json = {
              ...config,
              accessToken: data.accessToken,
              authCode: data.authCode,
              expires: data.expires
            }
            await plugin.setConfig(json)
            plugin.showSnackbarMessage('success', 'Connected to Discord')
          })
          .catch(error => console.error('Errcor:', error))
      }
    })
    .catch(error => console.error('Error:', error))

  return rpc
}

async function disconnect (rpc) {
  await rpc.disconnect().catch(error => console.error('Error:', error))
  console.log('Disconnected')
}

module.exports = { connect, disconnect }
