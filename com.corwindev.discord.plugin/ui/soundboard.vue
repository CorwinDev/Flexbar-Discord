<template>
  <v-container>
    <!-- Show sounds in select -->
    <v-row>
      <v-col cols="12">
        <v-select
          return-object
          :item-props="itemProps"
          :items="soundItems"
          :label="$t('Soundboard.UI.Label')"
          :model-value="modelValue.data.sound || modelValue.data"
          :loading="selecting"
          :disabled="selecting"
          item-value="sound_id"
          @update:model-value="selectSound"
        >
          <template #item="{ item, props }">
            <v-list-subheader
              v-if="props.groupHeader"
              :ref="props.ref"
              :key="props.key"
              class="sound-group-header"
              role="presentation"
            >
              <v-avatar size="24" class="mr-2">
                <v-img v-if="props.groupAvatar" :src="props.groupAvatar" alt="">
                  <template #error
                    ><v-icon size="20">{{ props.groupIcon }}</v-icon></template
                  >
                </v-img>
                <v-icon v-else size="20">{{ props.groupIcon }}</v-icon>
              </v-avatar>
              {{ props.title }}
            </v-list-subheader>
            <v-list-item v-else v-bind="props"></v-list-item>
          </template>
        </v-select>
      </v-col>
    </v-row>
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
  emits: ["update:modelValue"],
  data() {
    return {
      selecting: false,
      sounds: [],
      soundItems: [],
      guilds: [],
    };
  },
  methods: {
    async selectSound(sound) {
      if (!sound || sound.groupHeader || this.selecting) return;
      this.selecting = true;
      try {
        const result = await this.$fd.sendToBackend({
          command: "prepare-sound",
          key: this.modelValue,
          sound,
        });
        if (!result.ok) throw Error(result.error || "Could not select sound");
        this.$emit("update:modelValue", result.key);
      } catch (error) {
        this.$fd.showSnackbarMessage("error", error.message, 3000);
      } finally {
        this.selecting = false;
      }
    },
    async loadData() {
      try {
        const catalog = await this.$fd.sendToBackend("soundboard-catalog");
        if (!Array.isArray(catalog?.items)) throw Error("Could not load soundboard");
        this.guilds = catalog.guilds;
        this.sounds = catalog.sounds;
        this.soundItems = catalog.items;
      } catch (error) {
        this.$fd.showSnackbarMessage("error", error.message, 3000);
      }
    },
    itemProps(item) {
      if (item.groupHeader)
        return {
          title: item.name,
          disabled: true,
          groupHeader: true,
          groupAvatar: item.icon_url,
          groupIcon: item.groupIcon,
        };
      var guild = "";
      if (item.guild_id && item.guild_id != 0) {
        guild = this.guilds.find((guild) => guild.id === item.guild_id)?.name || "Unknown server";
      }

      return {
        key: item.sound_id,
        title: `${item.emoji_name || ""} ${item.name}`.trim(),
        prependAvatar: item.emoji_id
          ? `https://cdn.discordapp.com/emojis/${item.emoji_id}.png?size=64`
          : undefined,
        subtitle: item.available === false ? `${guild}${guild ? " · " : ""}Unavailable` : guild,
        disabled: item.available === false,
      };
    },
  },
  mounted() {
    this.loadData();
  },
};
</script>

<style scoped>
.sound-group-header {
  font-weight: 600;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(128, 128, 128, 0.25);
}
.v-container {
  min-height: 200px;
}
</style>
