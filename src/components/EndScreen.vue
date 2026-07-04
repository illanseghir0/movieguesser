<script setup lang="ts">
import { computed, onMounted } from "vue";
import { REDUCE } from "../lib/env";
import { useGameStore } from "../stores/game";
import { useProfileStore } from "../stores/profile";

const game = useGameStore();
const profile = useProfileStore();

const winner = computed(() => {
  const [a, b] = game.score;
  if (a > b) return { text: `${game.names[0]} l'emporte`, color: "var(--p1)" };
  if (b > a) return { text: `${game.names[1]} l'emporte`, color: "var(--p2)" };
  return { text: "Match nul", color: "var(--true)" };
});

interface StatEntry { p: 0 | 1; gap: number; title: string; rank: number }
const stats = computed<{ best: StatEntry; worst: StatEntry } | null>(() => {
  if (!game.history.length) return null;
  let best: StatEntry | null = null, worst: StatEntry | null = null;
  for (const h of game.history) {
    for (const p of [0, 1] as const) {
      const e: StatEntry = { p, gap: h.d[p], title: h.title, rank: h.rank };
      if (!best || e.gap < best.gap) best = e;
      if (!worst || e.gap > worst.gap) worst = e;
    }
  }
  return { best: best!, worst: worst! };
});

/* confetti (vainqueur uniquement) */
onMounted(() => {
  if (!game.history.length || game.score[0] === game.score[1] || REDUCE) return;
  const box = document.createElement("div");
  box.className = "confetti";
  const colors = ["#00e054", "#40bcf4", "#ff8000", "#e8eef3"];
  for (let i = 0; i < 70; i++) {
    const s = document.createElement("i");
    s.style.left = Math.random() * 100 + "%";
    s.style.background = colors[i % 4];
    s.style.animationDelay = Math.random() * 0.9 + "s";
    s.style.animationDuration = 2.2 + Math.random() * 1.6 + "s";
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 5000);
});
</script>

<template>
  <section id="end">
    <div class="credits-lbl">— Générique de fin —</div>
    <div class="winner" :style="{ color: winner.color }">{{ winner.text }}</div>

    <div class="finalScore">
      <div class="f1"><span class="fname">{{ game.names[0] }}</span>&nbsp;&nbsp;<span class="fpts">{{ game.score[0] }}</span></div>
      <div class="fvs">VS</div>
      <div class="f2"><span class="fpts">{{ game.score[1] }}</span>&nbsp;&nbsp;<span class="fname">{{ game.names[1] }}</span></div>
    </div>

    <div v-if="stats" class="stats">
      <div class="stat">
        <div class="lbl">Prix de la précision</div>
        <div class="val" :style="{ color: `var(--p${stats.best.p + 1})` }">
          {{ game.names[stats.best.p] }} — écart {{ stats.best.gap }}
        </div>
        <div class="sub">{{ stats.best.title }} (#{{ stats.best.rank }})</div>
      </div>
      <div class="stat">
        <div class="lbl">Nanar de l'estimation</div>
        <div class="val" :style="{ color: `var(--p${stats.worst.p + 1})` }">
          {{ game.names[stats.worst.p] }} — écart {{ stats.worst.gap }}
        </div>
        <div class="sub">{{ stats.worst.title }} (#{{ stats.worst.rank }})</div>
      </div>
    </div>

    <div v-if="game.history.length" class="rec">
      <h3>Les films de la soirée</h3>
      <div v-for="(h, i) in game.history" :key="i" class="rec-row">
        <div class="rec-film">
          <b>#{{ h.rank }}</b> {{ h.title }}<span v-if="h.year" class="y"> {{ h.year }}</span>
        </div>
        <div class="rec-chips">
          <span class="chip c1" :class="{ win: h.win !== 2 }">{{ h.g[0] }} · ±{{ h.d[0] }}</span>
          <span class="chip c2" :class="{ win: h.win !== 1 }">{{ h.g[1] }} · ±{{ h.d[1] }}</span>
        </div>
      </div>
    </div>

    <div v-if="game.statsRecorded && profile.username" class="recordedNote">
      ✓ statistiques enregistrées sur le profil {{ profile.username }}
    </div>

    <div class="btnrow" style="margin-top:28px">
      <button class="big" @click="game.rematch()">Revanche</button>
      <button class="ghost" @click="game.goHome()">Retour à l'accueil</button>
    </div>
  </section>
</template>
