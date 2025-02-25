const { plugin, logger } = require('@eniac/flexdesigner')
// Store key data
const keyData = {}
const { connect, rpc } = require('./rpc')

/**
 * Helper function to wait for the rpc connection
 */
async function waitForConnection () {
  return new Promise(async resolve => {
    if (rpc.connected && rpc.authenticated) {
      console.log('rpc:', rpc)
      resolve()
    } else {
      if (!rpc.connected) {
        console.log('Connecting...')
        await connect(plugin)
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

// Watch for process exit
process.on('exit', () => {
  console.log('Exiting...')
  rpc.disconnect()
})

/**
 * Called when current active window changes
 * {
 *    "status": "changed",
 *    "oldWin": OldWindow,
 *    "newWin": NewWindow
 * }
 */
plugin.on('system.actwin', payload => {
  // logger.info('Active window changed:', payload)
})

/**
 * Called when received message from UI send by this.$fd.sendToBackend
 * @param {object} payload message sent from UI
 */
plugin.on('ui.message', async payload => {
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
 * Called when device status changes
 * @param {object} devices device status data
 * [
 *  {
 *    serialNumber: '',
 *    deviceData: {
 *       platform: '',
 *       profileVersion: '',
 *       firmwareVersion: '',
 *       deviceName: '',
 *       displayName: ''
 *    }
 *  }
 * ]
 */
plugin.on('device.status', devices => {
  logger.info('Device status changed:', devices)
})

/**
 * Called when a plugin key is loaded
 * @param {Object} payload alive key data
 * {
 *  serialNumber: '',
 *  keys: []
 * }
 */
plugin.on('plugin.alive', payload => {
  logger.info('Plugin alive:', payload)
  for (let key of payload.keys) {
    keyData[key.uid] = key
    if (key.cid === 'com.corwindev.discord.counter') {
      keyData[key.uid].counter = parseInt(key.data.rangeMin)
      key.style.showIcon = false
      key.style.showTitle = true
      key.title = 'Click Me!'
      plugin.draw(payload.serialNumber, key, 'draw')
    }
  }
})

/**
 * Called when user interacts with a key
 * @param {object} payload key data
 * {
 *  serialNumber,
 *  data
 * }
 */
plugin.on('plugin.data', payload => {
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
  }
})

/**
 * Shows X when a key is executed but fails
 * @param {object} payload key data
 */
function showError (payload) {
  const key = payload.data.key
  const oldData = structuredClone(key)
  console.log(key)
  key.style.showIcon = true
  key.style.icon = 'mdi mdi-alert-circle-outline'
  plugin.draw(payload.serialNumber, key, 'draw')
  setTimeout(() => {
    key.style.showIcon = oldData.style.showIcon
    key.style.icon = oldData.icon
    console.log(key, oldData);
    plugin.draw(payload.serialNumber, oldData, 'draw')
  }, 1000)
}

// Connect to flexdesigner and start the plugin
plugin.start()
