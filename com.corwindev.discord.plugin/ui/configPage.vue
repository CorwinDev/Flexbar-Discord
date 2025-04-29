<template>
    <v-container>
        <!-- API Configuration Card -->
        <v-card elevation="2" class="mb-4 rounded-lg">
            <v-card-item>
                <v-card-title>Discord Configuration</v-card-title>
                <v-card-subtitle>{{ isAuthenticated ? 'Connected to Discord' : 'Enter your Discord App credentials' }}</v-card-subtitle>
            </v-card-item>
            <v-divider></v-divider>
            <v-card-text>
                <v-text-field 
                    v-model="modelValue.config.clientId" 
                    label="Discord Client ID" 
                    outlined 
                    density="compact"
                    hide-details="auto"
                    class="mb-3"
                ></v-text-field>
                
                <v-text-field 
                    v-model="modelValue.config.clientSecret" 
                    label="Discord Client Secret" 
                    outlined 
                    density="compact"
                    hide-details="auto"
                    type="password"
                    class="mb-3"
                ></v-text-field>
                
                <v-alert
                    v-if="isAuthenticated"
                    type="success"
                    text="Connected to Discord"
                    density="compact"
                    class="mt-3"
                ></v-alert>
            </v-card-text>
            <v-card-actions class="pa-3">
                <v-spacer></v-spacer>
                <v-btn 
                    v-if="canAuthenticate"
                    color="green"
                    variant="flat"
                    @click="authenticateDiscord"
                >
                    Authenticate
                </v-btn>
                
                <v-btn 
                    variant="tonal" 
                    @click="saveConfig" 
                    prepend-icon="mdi-content-save-outline"
                    class="ml-2"
                    :disabled="isInitializing"
                >
                    Save
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-container>
</template>

<script>
export default {
    props: {
        modelValue: {
            type: Object,
            required: true,
        },
    },
    data() {
        return {
            isAuthenticated: false,
            isInitializing: false,
        };
    },
    computed: {
        canAuthenticate() {
            return this.modelValue.config.clientId && 
                   this.modelValue.config.clientSecret
        }
    },
    watch: {
        'modelValue.config': {
            handler: function(newConfig) {
                if (this.isInitializing) return;
                
                this.$fd.info('Config changed:', newConfig);
                this.checkAuthStatus();
            },
            deep: true,
            immediate: true
        }
    },
    methods: {
        async saveConfig() {
            this.$fd.info('Saving config:', this.modelValue.config);
            
            try {
                // First get the current config to make sure we don't override tokens
                const currentConfig = await this.$fd.getConfig();
                
                // Preserve important authentication data
                const updatedConfig = {
                    ...currentConfig,
                    // Only update fields that should be controlled by the UI
                    clientId: this.modelValue.config.clientId,
                    clientSecret: this.modelValue.config.clientSecret,
                };
                
                // Save the merged config
                await this.$fd.setConfig(updatedConfig);
                
                // Update the local model with the full config
                this.modelValue.config = updatedConfig;
            } catch (error) {
                this.$fd.error('Failed to save config:', error);
            }
        },
        async initializeConfig() {
            // Set flag to prevent watcher from triggering recursively
            this.isInitializing = true;
            
            try {
                // get config from local file
                const config = await this.$fd.getConfig();
                
                // Merge with existing config
                if (config) {
                    this.modelValue.config = config;
                } else if (!this.modelValue.config) {
                    this.modelValue.config = {};
                }
                
                this.$fd.info('initializeConfig', this.modelValue.config);
                
                return true;
            } catch (error) {
                this.$fd.error('Failed to initialize config:', error);
                return false;
            } finally {
                // Reset flag when done
                this.isInitializing = false;
            }
        },
        async authenticateDiscord() {
            try {
                // Save the configuration first to ensure the backend has the latest credentials
                await this.saveConfig();
                
                // Send authentication request to the backend plugin
                await this.$fd.sendToBackend('tryConnect');

                // Get the updated config with tokens from backend
                const updatedConfig = await this.$fd.getConfig();
                
                // Update our local model with the full config including tokens
                this.modelValue.config = updatedConfig;
            } catch (error) {
                this.$fd.showSnackbarMessage('Error', error.message, 'error');
            }
        },
        async disconnectDiscord() {
            try {
                // Get current config
                const currentConfig = await this.$fd.getConfig();

                await this.$fd.sendToBackend('disconnectDiscord');
                
                // Create a new config without authentication data
                const updatedConfig = {
                    ...currentConfig,
                    accessToken: null,
                    authCode: null,
                    expires: null,
                };
                
                // Save the updated config
                await this.$fd.setConfig(updatedConfig);
                
                // Update the local model
                this.modelValue.config = updatedConfig;
            } catch (error) {

            }
        },
        checkAuthStatus() {
            // Check if we have valid authentication configuration
            this.isAuthenticated = !!(
                this.modelValue.config && 
                this.modelValue.config.accessToken &&
                this.modelValue.config.authCode
            );
            this.$fd.info('Auth status checked:', this.isAuthenticated);
        },
    },
    created() {
        this.$fd.info('Component created, modelValue:', this.modelValue);
    },
    mounted() {
        this.$fd.info('Component mounted, modelValue:', this.modelValue);
        
        this.initializeConfig().then(() => {
            this.checkAuthStatus();
        });
    }
};
</script>

<style scoped>
/* Add specific styles if needed */
.v-card-item {
    padding-bottom: 12px; /* Adjust spacing */
}
</style>