<script setup lang="ts">
/* La ligne de révélation 1 -> maxRank : les paris des deux joueurs glissent
   depuis la gauche à l'insertion, le vrai rang tombe au temps 2, le vainqueur
   s'illumine au temps 3. Monté à chaque révélation (v-if côté parent). */
import { computed, onMounted, ref } from "vue";
import { REDUCE } from "../lib/env";

const props = defineProps<{
  names: [string, string];
  /** second pari null = révélation solo (mode compétitif) */
  guesses: [number, number | null];
  rank: number;
  maxRank: number;
  stage: number;   // 0: paris posés, 1: vrai rang, 2: verdict
  win: 0 | 1 | 2;
}>();

const pos = (r: number) => `${((r - 1) / (props.maxRank - 1)) * 100}%`;
const ticks = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(1 + (props.maxRank - 1) * f)));

/* insérés à left 0, placés au double-rAF pour déclencher la transition */
const placed = ref(false);
onMounted(() => {
  if (REDUCE) { placed.value = true; return; }
  requestAnimationFrame(() => requestAnimationFrame(() => { placed.value = true; }));
});

const markStyle = (g: number, visible: boolean) => ({
  left: visible ? pos(g) : "0%",
  opacity: visible ? 1 : 0,
});
</script>

<template>
  <div class="line-wrap">
    <div class="axis"><div class="fill" :style="{ width: stage >= 1 ? pos(rank) : '0%' }"></div></div>
    <div class="mark m1" :class="{ won: stage >= 2 && win !== 2 }"
         :style="markStyle(guesses[0], placed)">
      <div class="bub">{{ names[0].split(" ")[0] }} · {{ guesses[0] }}</div>
      <div class="pin"></div>
    </div>
    <div v-if="guesses[1] !== null" class="mark m2" :class="{ won: stage >= 2 && win !== 1 }"
         :style="markStyle(guesses[1], placed)">
      <div class="bub">{{ names[1].split(" ")[0] }} · {{ guesses[1] }}</div>
      <div class="pin"></div>
    </div>
    <div class="mark mt" :style="markStyle(rank, stage >= 1)">
      <div class="bub">#{{ rank }}</div>
      <div class="pin"></div>
    </div>
    <div class="ticks"><span v-for="t in ticks" :key="t">{{ t }}</span></div>
  </div>
</template>
