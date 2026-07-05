<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useGameStore } from "../stores/game";
import { useProfileStore } from "../stores/profile";

const route = useRoute();
const game = useGameStore();
const profile = useProfileStore();

const initiale = computed(() =>
  (profile.profile?.username ?? "?").charAt(0).toUpperCase());

/* sortie en pleine partie (écrans de jeu uniquement, pas les génériques) :
   on confirme, puis on clôt proprement — pas d'état zombie en mémoire */
const inPlay = computed(() =>
  (route.name === "jeu" || route.name === "competJeu") && game.round > 0);
const pendingNav = ref<(() => void) | null>(null);

function navGuard(fn: () => void) {
  if (inPlay.value) pendingNav.value = fn;
  else fn();
}
function leaveNow() {
  const fn = pendingNav.value;
  pendingNav.value = null;
  game.abandon();
  fn?.();
}
</script>

<template>
  <header class="bar">
    <div class="side left">
      <button v-if="route.name !== 'accueil'" class="linkBtn" @click="navGuard(game.goHome)">← Accueil</button>
    </div>

    <h1 @click="navGuard(game.goHome)">MovieGuesser</h1>

    <div class="side right">
      <template v-if="profile.enabled">
        <button v-if="profile.profile && route.name === 'profil'" class="linkBtn"
                @click="profile.signOut()">déconnexion</button>
        <span v-if="profile.profile" class="profileChip" role="button" tabindex="0"
              :title="`${profile.profile.games_won} victoires / ${profile.profile.games_played} séances`"
              @click="navGuard(game.goProfile)" @keydown.enter="navGuard(game.goProfile)">
          <span class="pp">{{ initiale }}</span>
          <span class="u">{{ profile.profile.username }}</span>
          <span class="v">· {{ profile.profile.games_won }} V</span>
        </span>
        <button v-else class="linkBtn" @click="navGuard(game.goProfile)">Connexion</button>
      </template>
    </div>
  </header>

  <Teleport to="body">
    <div v-if="pendingNav" class="modal" @click.self="pendingNav = null">
      <div class="panel">
        <div class="setHead" style="margin-bottom:14px">Quitter la séance ?</div>
        <p class="clubIntro" style="margin-bottom:22px">
          La partie en cours sera abandonnée — rien ne sera enregistré.
          <template v-if="game.kind === 'compet'">En compétition, ta participation reste à jouer.</template>
        </p>
        <div class="btnrow">
          <button class="big" @click="pendingNav = null">Rester</button>
          <button class="ghost" @click="leaveNow()">Quitter</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
