<script setup lang="ts">
import { useListStore } from "../stores/list";
import { useProfileStore } from "../stores/profile";

const list = useListStore();
const profile = useProfileStore();
</script>

<template>
  <header class="bar">
    <div v-if="profile.enabled" class="topbar">
      <template v-if="profile.profile">
        <span class="profileChip" :title="`${profile.profile.games_won} victoires / ${profile.profile.games_played} parties`">
          <span class="u">{{ profile.profile.username }}</span>
          · {{ profile.profile.games_won }} V
        </span>
        <button class="mini ghost" @click="profile.signOut()">Déconnexion</button>
      </template>
      <button v-else class="mini ghost" @click="profile.authOpen = true">Connexion</button>
    </div>

    <div class="billing">A Letterboxd Game</div>
    <h1>Guess the Rank</h1>
    <div class="rule"><span>{{ list.headerTag }}</span></div>
  </header>
</template>
