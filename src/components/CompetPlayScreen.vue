<script setup lang="ts">
/* Écran de jeu du mode compétitif : la boucle solo du store game
   (kind === "compet"). Même scène que le duel local, sans entracte ni
   second joueur ; le chrono est imposé par le défi. */
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { REDUCE } from "../lib/env";
import { useGameStore } from "../stores/game";
import { useListStore } from "../stores/list";
import RevealLine from "./RevealLine.vue";

const game = useGameStore();
const list = useListStore();

const timerSec = computed(() => game.competCfg?.timer ?? 15);

/* ---- scoreboard solo ---- */
const progWidth = computed(() => ((game.round - 1) / game.playRounds) * 100 + "%");
const bump = ref(false);
watch(() => game.scoreShown[0], (nv, ov) => {
  if (nv > ov) { bump.value = true; setTimeout(() => { bump.value = false; }, 600); }
});

/* ---- fiche film ---- */
const film = computed(() => game.current);
const infoSub = computed(() => {
  const f = film.value;
  if (!f) return "";
  return [f.year, f.director ? `de ${f.director}` : null].filter(Boolean).join(" · ");
});

/* ---- saisie ---- */
const gval = ref("");
const shaking = ref(false);
const guessInput = ref<HTMLInputElement | null>(null);

function validate() {
  const v = parseInt(gval.value, 10);
  if (!game.submitGuess(v)) {
    shaking.value = false;
    requestAnimationFrame(() => { shaking.value = true; });
    guessInput.value?.focus();
    return;
  }
  gval.value = "";
}

watch([() => game.reveal, () => game.round], async ([r]) => {
  if (!r) { await nextTick(); guessInput.value?.focus(); }
}, { immediate: true });

/* ---- chrono imposé par le défi ---- */
const timeLeft = ref(0);
let timerInt: number | undefined;
function stopTurnTimer() { clearInterval(timerInt); timerInt = undefined; }
function startTurnTimer() {
  stopTurnTimer();
  timeLeft.value = timerSec.value;
  timerInt = window.setInterval(() => {
    timeLeft.value--;
    if (timeLeft.value <= 0) {
      stopTurnTimer();
      // temps écoulé : on valide la saisie en cours, sinon pari au hasard
      const v = parseInt(gval.value, 10);
      const guess = v >= 1 && v <= list.maxRank ? v : 1 + ((Math.random() * list.maxRank) | 0);
      gval.value = "";
      game.submitGuess(guess);
    }
  }, 1000);
}
watch([() => game.reveal, () => game.round],
  ([r]) => { if (!r && game.round > 0) startTurnTimer(); else stopTurnTimer(); },
  { immediate: true });
onUnmounted(stopTurnTimer);

const stage = computed(() => game.reveal?.stage ?? -1);

/* compteur animé du vrai rang (même mise en scène que le duel) */
const displayRank = ref("# ?");
watch(stage, (st) => {
  const f = film.value;
  if (!f) return;
  if (st < 1) { displayRank.value = "# ?"; return; }
  if (REDUCE || st > 1) { displayRank.value = "#" + f.rank; return; }
  const to = f.rank, from = to <= list.maxRank / 2 ? list.maxRank : 1;
  const t0 = performance.now(), dur = 950;
  (function step(t: number) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    displayRank.value = "#" + Math.round(from + (to - from) * e);
    if (p < 1 && game.reveal) requestAnimationFrame(step);
  })(t0);
});

const verdictText = computed(() => {
  const r = game.reveal;
  if (!r || r.stage < 2) return "";
  return r.d[0] === 0
    ? `🎯 Rang exact ! +${r.pts} pts`
    : `+${r.pts} pts (écart de ${r.d[0]})`;
});

const nextBtn = ref<HTMLButtonElement | null>(null);
watch(stage, async (st) => {
  if (st >= 2) { await nextTick(); nextBtn.value?.focus({ preventScroll: true }); }
});

/* ---- tilt 3D sur l'affiche (desktop uniquement) ---- */
const zone = ref<HTMLElement | null>(null);
const tiltOk = !REDUCE && matchMedia("(pointer:fine)").matches;
function onTilt(e: PointerEvent) {
  if (!tiltOk || !zone.value) return;
  const r = zone.value.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
  zone.value.style.transform = `perspective(700px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg)`;
}
function offTilt() { if (zone.value) zone.value.style.transform = ""; }
</script>

<template>
  <section>
    <div class="score">
      <div class="pl p1" :class="{ turn: !game.reveal }">
        <div class="name">{{ game.names[0] }}</div>
        <div class="pts" :class="{ bump }">{{ game.scoreShown[0] }}</div>
      </div>
      <div class="mid">
        <span>Compétition</span><b>{{ game.round }} / {{ game.playRounds }}</b>
        <div class="prog"><i :style="{ width: progWidth }"></i></div>
      </div>
      <div class="pl"></div>
    </div>

    <div v-if="film" class="stage" :class="{ revealing: !!game.reveal }">
      <div ref="zone" class="posterZone" @pointermove="onTilt" @pointerleave="offTilt">
        <img v-if="film.poster" class="glow" :src="film.poster" alt="">
        <div class="poster">
          <img v-if="film.poster" :src="film.poster" alt="affiche">
          <div v-else-if="film.poster === undefined" class="ph"><div class="loader"></div></div>
          <div v-else class="ph">
            <div class="ico">🎞️</div>
            <div class="t">{{ film.title }}</div>
            <div v-if="film.year" class="y">{{ film.year }}</div>
          </div>
        </div>
      </div>

      <div v-if="!game.reveal" class="tcard">
        <div class="ft">{{ film.title }}</div>
        <div v-if="infoSub" class="fy">{{ infoSub }}</div>
      </div>

      <!-- phase devinette -->
      <div v-if="!game.reveal" id="guessBox">
        <div class="prompt">À toi de jouer</div>
        <div class="hint">Son rang — entre 1 et {{ list.maxRank }}</div>
        <div class="leader" :class="{ urgent: timeLeft <= 3 }"
             :style="{ background: `conic-gradient(rgba(242,234,214,.25) ${(timeLeft / timerSec) * 360}deg, transparent 0deg)` }">
          <span class="n">{{ timeLeft }}</span>
        </div>
        <div class="guess g1" :class="{ shake: shaking }">
          <input ref="guessInput" v-model="gval" type="number" :min="1" :max="list.maxRank"
                 step="1" inputmode="numeric" :placeholder="`1–${list.maxRank}`"
                 @keydown.enter="validate">
          <button class="p1" @click="validate">Révéler</button>
        </div>
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

        <RevealLine :names="game.names" :guesses="[game.guesses[0]!, null]"
                    :rank="film.rank" :max-rank="list.maxRank"
                    :stage="stage" :win="1" />

        <div class="verdict" :class="stage >= 2 ? ['show', 'win1'] : []">
          {{ verdictText }}
        </div>
        <div class="gaps">
          <span v-if="stage >= 2">écart <b>{{ game.reveal.d[0] }}</b></span>
        </div>
        <div class="btnrow">
          <button v-if="stage >= 2" ref="nextBtn" class="big" @click="game.nextRound()">
            {{ game.round >= game.playRounds ? "Générique" : "Manche suivante" }}
          </button>
        </div>
      </div>
    </div>

    <div class="btnrow" style="margin-top:22px">
      <button class="ghost" @click="game.quit()">Abandonner</button>
    </div>
  </section>
</template>
