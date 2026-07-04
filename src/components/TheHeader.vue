<script setup lang="ts">
import { useGameStore } from "../stores/game";
import { useProfileStore } from "../stores/profile";

const game = useGameStore();
const profile = useProfileStore();

/* le titre ramène à l'accueil (sauf en pleine partie) */
function homeClick() {
  if (game.screen !== "play") game.goHome();
}
</script>

<template>
  <header class="bar">
    <div class="billing">A Letterboxd Game</div>
    <h1 @click="homeClick">Guess the Rank</h1>
  </header>

  <!-- coin haut-droit : profil / connexion -->
  <div v-if="profile.enabled && game.screen !== 'play'" class="topbar">
    <span v-if="profile.profile" class="profileChip" role="button" tabindex="0"
          :title="`${profile.profile.games_won} victoires / ${profile.profile.games_played} séances`"
          @click="game.goProfile()" @keydown.enter="game.goProfile()">
      <span class="u">{{ profile.profile.username }}</span>
      · {{ profile.profile.games_won }} V
    </span>
    <button v-else class="linkBtn" @click="game.goProfile()">Connexion</button>
  </div>

  <!-- coin haut-gauche : retour -->
  <div v-if="['setup', 'profile', 'end'].includes(game.screen)" class="cornerNav">
    <button class="linkBtn" @click="game.goHome()">← Accueil</button>
  </div>
</template>
