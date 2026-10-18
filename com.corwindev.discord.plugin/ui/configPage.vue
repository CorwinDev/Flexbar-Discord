<template>
  <v-container>
    <v-card elevation="2" class="mb-4 rounded-lg">
      <v-card-item>
        <v-card-title>Discord Configuration</v-card-title>
        <v-card-subtitle>{{ statusText }}</v-card-subtitle>
      </v-card-item>
      <v-divider></v-divider>
      <v-card-text>
        <v-text-field
          v-model="clientId"
          label="Discord Client ID"
          density="compact"
          hide-details="auto"
          class="mb-3"
          :disabled="isBusy"
        ></v-text-field>
        <v-text-field
          v-model="clientSecret"
          label="Discord Client Secret"
          type="password"
          density="compact"
          hide-details="auto"
          class="mb-3"
          :disabled="isBusy"
        ></v-text-field>
        <v-alert
          v-if="isAuthenticated"
          type="success"
          text="Connected to Discord"
          density="compact"
          class="mt-3"
        ></v-alert>
        <v-alert
          v-else-if="error"
          type="error"
          :text="error"
          density="compact"
          class="mt-3"
        ></v-alert>
      </v-card-text>
      <v-card-actions class="pa-3">
        <v-spacer></v-spacer>
        <v-btn
          v-if="!isAuthenticated"
          color="green"
          variant="flat"
          @click="authenticateDiscord"
          :loading="isBusy"
          :disabled="isInitializing || isBusy || !canAuthenticate"
          >Authenticate</v-btn
        >
        <v-btn
          v-if="canDisconnect || isBusy"
          color="red"
          variant="flat"
          @click="disconnectDiscord"
          :disabled="isInitializing"
          >Disconnect</v-btn
        >
        <v-btn
          variant="tonal"
          @click="saveConfig"
          prepend-icon="mdi-content-save-outline"
          class="ml-2"
          :disabled="isInitializing || isBusy"
          >Save</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script>
export default {
  props: { modelValue: { type: Object, required: true } },
  data() {
    return {
      clientId: "",
      clientSecret: "",
      state: "disconnected",
      error: null,
      isBusy: false,
      canDisconnect: false,
      isInitializing: true,
      pollTimer: null,
      disposed: false,
      statusEpoch: 0,
    };
  },
  computed: {
    canAuthenticate() {
      return this.clientId.trim() && this.clientSecret.trim();
    },
    isAuthenticated() {
      return this.state === "ready";
    },
    statusText() {
      if (this.isAuthenticated) return "Connected to Discord";
      if (this.state === "connecting") return "Connecting to Discord…";
      if (this.state === "authenticating") return "Waiting for Discord authorization…";
      return "Enter your Discord App credentials";
    },
  },
  methods: {
    applyStatus(status) {
      this.state = status.state;
      this.error = status.error;
      this.canDisconnect = !!status.enabled;
      this.isBusy = status.state === "connecting" || status.state === "authenticating";
    },
    async persistSettings() {
      // Credentials and token rotation are serialized by the backend. The UI never writes token snapshots.
      const status = await this.$fd.sendToBackend({
        command: "save-settings",
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      });
      this.modelValue.config = {
        clientId: this.clientId.trim(),
        clientSecret: this.clientSecret.trim(),
      };
      return status;
    },
    async saveConfig() {
      this.statusEpoch++;
      try {
        this.applyStatus(await this.persistSettings());
      } catch (error) {
        this.error = error.message;
      }
    },
    async authenticateDiscord() {
      if (this.isBusy) return;
      this.statusEpoch++;
      this.isBusy = true;
      this.error = null;
      try {
        await this.persistSettings();
        this.applyStatus(await this.$fd.sendToBackend("authenticate"));
      } catch (error) {
        this.error = error.message;
        this.isBusy = false;
      }
    },
    async disconnectDiscord() {
      this.statusEpoch++;
      try {
        this.applyStatus(await this.$fd.sendToBackend("disconnectDiscord"));
        this.isBusy = false;
      } catch (error) {
        this.error = error.message;
      }
    },
    async pollStatus() {
      if (this.disposed) return;
      const epoch = this.statusEpoch;
      try {
        const status = await this.$fd.sendToBackend("status");
        if (!this.disposed && epoch === this.statusEpoch) this.applyStatus(status);
      } catch (error) {
        if (!this.disposed && epoch === this.statusEpoch) {
          this.state = "disconnected";
          this.error = error.message;
          this.isBusy = false;
        }
      } finally {
        if (!this.disposed) this.pollTimer = setTimeout(() => this.pollStatus(), 1000);
      }
    },
  },
  async mounted() {
    try {
      const config = (await this.$fd.getConfig()) || {};
      if (this.disposed) return;
      this.clientId = config.clientId || "";
      this.clientSecret = config.clientSecret || "";
    } catch (error) {
      this.error = error.message;
    } finally {
      this.isInitializing = false;
    }
    this.pollStatus();
  },
  beforeUnmount() {
    this.disposed = true;
    clearTimeout(this.pollTimer);
  },
};
</script>

<style scoped>
.v-card-item {
  padding-bottom: 12px;
}
</style>
