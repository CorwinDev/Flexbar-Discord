
<template>
  <v-container>
    <!-- Show sounds in select -->
    <v-row>
      <v-col cols="12">
        <v-select :item-props="itemProps" :items="sounds" label="Sound to play" v-model="modelValue.data.sound" @change="$emit('update:modelValue', modelValue)"></v-select>
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
  emits: ['update:modelValue'],
  data() {
    return {
      sounds: [],
    };
  },
  methods: {
    async loadData() {
      const guilds = await this.$fd.sendToBackend("getGuilds");
      this.guilds = guilds;
      const sounds = await this.$fd.sendToBackend("getSounds");
      this.sounds = sounds;
    },
    testRangeMin() {
      this.$fd.info(this.modelValue.data.rangeMin);
    },
    itemProps(item) {
      var guild = '';
      if(item.guild_id && item.guild_id != 0) {
        guild = this.guilds.find((guild) => guild.id === item.guild_id).name;
      }

      return {
        key: item.sound_id,
        title: item.name,
        subtitle: guild,
      };
    },
  },
  mounted() {
    this.loadData();
  }
};
</script>

<style scoped></style>
