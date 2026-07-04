<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useGameStore } from "../stores/game";
import { useProfileStore } from "../stores/profile";

const route = useRoute();
const game = useGameStore();
const profile = useProfileStore();

/* la barre disparaît en pleine partie (immersion) ; sur l'accueil elle
   n'apparaît que si elle a quelque chose à montrer (connexion) */
const showNav = computed(() =>
  route.name !== "jeu" && (route.name !== "accueil" || profile.enabled));

/* le titre ramène à l'accueil (sauf en pleine partie) */
function homeClick() {
  if (route.name !== "jeu") game.goHome();
}
</script>

<template>
  <nav v-if="showNav" class="navbar">
    <div class="side">
      <button v-if="route.name !== 'accueil'" class="linkBtn" @click="game.goHome()">← Accueil</button>
    </div>
    <div class="side">
      <template v-if="profile.enabled">
        <span v-if="profile.profile" class="profileChip" role="button" tabindex="0"
              :title="`${profile.profile.games_won} victoires / ${profile.profile.games_played} séances`"
              @click="game.goProfile()" @keydown.enter="game.goProfile()">
          <span class="u">{{ profile.profile.username }}</span>
          · {{ profile.profile.games_won }} V
        </span>
        <button v-else class="linkBtn" @click="game.goProfile()">Connexion</button>
      </template>
    </div>
  </nav>

  <header class="bar">
    <div class="billing">A Letterboxd Game</div>
    <h1 @click="homeClick">Guess the Rank</h1>
  </header>
</template>
