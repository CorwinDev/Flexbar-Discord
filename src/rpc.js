const { RPClient } = require("@corwinjs/rpcord");

const rpcError = (message, code = "CONNECTION_CLOSED") =>
  Object.assign(new Error(message), { code });
const { EventEmitter } = require("node:events");

// Preserve the plugin's feature scopes, including Discord's private video controls.
const SCOPES = [
  "identify",
  "rpc",
  "rpc.voice.read",
  "rpc.voice.write",
  "rpc.video.read",
  "rpc.video.write",
  "rpc.screenshare.write",
  "rpc.screenshare.read",
  "guilds",
];
const AUTH_ERRORS = new Set([
  "AUTH_REQUIRED",
  "INVALID_CREDENTIALS",
  "RPC_UNSUPPORTED",
  4006,
  4007,
  4008,
  4009,
  5000,
]);
const TOKEN_FIELDS = ["accessToken", "refreshToken", "authCode", "expires"];

class DiscordConnection extends EventEmitter {
  constructor(plugin) {
    super();
    this.plugin = plugin;
    this.retryDelay = 1000;
    this.requestTimeout = 15000;
    this.state = "disconnected";
    this.generation = 0;
    this.configQueue = Promise.resolve();
    this.actionQueue = Promise.resolve();
    this.desired = false;
    this.expires = 0;
  }

  status() {
    return {
      state: this.state,
      connected: this.state === "ready",
      enabled: this.desired,
      error: this.error || null,
    };
  }

  updateConfig(operation) {
    const next = this.configQueue.then(async () =>
      operation({ ...((await this.plugin.getConfig()) || {}) }),
    );

    this.configQueue = next.catch(() => {});

    return next;
  }

  invalidate() {
    this.generation++;
    clearTimeout(this.retryTimer);
    clearTimeout(this.refreshTimer);
    this.retryTimer = this.refreshTimer = null;
    this.controller?.abort();

    const client = this.client;

    this.client = null;
    this.attempt = null;
    client?.disconnect(rpcError("Discord connection cancelled", "CANCELLED"));
    this.expires = 0;
    this.state = "disconnected";
    this.emit("session", null);
  }

  saveSettings({ clientId, clientSecret }) {
    if (typeof clientId !== "string" || typeof clientSecret !== "string") {
      return Promise.reject(
        rpcError("Client ID and secret must be strings", "INVALID_CREDENTIALS"),
      );
    }

    return this.updateConfig(async (config) => {
      clientId = clientId.trim();
      clientSecret = clientSecret.trim();

      if (config.clientId !== clientId || config.clientSecret !== clientSecret) {
        this.desired = false;
        this.invalidate();

        for (const field of TOKEN_FIELDS) delete config[field];

        config.autoConnect = false;
      }

      await this.plugin.setConfig({ ...config, clientId, clientSecret });

      return this.status();
    });
  }

  async disconnect() {
    this.desired = false;
    this.invalidate();
    this.error = null;
    await this.updateConfig(async (config) => {
      for (const field of TOKEN_FIELDS) delete config[field];

      config.autoConnect = false;
      await this.plugin.setConfig(config);
    });

    return this.status();
  }

  async restore() {
    if (this.attempt || this.state === "ready" || this.retryTimer || this.state === "auth-required")
      return;

    const config = await this.configQueue.then(() => this.plugin.getConfig());

    if (config?.autoConnect !== false && (config?.accessToken || config?.refreshToken))
      await this.ensureConnected();
  }

  authenticate() {
    // Consent may outlive the host UI bridge's short request deadline. The UI polls status.
    this.error = null;

    if (this.state !== "ready") this.state = "connecting";

    const generation = this.generation;

    if (this.attempt && !this.attemptInteractive) {
      this.attempt
        .catch((error) => {
          if (this.generation === generation && AUTH_ERRORS.has(error.code))
            return this.ensureConnected(true);
        })
        .catch(() => {});
    } else this.ensureConnected(true).catch(() => {});

    return this.status();
  }

  ensureConnected(interactive = false) {
    if (this.stopped) return Promise.reject(rpcError("Discord plugin stopped", "CANCELLED"));

    if (this.attempt) return this.attempt;

    if (
      this.state === "ready" &&
      this.client?.connected &&
      (!this.expires || this.expires > Date.now() + 1000)
    ) {
      return Promise.resolve(this.client);
    }

    const attempt = this.connect(interactive, this.generation);

    this.attempt = attempt;
    this.attemptInteractive = interactive;
    attempt
      .finally(() => {
        if (this.attempt === attempt) this.attempt = null;
      })
      .catch(() => {});

    return attempt;
  }

  checkGeneration(generation) {
    if (generation !== this.generation) throw rpcError("Discord connection cancelled", "CANCELLED");
  }

  async exchangeToken(config, grant, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();

    signal.addEventListener("abort", abort, { once: true });

    if (signal.aborted) abort();

    const timer = setTimeout(abort, this.requestTimeout);

    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...grant,
      });
      const response = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        const temporary = response.status >= 500 || response.status === 429;

        throw rpcError(
          temporary
            ? "Discord token service is temporarily unavailable"
            : "Discord authorization must be renewed",
          temporary ? "TOKEN_NETWORK_ERROR" : "AUTH_REQUIRED",
        );
      }

      if (
        typeof data.access_token !== "string" ||
        !Number.isFinite(data.expires_in) ||
        data.expires_in <= 0
      ) {
        throw rpcError("Incomplete Discord token response", "TOKEN_NETWORK_ERROR");
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || config.refreshToken,
        expires: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      };
    } catch (error) {
      if (error.code === "AUTH_REQUIRED" || error.code === "TOKEN_NETWORK_ERROR") throw error;

      throw rpcError("Discord token request failed or timed out", "TOKEN_NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }

  async connect(interactive, generation) {
    let client;
    const controller = new AbortController();

    this.controller = controller;

    try {
      clearTimeout(this.retryTimer);
      clearTimeout(this.refreshTimer);
      this.retryTimer = this.refreshTimer = null;

      const config = {
        ...((await this.configQueue.then(() => this.plugin.getConfig())) || {}),
      };

      this.checkGeneration(generation);

      if (!config.clientId || !config.clientSecret)
        throw rpcError("Enter your Discord client ID and secret", "INVALID_CREDENTIALS");

      if (
        !interactive &&
        (config.autoConnect === false || (!config.accessToken && !config.refreshToken))
      ) {
        throw rpcError("Connect Discord in the plugin settings first", "AUTH_REQUIRED");
      }

      this.desired = true;
      this.error = null;
      this.state = "connecting";

      const oldClient = this.client;

      this.client = null;
      oldClient?.disconnect();
      client = new RPClient(config.clientId, { secret: config.clientSecret, scopes: SCOPES });
      this.client = client;
      client.on("dispatch", (message) => {
        if (this.client === client && message.evt === "VOICE_SETTINGS_UPDATE") {
          this.emit("voice-settings", message.data, client);
        }
      });
      client.on("disconnect", (error) => {
        controller.abort();

        if (this.client !== client || this.generation !== generation) return;

        this.state = "disconnected";
        this.error = error.message;

        if (!this.attempt) this.failed(error);
      });
      await client.connect();
      this.checkGeneration(generation);
      this.state = "authenticating";

      let tokens = {
        accessToken: config.accessToken,
        refreshToken: config.refreshToken,
        expires: config.expires,
      };
      const expired =
        !tokens.accessToken || (Date.parse(tokens.expires) || 0) <= Date.now() + 30000;
      const authorize = async () => {
        if (!interactive)
          throw rpcError(
            "Reconnect Discord in the plugin settings to authorize again",
            "AUTH_REQUIRED",
          );

        const result = await client.request(
          "AUTHORIZE",
          { client_id: config.clientId, scopes: SCOPES },
          120000,
        );

        if (!result?.code)
          throw rpcError("Discord did not return an authorization code", "AUTH_REQUIRED");
        // A new authorization must not inherit the refresh token of a revoked grant.
        return this.exchangeToken(
          { ...config, refreshToken: undefined },
          { grant_type: "authorization_code", code: result.code },
          controller.signal,
        );
      };
      const renew = async () => {
        if (tokens.refreshToken) {
          try {
            tokens = await this.exchangeToken(
              config,
              {
                grant_type: "refresh_token",
                refresh_token: tokens.refreshToken,
              },
              controller.signal,
            );
          } catch (error) {
            if (!interactive || error.code !== "AUTH_REQUIRED") throw error;

            tokens = await authorize();
          }
        } else tokens = await authorize();
      };

      if (expired) await renew();
      // Save refresh-token rotation even if IPC subsequently drops during AUTHENTICATE.
      const persist = () =>
        this.updateConfig(async (current) => {
          this.checkGeneration(generation);

          if (current.clientId !== config.clientId || current.clientSecret !== config.clientSecret)
            throw rpcError("Discord settings changed", "CANCELLED");

          const next = { ...current, ...tokens, autoConnect: true };

          delete next.authCode;
          await this.plugin.setConfig(next);
        });

      await persist();
      this.checkGeneration(generation);

      let auth;

      try {
        auth = await client.request("AUTHENTICATE", {
          access_token: tokens.accessToken,
        });
      } catch (error) {
        if (!AUTH_ERRORS.has(error.code)) throw error;

        if (tokens.refreshToken && !expired) {
          await renew();
        } else tokens = await authorize();

        await persist();
        auth = await client.request("AUTHENTICATE", {
          access_token: tokens.accessToken,
        });
      }

      this.checkGeneration(generation);
      this.expires = Date.parse(auth?.expires || tokens.expires) || 0;
      this.state = "ready";
      this.error = null;
      this.retries = 0;
      this.emit("session", client);

      if (this.expires) {
        this.refreshTimer = setTimeout(
          () => {
            this.state = "disconnected";
            this.ensureConnected().catch(() => {});
          },
          Math.min(2147483647, Math.max(1000, this.expires - Date.now() - 30000)),
        );
        this.refreshTimer.unref?.();
      }

      return client;
    } catch (error) {
      if (this.generation === generation) {
        this.client = null;
        this.failed(error);
      }

      client?.disconnect();

      throw error;
    }
  }

  failed(error) {
    this.emit("session", null);
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.error = error.message;
    this.state = AUTH_ERRORS.has(error.code) ? "auth-required" : "disconnected";

    if (this.desired && this.state !== "auth-required" && error.code !== "CANCELLED") {
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(
        () => {
          this.retryTimer = null;
          this.ensureConnected().catch(() => {});
        },
        Math.min(30000, this.retryDelay * 2 ** Math.min(this.retries || 0, 5)),
      );
      this.retries = (this.retries || 0) + 1;
      this.retryTimer.unref?.();
    }
  }

  run(action) {
    // Serialize read/modify/write toggles. Never replay a command after an ambiguous timeout.
    const generation = this.generation;
    const next = this.actionQueue.then(async () => {
      this.checkGeneration(generation);

      if (this.attempt && this.attemptInteractive && this.state !== "ready") {
        throw rpcError("Finish Discord authorization before using its controls", "AUTH_REQUIRED");
      }

      const client = await this.ensureConnected();

      try {
        return await action(client);
      } catch (error) {
        if (AUTH_ERRORS.has(error.code) || error.code === "TIMEOUT") client.disconnect(error);

        throw error;
      }
    });

    this.actionQueue = next.catch(() => {});

    return next;
  }

  stop() {
    this.stopped = true;
    this.desired = false;
    this.invalidate();
  }
}

module.exports = { DiscordConnection };
