<script setup lang="ts">
/* Écran de jeu du duel en ligne : chacun sur son écran, paris
   simultanés et secrets, révélation commune diffusée par l'hôte.
   Sièges fixes : 0 = hôte (vert), 1 = invité (bleu). */
import { computed, nextTick, ref, watch } from "vue";
import router from "../router";
import { useTurnTimer } from "../lib/useTurnTimer";
import { filmSubtitle, useRankCounter } from "../lib/playKit";
import { useDuelStore } from "../stores/duel";
import PosterZone from "./PosterZone.vue";
import RevealLine from "./RevealLine.vue";

const duel = useDuelStore();

async function abandonGame() {
  await duel.quit();
  router.push("/");
}

/* ---- scoreboard ---- */
const midLbl = computed(() =>
  duel.mode === "points" ? `Premier à ${duel.target}` : "Manche");
const roundLbl = computed(() =>
  duel.mode === "points" ? `Manche ${duel.round}` : `${duel.round} / ${duel.totalRounds}`);
const progWidth = computed(() => duel.mode === "points"
  ? Math.min(100, (Math.max(...duel.score) / duel.target) * 100) + "%"
  : ((duel.round - 1) / duel.totalRounds) * 100 + "%");

const bump = ref<[boolean, boolean]>([false, false]);
([0, 1] as const).forEach((i) => {
  watch(() => duel.scoreShown[i], (nv, ov) => {
    if (nv > ov) {
      bump.value[i] = true;
      setTimeout(() => { bump.value[i] = false; }, 600);
    }
  });
});

/* ---- fiche film ---- */
const film = computed(() => duel.film);
const infoSub = computed(() => filmSubtitle(film.value));

/* ---- saisie (validation locale, envoi à l'arbitre) ---- */
const gval = ref("");
const shaking = ref(false);
const guessInput = ref<HTMLInputElement | null>(null);

function validate() {
  const v = parseInt(gval.value, 10);
  if (!duel.submitGuess(v)) {
    shaking.value = false;
    requestAnimationFrame(() => { shaking.value = true; });
    guessInput.value?.focus();
    return;
  }
  gval.value = "";
}

watch([() => duel.reveal, () => duel.round], async ([r]) => {
  if (!r) { await nextTick(); guessInput.value?.focus(); }
}, { immediate: true });

/* ---- chrono (config de l'hôte) : à expiration, pari en cours ou hasard ---- */
const { timeLeft, start: startTurnTimer, stop: stopTurnTimer } = useTurnTimer(() => {
  const v = parseInt(gval.value, 10);
  const guess = v >= 1 && v <= duel.maxRank ? v : 1 + ((Math.random() * duel.maxRank) | 0);
  gval.value = "";
  duel.submitGuess(guess);
});
watch([() => duel.reveal, () => duel.round, () => duel.myGuess],
  ([r, , g]) => {
    if (!r && g === null && duel.round > 0) startTurnTimer(duel.timer);
    else stopTurnTimer();
  },
  { immediate: true });

const stage = computed(() => duel.reveal?.stage ?? -1);

const displayRank = useRankCounter({
  stage: () => stage.value,
  film: () => film.value,
  revealing: () => !!duel.reveal,
});

const verdictText = computed(() => {
  const r = duel.reveal;
  if (!r || r.stage < 2) return "";
  const ptsMode = duel.mode === "points";
  const [d1, d2] = r.d;
  if (r.win === 0) {
    return d1 === 0 ? "🎯 Double perfection — rang exact pour les deux !"
      : ptsMode ? `Égalité parfaite — personne ne marque (écart de ${d1})`
        : `Égalité parfaite — +1 chacun (écart de ${d1})`;
  }
  const w = r.win - 1, gap = w === 0 ? d1 : d2;
  return gap === 0
    ? `🎯 ${duel.names[w]} — rang exact !${ptsMode ? ` +${r.pts} pts` : ""}`
    : ptsMode ? `${duel.names[w]} marque ${r.pts} points !`
      : `${duel.names[w]} marque le point ! (écart de ${gap})`;
});

const nextBtn = ref<HTMLButtonElement | null>(null);
watch(stage, async (st) => {
  if (st >= 2 && duel.seat === 0) { await nextTick(); nextBtn.value?.focus({ preventScroll: true }); }
});
</script>

<template>
  <section>
    <div class="score">
      <div class="pl p1" :class="{ turn: !duel.reveal && duel.seat === 0 && duel.myGuess === null }">
        <div class="name">{{ duel.names[0] }}</div>
        <div class="pts" :class="{ bump: bump[0] }">{{ duel.scoreShown[0] }}</div>
      </div>
      <div class="mid">
        <span>{{ midLbl }}</span><b>{{ roundLbl }}</b>
        <div class="prog"><i :style="{ width: progWidth }"></i></div>
      </div>
      <div class="pl p2" :class="{ turn: !duel.reveal && duel.seat === 1 && duel.myGuess === null }">
        <div class="name">{{ duel.names[1] }}</div>
        <div class="pts" :class="{ bump: bump[1] }">{{ duel.scoreShown[1] }}</div>
      </div>
    </div>

    <div v-if="film" class="stage" :class="{ revealing: !!duel.reveal }">
      <PosterZone :film="film" />

      <div v-if="!duel.reveal" class="tcard">
        <div class="ft">{{ film.title }}</div>
        <div v-if="infoSub" class="fy">{{ infoSub }}</div>
      </div>

      <!-- phase devinette : chacun en secret, en même temps -->
      <div v-if="!duel.reveal" id="guessBox">
        <template v-if="duel.myGuess === null">
          <div class="prompt">À toi de jouer</div>
          <div class="hint">Son rang — entre 1 et {{ duel.maxRank }} ·
            {{ duel.oppGuessed ? `${duel.names[duel.oppSeat]} a répondu` : `${duel.names[duel.oppSeat]} réfléchit…` }}
          </div>
          <div v-if="duel.timer" class="leader" :class="{ urgent: timeLeft <= 3 }"
               :style="{ background: `conic-gradient(rgba(242,234,214,.25) ${(timeLeft / duel.timer) * 360}deg, transparent 0deg)` }">
            <span class="n">{{ timeLeft }}</span>
          </div>
          <div class="guess" :class="['g' + (duel.seat + 1), { shake: shaking }]">
            <input ref="guessInput" v-model="gval" type="number" :min="1" :max="duel.maxRank"
                   step="1" inputmode="numeric" :placeholder="`1–${duel.maxRank}`"
                   @keydown.enter="validate">
            <button :class="'p' + (duel.seat + 1)" @click="validate">Valider</button>
          </div>
        </template>
        <template v-else>
          <div class="prompt">Pari posé</div>
          <div class="hint">
            {{ duel.oppGuessed ? "révélation…" : `en attente de ${duel.names[duel.oppSeat]}…` }}
          </div>
        </template>
      </div>

      <!-- phase révélation -->
      <div v-else id="revealBox" class="reveal">
        <div class="rankLbl">Vrai classement</div>
        <div class="truerank" :class="{ dim: stage < 1 }">{{ displayRank }}</div>
        <div class="title">{{ film.title }}{{ film.year ? ` (${film.year})` : "" }}</div>
        <div v-if="film.director" class="dir">un film de {{ film.director }}</div>
        <div v-if="film.url" style="margin-top:8px;font-size:12px;letter-spacing:.08em">
          <a :href="film.url" target="_blank" rel="noopener">Voir sur Letterboxd ↗</a>
        </div>

        <RevealLine :names="duel.names" :guesses="duel.guesses as [number, number]"
                    :rank="film.rank" :max-rank="duel.maxRank"
                    :stage="stage" :win="duel.reveal.win" />

        <div class="verdict" :class="stage >= 2 ? ['show', duel.reveal.win === 0 ? 'tie' : 'win' + duel.reveal.win] : []">
          {{ verdictText }}
        </div>
        <div class="gaps">
          <template v-if="stage >= 2">
            <span>{{ duel.names[0] }} : écart <b>{{ duel.reveal.d[0] }}</b></span>
            <span>{{ duel.names[1] }} : écart <b>{{ duel.reveal.d[1] }}</b></span>
          </template>
        </div>
        <div class="btnrow">
          <button v-if="stage >= 2 && duel.seat === 0" ref="nextBtn" class="big"
                  @click="duel.hostNextRound()">Manche suivante</button>
          <span v-else-if="stage >= 2" class="hint" style="margin:0">l'hôte enchaîne…</span>
        </div>
      </div>
    </div>

    <div class="btnrow" style="margin-top:22px">
      <button class="ghost" @click="abandonGame()">Abandonner</button>
    </div>
  </section>
</template>
