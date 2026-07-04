<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useGameStore } from "../stores/game";

const game = useGameStore();
const p = computed(() => game.currentPlayer);
const btn = ref<HTMLButtonElement | null>(null);
onMounted(() => btn.value?.focus());
</script>

<template>
  <div class="handoff" :class="'h' + (p + 1)">
    <div class="inner">
      <div class="pass">Entracte</div>
      <div class="rule"></div>
      <div class="to">Passe l'écran à</div>
      <div class="who">{{ game.names[p] }}</div>
      <div class="peek">…sans regarder la réponse de l'autre 👀</div>
      <button ref="btn" class="big" :class="'p' + (p + 1)" @click="game.closeHandoff()">C'est à moi</button>
    </div>
  </div>
</template>
