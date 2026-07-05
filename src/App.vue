<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useGameStore } from "./stores/game";
import { useListStore } from "./stores/list";
import { useProfileStore } from "./stores/profile";
import { useFriendsStore } from "./stores/friends";
import TheHeader from "./components/TheHeader.vue";
import TheFooter from "./components/TheFooter.vue";
import HandoffOverlay from "./components/HandoffOverlay.vue";

const route = useRoute();
const game = useGameStore();
const list = useListStore();
const profile = useProfileStore();

/* backdrop : l'affiche du film en cours, floutée en pleine page */
const backdropSrc = computed(() =>
  route.name === "jeu" ? game.current?.poster || null : null);
const backdropOn = ref(false);
watch(backdropSrc, () => { backdropOn.value = false; });

onMounted(() => {
  profile.init();
  list.boot();
  list.loadCatalog(); // précharge le catalogue (covers du carrousel)
});

/* connecté = présent sur le canal "online" (état en ligne des amis) */
const friends = useFriendsStore();
watch(() => profile.profile, (p) => {
  if (p) { friends.startPresence(); friends.load(); }
  else friends.stopPresence();
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
    <router-view />
    <!-- pas de footer en pleine partie (immersion, duel comme compétitif) -->
    <TheFooter v-if="route.name !== 'jeu' && route.name !== 'competJeu'" />
  </div>

  <HandoffOverlay v-if="game.handoffOpen" />
</template>
