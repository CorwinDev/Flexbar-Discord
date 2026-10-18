const PREFIX = "com.corwindev.discord.";
const isVoiceKey = (key) => key?.cid === PREFIX + "mute" || key?.cid === PREFIX + "deafen";
const manifest = require("../com.corwindev.discord.plugin/manifest.json");
const defaultStyles = new Map(
  manifest.keyLibrary.children.filter(isVoiceKey).map((key) => [key.cid, key.style.multiStyle]),
);

class VoiceState {
  constructor(plugin, connection) {
    Object.assign(this, { plugin, connection });
    this.keys = new Map();
    this.lastIcons = new Map();
    this.settings = {};
    this.revision = 0;
    this.drawQueue = Promise.resolve();
    this.onSession = (client) => this.session(client);
    this.onSettings = (settings, client) => this.apply(settings, client);
    connection.on("session", this.onSession);
    connection.on("voice-settings", this.onSettings);
    this.session(connection.state === "ready" ? connection.client : null);
  }

  session(client) {
    this.client = client;
    this.settings = {};
    this.revision++;
    this.subscription = null;
    this.refreshing = null;
    this.lastIcons.clear();
    this.render();
    this.updatePolling();
    this.sync().catch(() => {});
  }

  setKeys(serial, keys) {
    this.keys.set(
      serial,
      new Map(keys.filter(isVoiceKey).map((key) => [key.uid, structuredClone(key)])),
    );

    for (const id of this.lastIcons.keys())
      if (id.startsWith(serial + ":")) this.lastIcons.delete(id);

    this.render();
    this.updatePolling();
    this.sync().catch(() => {});
  }

  hasKeys() {
    return [...this.keys.values()].some((keys) => keys.size > 0);
  }

  status() {
    return {
      mute: this.settings.mute ?? null,
      deaf: this.settings.deaf ?? null,
      visibleKeys: [...this.keys.values()].reduce((total, keys) => total + keys.size, 0),
    };
  }

  updatePolling() {
    clearInterval(this.timer);

    if (this.client && this.hasKeys() && !this.stopped) {
      this.timer = setInterval(() => this.refresh().catch(() => {}), 5000);
      this.timer.unref?.();
    }
  }

  async sync() {
    const client = this.client;

    if (!client || !this.hasKeys() || this.stopped) return;

    if (!this.subscription) {
      // evt belongs at the top level of SUBSCRIBE, not inside args.
      this.subscription = client.subscribe("VOICE_SETTINGS_UPDATE").catch(() => {});
    }

    await this.subscription;

    if (this.client === client) await this.refresh();
  }

  refresh(client = this.client) {
    if (!client || client !== this.client || this.stopped) return Promise.resolve();

    if (this.refreshing) return this.refreshing;

    const revision = this.revision;
    const pending = client.getVoiceSettings().then((settings) => {
      // An event received while GET was in flight is newer than its snapshot.
      if (this.revision === revision) this.apply(settings, client);
    });

    this.refreshing = pending;
    pending
      .finally(() => {
        if (this.refreshing === pending) this.refreshing = null;
      })
      .catch(() => {});

    return pending;
  }

  apply(settings, client, expectedRevision) {
    if (
      this.stopped ||
      !client ||
      client !== this.client ||
      !settings ||
      (expectedRevision !== undefined && expectedRevision !== this.revision)
    )
      return;

    const values = Object.fromEntries(
      ["mute", "deaf"]
        .filter((field) => typeof settings[field] === "boolean")
        .map((field) => [field, settings[field]]),
    );

    if (!Object.keys(values).length) return;

    this.settings = { ...this.settings, ...values };
    this.revision++;
    this.render();
  }

  state(key) {
    const { mute, deaf } = this.settings;

    if (key.cid === PREFIX + "mute") {
      if (mute === true || deaf === true) return 1;

      if (mute === false && deaf === false) return 0;
    } else if (typeof deaf === "boolean") return deaf ? 1 : 0;

    return null;
  }

  presentation(key) {
    const state = this.state(key);

    if (state !== null && key.cfg?.keyType === "multiState")
      return { state, signature: `state:${state}` };

    const base = key.style || {};
    const custom = Array.isArray(base.multiStyle) && base.multiStyle.length >= 2;
    const selected =
      state === null
        ? { icon: "mdi mdi-help-circle-outline", showIcon: true }
        : custom
          ? base.multiStyle[state]
          : defaultStyles.get(key.cid)[state];
    const style = {
      ...base,
      ...selected,
      width: base.width || key.width || selected.width || 240,
    };

    delete style.multiStyle;

    return { style, signature: JSON.stringify(style) };
  }

  render() {
    this.drawQueue = this.drawQueue
      .then(async () => {
        if (this.stopped) return;

        for (const [serial, keys] of this.keys) {
          for (const [uid, key] of keys) {
            if (this.stopped || this.keys.get(serial) !== keys) break;

            const presentation = this.presentation(key),
              id = `${serial}:${uid}`;

            if (this.lastIcons.get(id) === presentation.signature) continue;

            try {
              if (presentation.state !== undefined)
                await this.plugin.set(serial, key, { state: presentation.state });
              else {
                const rendered = structuredClone(key);

                rendered.style = presentation.style;
                await this.plugin.draw(serial, rendered);
              }

              if (
                !this.stopped &&
                this.keys.get(serial) === keys &&
                this.presentation(key).signature === presentation.signature
              ) {
                this.lastIcons.set(id, presentation.signature);
              }
            } catch {
              /* Host rejects keys after a page switch or device disconnect. */
            }
          }
        }
      })
      .catch(() => {});

    return this.drawQueue;
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.connection.off("session", this.onSession);
    this.connection.off("voice-settings", this.onSettings);
    this.keys.clear();
  }
}

module.exports = { VoiceState };
