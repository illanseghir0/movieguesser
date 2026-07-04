<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useGameStore } from "./stores/game";
import { useListStore } from "./stores/list";
import { useProfileStore } from "./stores/profile";
import TheHeader from "./components/TheHeader.vue";
import HomeScreen from "./components/HomeScreen.vue";
import SettingsScreen from "./components/SettingsScreen.vue";
import PlayScreen from "./components/PlayScreen.vue";
import EndScreen from "./components/EndScreen.vue";
import HandoffOverlay from "./components/HandoffOverlay.vue";
import AuthModal from "./components/AuthModal.vue";

const game = useGameStore();
const list = useListStore();
const profile = useProfileStore();

/* backdrop : l'affiche du film en cours, floutée en pleine page */
const backdropSrc = computed(() =>
  game.screen === "play" ? game.current?.poster || null : null);
const backdropOn = ref(false);
watch(backdropSrc, () => { backdropOn.value = false; });

const bootUrl = ref<string | null>(null);
onMounted(async () => {
  profile.init();
  bootUrl.value = await list.boot();
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

    <HomeScreen v-if="game.screen === 'home'" :boot-url="bootUrl" />
    <SettingsScreen v-else-if="game.screen === 'settings'" />
    <PlayScreen v-else-if="game.screen === 'play'" />
    <EndScreen v-else />

    <footer>
      Hot-seat sur un seul écran · estimations cachées jusqu'à la révélation<br>
      d'après les listes publiques Letterboxd
    </footer>
  </div>

  <HandoffOverlay v-if="game.handoffOpen" />
  <AuthModal v-if="profile.authOpen" />
</template>
