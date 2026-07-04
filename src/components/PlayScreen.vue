<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { REDUCE } from "../lib/env";
import { useGameStore } from "../stores/game";
import { useListStore } from "../stores/list";
import { useSettingsStore } from "../stores/settings";
import RevealLine from "./RevealLine.vue";

const game = useGameStore();
const list = useListStore();
const settings = useSettingsStore();

/* ---- scoreboard ---- */
const midLbl = computed(() =>
  settings.mode === "points" ? `Premier à ${settings.target}` : "Manche");
const roundLbl = computed(() =>
  settings.mode === "points" ? `Manche ${game.round}` : `${game.round} / ${game.playRounds}`);
const progWidth = computed(() => settings.mode === "points"
  ? Math.min(100, (Math.max(...game.score) / settings.target) * 100) + "%"
  : ((game.round - 1) / game.playRounds) * 100 + "%");

/* pulsation du score quand il augmente */
const bump = ref<[boolean, boolean]>([false, false]);
([0, 1] as const).forEach((i) => {
  watch(() => game.scoreShown[i], (nv, ov) => {
    if (nv > ov) {
      bump.value[i] = true;
      setTimeout(() => { bump.value[i] = false; }, 600);
    }
  });
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
const activePlayer = computed(() => game.currentPlayer);

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

/* focus du champ quand c'est au joueur de saisir */
watch([() => game.handoffOpen, () => game.reveal, () => game.round], async ([h, r]) => {
  if (!h && !r) { await nextTick(); guessInput.value?.focus(); }
}, { immediate: true });

const stage = computed(() => game.reveal?.stage ?? -1);

/* compteur animé du vrai rang */
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
  const ptsMode = settings.mode === "points";
  const [d1, d2] = r.d;
  if (r.win === 0) {
    return d1 === 0 ? "🎯 Double perfection — rang exact pour les deux !"
      : ptsMode ? `Égalité parfaite — personne ne marque (écart de ${d1})`
        : `Égalité parfaite — +1 chacun (écart de ${d1})`;
  }
  const w = r.win - 1, gap = w === 0 ? d1 : d2;
  return gap === 0
    ? `🎯 ${game.names[w]} — rang exact !${ptsMode ? ` +${r.pts} pts` : ""}`
    : ptsMode ? `${game.names[w]} marque ${r.pts} points !`
      : `${game.names[w]} marque le point ! (écart de ${gap})`;
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
      <div class="pl p1" :class="{ turn: !game.reveal && activePlayer === 0 }">
        <div class="name">{{ game.names[0] }}</div>
        <div class="pts" :class="{ bump: bump[0] }">{{ game.scoreShown[0] }}</div>
      </div>
      <div class="mid">
        <span>{{ midLbl }}</span><b>{{ roundLbl }}</b>
        <div class="prog"><i :style="{ width: progWidth }"></i></div>
      </div>
      <div class="pl p2" :class="{ turn: !game.reveal && activePlayer === 1 }">
        <div class="name">{{ game.names[1] }}</div>
        <div class="pts" :class="{ bump: bump[1] }">{{ game.scoreShown[1] }}</div>
      </div>
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
        <div class="prompt">Au tour de <span :class="'who' + (activePlayer + 1)">{{ game.names[activePlayer] }}</span></div>
        <div class="hint">Son rang — entre 1 et {{ list.maxRank }}</div>
        <div class="guess" :class="['g' + (activePlayer + 1), { shake: shaking }]">
          <input ref="guessInput" v-model="gval" type="number" :min="1" :max="list.maxRank"
                 step="1" inputmode="numeric" :placeholder="`1–${list.maxRank}`"
                 @keydown.enter="validate">
          <button :class="'p' + (activePlayer + 1)" @click="validate">
            {{ game.phase === 0 ? "Valider" : "Révéler" }}
          </button>
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

        <RevealLine :names="game.names" :guesses="game.guesses as [number, number]"
                    :rank="film.rank" :max-rank="list.maxRank"
                    :stage="stage" :win="game.reveal.win" />

        <div class="verdict" :class="stage >= 2 ? ['show', game.reveal.win === 0 ? 'tie' : 'win' + game.reveal.win] : []">
          {{ verdictText }}
        </div>
        <div class="gaps">
          <template v-if="stage >= 2">
            <span>{{ game.names[0] }} : écart <b>{{ game.reveal.d[0] }}</b></span>
            <span>{{ game.names[1] }} : écart <b>{{ game.reveal.d[1] }}</b></span>
          </template>
        </div>
        <div class="btnrow">
          <button v-if="stage >= 2" ref="nextBtn" class="big" @click="game.nextRound()">Manche suivante</button>
        </div>
      </div>
    </div>

    <div class="btnrow" style="margin-top:22px">
      <button class="ghost" @click="game.quit()">Abandonner</button>
    </div>
  </section>
</template>
