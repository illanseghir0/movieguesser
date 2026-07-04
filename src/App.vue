<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useGameStore } from "./stores/game";
import { useListStore } from "./stores/list";
import { useProfileStore } from "./stores/profile";
import TheHeader from "./components/TheHeader.vue";
import HomeScreen from "./components/HomeScreen.vue";
import SetupScreen from "./components/SetupScreen.vue";
import ProfileScreen from "./components/ProfileScreen.vue";
import PlayScreen from "./components/PlayScreen.vue";
import EndScreen from "./components/EndScreen.vue";
import HandoffOverlay from "./components/HandoffOverlay.vue";

const game = useGameStore();
const list = useListStore();
const profile = useProfileStore();

/* backdrop : l'affiche du film en cours, floutée en pleine page */
const backdropSrc = computed(() =>
  game.screen === "play" ? game.current?.poster || null : null);
const backdropOn = ref(false);
watch(backdropSrc, () => { backdropOn.value = false; });

onMounted(() => {
  profile.init();
  list.boot();
});
</script>

<template>
  <div id="backdrop">
    <img v-if="backdropSrc" :src="backdropSrc" alt=""
         :class="{ on: backdropOn }" @load="backdropOn = true">
  </div>
  <div class="spot"></div>

  <div class="wrap">
    <TheHeader />

    <HomeScreen v-if="game.screen === 'home'" />
    <SetupScreen v-else-if="game.screen === 'setup'" />
    <ProfileScreen v-else-if="game.screen === 'profile'" />
    <PlayScreen v-else-if="game.screen === 'play'" />
    <EndScreen v-else />
  </div>

  <HandoffOverlay v-if="game.handoffOpen" />
</template>
