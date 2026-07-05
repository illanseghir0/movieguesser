<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useGameStore } from "../stores/game";
import { useProfileStore } from "../stores/profile";

const route = useRoute();
const game = useGameStore();
const profile = useProfileStore();

const initiale = computed(() =>
  (profile.profile?.username ?? "?").charAt(0).toUpperCase());
</script>

<template>
  <header class="bar">
    <div class="side left">
      <button v-if="route.name !== 'accueil'" class="linkBtn" @click="game.goHome()">← Accueil</button>
    </div>

    <h1 @click="game.goHome()">MovieGuesser</h1>

    <div class="side right">
      <template v-if="profile.enabled">
        <button v-if="profile.profile && route.name === 'profil'" class="linkBtn"
                @click="profile.signOut()">déconnexion</button>
        <span v-if="profile.profile" class="profileChip" role="button" tabindex="0"
              :title="`${profile.profile.games_won} victoires / ${profile.profile.games_played} séances`"
              @click="game.goProfile()" @keydown.enter="game.goProfile()">
          <span class="pp">{{ initiale }}</span>
          <span class="u">{{ profile.profile.username }}</span>
          <span class="v">· {{ profile.profile.games_won }} V</span>
        </span>
        <button v-else class="linkBtn" @click="game.goProfile()">Connexion</button>
      </template>
    </div>
  </header>
</template>
