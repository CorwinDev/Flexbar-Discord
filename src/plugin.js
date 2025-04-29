const { plugin, logger } = require('@eniac/flexdesigner')
// Store key data
const { connect } = require('./rpc')
let rpc

/**
 * Helper function to wait for the rpc connection
 */
async function waitForConnection () {
  return new Promise(async resolve => {
    if (rpc && rpc.connected && rpc.authenticated) {
      console.log('rpc:', rpc)
      resolve()
    } else {
      if (!rpc || !rpc.connected) {
        console.log('Connecting...')
        await connect(plugin).then(rpcInstance => {
          rpc = rpcInstance
          console.log('Connected to RPC:', rpc)
        })
        resolve()
      } else {
        // Await authentication
        const interval = setInterval(() => {
          if (rpc.authenticated) {
            clearInterval(interval)
            resolve()
          }
        }, 1000)
      }
    }
  })
}

plugin.on('plugin.alive', payload => {
  // console.log(plugin.getConfig(), 'hi')
  if (plugin.getConfig()) {
    // waitForConnection()
  }
})

/**
 * Called when received message from UI send by this.$fd.sendToBackend
 * @param {object} payload message sent from UI
 */
plugin.on('ui.message', async payload => {
  if (payload === 'authenticate') {
    return await waitForConnection()
  } else if (payload === 'disconnect-rpc') {
    // Disconnect from RPC
    if (rpc && rpc.connected) {
      await rpc.disconnect().catch(console.error)
      console.log('Disconnected from RPC')
      return
    } else {
      console.log('RPC not connected')
      return
    }
  }
  await waitForConnection()
  // If message is getSounds, then wait for rpc connection and get soundboard sounds
  if (payload === 'getSounds') {
    const sounds = await rpc.getSoundboardSounds().catch(console.error)
    // console.log('Sounds:', sounds)
    return sounds
  } else if (payload === 'getGuilds') {
    // Get guilds
    const guilds = await rpc.getGuilds().catch(console.error)
    return guilds
  } else if (payload === 'mute') {
    // Get current user voice settings and toggle mute
    const voiceSettings = await rpc.getVoiceSettings().catch(console.error)
    if (!voiceSettings) return
    if (voiceSettings.mute)
      rpc.setVoiceSettings({ mute: false }).catch(console.error)
    else rpc.setVoiceSettings({ mute: true }).catch(console.error)
  }
  logger.info('Received message from UI:', payload)
  return 'Hello from plugin backend!'
})

/**
 * Called when user interacts with a key
 * @param {object} payload key data
 * {
 *  serialNumber,
 *  data
 * }
 */
plugin.on('plugin.data', async payload => {
  console.log(payload)
  if (!rpc || !rpc.connected) {
    console.log('RPC not connected')
    await waitForConnection()
  }
  const data = payload.data
  if (data.key.cid === 'com.corwindev.discord.soundboard') {
    const key = data.key
    // Play sound
    rpc
      .playSoundboardSound(key.data.sound.sound_id, key.data.sound.guild_id)
      .catch(error => {
        console.error('Error playing sound:', error)
        showError(payload)
      })
  } else if (data.key.cid === 'com.corwindev.discord.mute') {
    // Mute
    const voiceSettings = await rpc.getVoiceSettings().catch(console.error)
    if (!voiceSettings) return
    if (voiceSettings.mute)
      rpc.setVoiceSettings({ mute: false }).catch(error => {
        showError(payload)
      })
    else
      rpc.setVoiceSettings({ mute: true }).catch(error => {
        showError(payload)
      })
  } else if (data.key.cid === 'com.corwindev.discord.deafen') {
    // Deafen
    const voiceSettings = await rpc.getVoiceSettings().catch(console.error)
    if (!voiceSettings) return
    if (voiceSettings.deaf)
      rpc.setVoiceSettings({ deaf: false }).catch(error => {
        showError(payload)
      })
    else
      rpc.setVoiceSettings({ deaf: true }).catch(error => {
        showError(payload)
      })
  } else if (data.key.cid === 'com.corwindev.discord.camera') {
    // Toggle camera
    await rpc.toggleVideo().catch(error => {
      showError(payload)
    })
  }
})

/**
 * Shows X when a key is executed but fails
 * @param {object} payload key data
 */
function showError (payload) {
  const key = payload.data.key
  const oldData = structuredClone(key)
  key.style.showIcon = true
  key.style.icon = 'mdi mdi-alert-circle-outline'
  key.style.bgColor = '#fa0505'
  plugin.draw(payload.serialNumber, key, 'draw')
  setTimeout(() => {
    plugin.draw(payload.serialNumber, oldData, 'draw')
  }, 1000)
}

// Connect to flexdesigner and start the plugin
plugin.start()
