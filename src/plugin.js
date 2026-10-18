const { DiscordConnection } = require("./rpc");
const { plugin } = require("@eniac/flexdesigner");
const { VoiceState } = require("./voice-state");
const { createSoundPreparer, decorateKey, soundData, groupSounds } = require("./soundboard");

function registerPlugin(plugin) {
  const connection = new DiscordConnection(plugin);
  const voice = new VoiceState(plugin, connection);
  const prepareSound = createSoundPreparer(connection);

  const toggle = (field) =>
    connection.run(async (client) => {
      const beforeRead = voice.revision;
      const settings = await client.getVoiceSettings();

      voice.apply(settings, client, beforeRead);

      const revision = voice.revision;
      const result = await client.setVoiceSettings({
        [field]: !settings[field],
      });

      voice.apply(result, client, revision);

      if (typeof result?.mute !== "boolean" || typeof result?.deaf !== "boolean")
        await voice.refresh(client);

      return result;
    });

  const restore = () =>
    connection.restore().catch((error) => console.warn(`Discord: ${error.message}`));

  plugin.onConnect = restore;

  plugin.on("plugin.alive", (payload) => {
    voice.setKeys(payload.serialNumber, payload.keys || []);
    restore();
  });

  plugin.on("device.status", (statuses) => {
    for (const device of statuses || []) {
      if (device.status === "disconnected") {
        voice.setKeys(device.serialNumber, []);
      }
    }
  });

  plugin.on("ui.message", async (payload) => {
    const command = typeof payload === "string" ? payload : payload?.command;

    switch (command) {
      case "soundboard-catalog":
        return connection.run(async (client) => {
          const sounds = await client.getSoundboardSounds();
          let guilds = [];
          // Missing guild metadata must not prevent choosing an otherwise available sound.
          try {
            guilds = (await client.getGuilds()) || [];
          } catch {
            /* Group by guild ID instead. */
          }

          return { sounds, guilds, items: groupSounds(sounds, guilds) };
        });

      case "prepare-sound":
        try {
          return {
            ok: true,
            key: decorateKey(payload.key, await prepareSound(payload.sound)),
          };
        } catch (error) {
          return { ok: false, error: error.message };
        }

      case "status":
        return { ...connection.status(), voice: voice.status() };

      case "save-settings":
        return connection.saveSettings(payload);

      case "authenticate":
        return connection.authenticate();

      case "disconnectDiscord":
      case "disconnect-rpc":
        return connection.disconnect();

      case "getSounds":
        return connection.run((client) => client.getSoundboardSounds());

      case "getGuilds":
        return connection.run(async (client) => await client.getGuilds());

      case "mute":
        return toggle("mute");

      default:
        throw new Error("Unknown Discord plugin command");
    }
  });

  async function showError(payload, error) {
    // Use the firmware's temporary toast. Redrawing a key to show an error can
    // destroy an emoji/custom image if the host cannot reproduce its original artwork.
    try {
      await plugin._call("show-snackbar-message", {
        serialNumber: payload.serialNumber,
        msg: error.message.slice(0, 64),
        level: "error",
        icon: "warning",
        timeout: 2500,
      });
    } catch {
      /* Device disconnected. */
    }
  }

  plugin.on("plugin.data", async (payload) => {
    const key = payload?.data?.key;

    try {
      switch (key?.cid) {
        case "com.corwindev.discord.soundboard": {
          // Old daemon bindings remain readable, but new selections belong to the key.
          const saved = key.data?.sound ? null : await plugin.getConfig();
          const sound = soundData(
            key.data?.sound || saved?.soundboardBindings?.[key.uid] || key.data,
          );

          await connection.run((client) =>
            client.playSoundboardSound(sound.sound_id, sound.guild_id || "0"),
          );

          break;
        }

        case "com.corwindev.discord.mute":
          await toggle("mute");
          break;

        case "com.corwindev.discord.deafen":
          await toggle("deaf");
          break;

        case "com.corwindev.discord.camera":
          await connection.run((client) => client.toggleVideo());
          break;

        default:
          throw new Error("Unknown Discord key");
      }

      return { status: "success" };
    } catch (error) {
      console.warn(`Discord action failed: ${error.message}`);
      await showError(payload, error);

      throw error;
    }
  });

  return () => {
    voice.stop();
    connection.stop();
    plugin.stop();
  };
}

const stop = registerPlugin(plugin);

process.once("SIGTERM", stop);
process.once("SIGINT", stop);
plugin.start();
