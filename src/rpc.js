const { RPClient } = require('@corwinjs/rpcord')
const path = require('path')

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
const rpc = new RPClient('1343527084533743707', {
  secret: 'xGZ3JQpBGinFB0iYRTHxA4UUt7zsKB6l',
  scopes: scopes
})

rpc.on('ready', () => {
  console.log('Connected!')
})

console.log('connecting')

async function connect (plugin) {
  await rpc
    .connect()
    .then(async () => {
      let accessData
      try {
        accessData = await plugin.openFile(path.resolve(__dirname, 'data.json'))
        accessData = JSON.parse(accessData)
      } catch (error) {
        console.log('Error:', error)
      }
      if (accessData) {
        console.log('Access Data:', accessData)
        if (Date.now() > accessData.expires) {
          await rpc.fetchAccessToken(accessData.authCode).then(async data => {
            const json = {
              token: data.accessToken,
              authCode: data.authCode,
              expires: data.expires
            }
            await plugin.saveFile(
              path.resolve(__dirname, 'data.json'),
              JSON.stringify(json)
            )
            // Update the access token
            accessData = json
          })
        }

        await rpc.authenticate(accessData.token).then(async data => {
          console.log('Authenticated:', data)
          plugin.showSnackbarMessage('success', 'Connected to Discord')
        })
      } else {
        console.log('No access data')
        await rpc
          .authorize()
          .then(async data => {
            console.log('Data:', data)
            const json = {
              token: data.accessToken,
              authCode: data.authCode,
              expires: data.expires
            }
            console.log('Data:', data)
            await plugin
              .saveFile(
                path.resolve(__dirname, 'data.json'),
                JSON.stringify(json)
              )
              .catch(console.error)
          })
          .catch(error => console.error('Errcdor:', error))
      }
    })
    .catch(error => console.error('Error:', error))

  return rpc
}

module.exports = { rpc, connect }
