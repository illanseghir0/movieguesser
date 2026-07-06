<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useGameStore } from "./stores/game";
import { useListStore } from "./stores/list";
import { useProfileStore } from "./stores/profile";
import { useFriendsStore } from "./stores/friends";
import { useRoomStore } from "./stores/rooms";
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

/* connecté = présent sur le canal "online" (état en ligne des amis)
   + à l'écoute des invitations de salon (badge + toast) */
const friends = useFriendsStore();
const rooms = useRoomStore();
watch(() => profile.profile, (p) => {
  if (p) { friends.startPresence(); friends.load(); rooms.startInviteWatch(); }
  else { friends.stopPresence(); rooms.stopInviteWatch(); }
});

/* toast d'invitation : rejoindre d'un clic, où qu'on soit sur le site */
const router = useRouter();
async function joinFromToast() {
  const inv = rooms.toast;
  rooms.toast = null;
  if (!inv) return;
  const e = await rooms.join(inv);
  if (!e) router.push("/entre-amis");
}
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
    <!-- pas de footer en pleine partie (immersion, tous modes) -->
    <TheFooter v-if="!['jeu', 'competJeu', 'amisJeu'].includes(String(route.name))" />
  </div>

  <HandoffOverlay v-if="game.handoffOpen" />

  <!-- invitation reçue en direct : ticket en bas d'écran -->
  <div v-if="rooms.toast" class="inviteToast">
    <span class="tx">🎟️ <b>{{ rooms.toast.from_username }}</b> t'invite à une séance</span>
    <button class="ghost sm" @click="joinFromToast()">Rejoindre</button>
    <button class="linkBtn" @click="rooms.decline(rooms.toast)">refuser</button>
  </div>
</template>
