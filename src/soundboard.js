const validId = (value) => /^(?:0|[1-9]\d{0,19})$/.test(String(value ?? ""));

function soundData(sound) {
  if (
    !validId(sound?.sound_id) ||
    String(sound.sound_id) === "0" ||
    !validId(sound.guild_id || "0")
  )
    throw Error("Select a sound in the key settings first");

  return {
    sound_id: String(sound.sound_id),
    guild_id: String(sound.guild_id || "0"),
    name: String(sound.name || ""),
    emoji_id: sound.emoji_id || null,
    emoji_name: sound.emoji_name || null,
  };
}

function decorateKey(key, sound) {
  const style = {
    ...key.style,
    flags: [...new Set([...(key.style?.flags || []), "title-edited"])],
    showImage: false,
    showEmoji: !!sound.emoji_name && !sound.emoji_id,
    showIcon: !sound.emoji_name || !!sound.emoji_id,
    emoji: sound.emoji_name || "",
    icon: sound.artwork || "mdi-bullhorn",
  };

  return {
    ...key,
    title: sound.name,
    data: { ...key.data, sound: soundData(sound) },
    style,
  };
}

function createSoundPreparer(connection) {
  const images = new Map();

  return async (reference) => {
    const ref = soundData(reference);
    const catalog = await connection.run((client) => client.getSoundboardSounds());
    const selected = catalog.find(
      (sound) =>
        String(sound.sound_id) === ref.sound_id && String(sound.guild_id || "0") === ref.guild_id,
    );

    if (!selected || selected.available === false) throw Error("This sound is unavailable");

    const sound = soundData(selected);

    if (sound.emoji_id) {
      if (!validId(sound.emoji_id) || String(sound.emoji_id) === "0")
        throw Error("Invalid emoji ID");

      if (!images.has(sound.emoji_id)) {
        const response = await fetch(
          `https://cdn.discordapp.com/emojis/${sound.emoji_id}.png?size=128`,
          { signal: AbortSignal.timeout(2500) },
        );

        if (!response.ok) throw Error("Could not download custom emoji");

        const chunks = [];
        let length = 0;

        for await (const chunk of response.body) {
          length += chunk.length;

          if (length > 512 * 1024) throw Error("Emoji image is too large");

          chunks.push(Buffer.from(chunk));
        }

        const image = Buffer.concat(chunks);

        if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
          throw Error("Invalid emoji image");

        if (images.size >= 128) images.delete(images.keys().next().value);

        images.set(sound.emoji_id, `data:image/png;base64,${image.toString("base64")}`);
      }

      sound.artwork = images.get(sound.emoji_id);
    }

    return sound;
  };
}

// Keep the order of GET_GUILDS / the sound catalog. RPC does not expose the
// client's favorite sounds, usage counts, or sidebar ordering.
function groupSounds(sounds, guilds) {
  const buckets = new Map();

  for (const sound of sounds) {
    const id = String(sound.guild_id || "0");

    if (!buckets.has(id)) buckets.set(id, []);

    buckets.get(id).push(sound);
  }

  const known = new Map(guilds.map((guild) => [String(guild.id), guild]));
  const order = [...new Set(["0", ...known.keys(), ...buckets.keys()])];

  return order
    .filter((id) => buckets.has(id))
    .flatMap((id) => {
      const guild = known.get(id);

      return [
        {
          groupHeader: true,
          sound_id: `group:${id}`,
          name: id === "0" ? "Discord" : guild?.name || `Unknown server (${id})`,
          icon_url: guild?.icon_url || null,
          groupIcon: id === "0" ? "mdi-volume-high" : "mdi-account-group",
        },
        ...buckets.get(id),
      ];
    });
}

module.exports = { createSoundPreparer, decorateKey, soundData, groupSounds };
