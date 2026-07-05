<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { REDUCE } from "../lib/env";
import { useGameStore } from "../stores/game";
import { useListStore } from "../stores/list";
import { useProfileStore } from "../stores/profile";
import { useSettingsStore } from "../stores/settings";

const game = useGameStore();
const list = useListStore();
const profile = useProfileStore();
const settings = useSettingsStore();

/* ---- le classement : carrousel auto-défilant + flèches ---- */
onMounted(() => list.loadCatalog());
/* contenu doublé pour un défilement en boucle sans couture */
const loop = computed(() =>
  list.catalog.length ? [...list.catalog, ...list.catalog] : []);

/* Le rail est déplacé par transform, position possédée à 100 % en JS :
   pas de scrollLeft (que le navigateur clampe à 0 — c'était le bug du
   bouton gauche), pas de scroll natif concurrent. Survol = ralenti.
   Flèches = exactement une carte, cumulables. Glissement au doigt géré
   par pointer events. */
const track = ref<HTMLElement | null>(null);
const posR = ref(0);               // position du rail (px, sans limite)
let rafId = 0;
let tween: number | null = null;   // cible des flèches
const hovering = ref(false);
const dragging = ref(false);
let dragStartX = 0, dragStartPos = 0, dragMoved = false;
const SPEED = 0.5, SPEED_HOVER = 0.12;

const trackStyle = computed(() => ({ transform: `translate3d(${-posR.value}px,0,0)` }));

function cardWidth(): number {
  const c = track.value?.querySelector<HTMLElement>(".lcard");
  return c ? c.offsetWidth + parseFloat(getComputedStyle(c).marginRight || "0") : 338;
}

function carTick() {
  if (!dragging.value) {
    if (tween !== null) {
      const d = tween - posR.value;
      posR.value += d * 0.16;
      if (Math.abs(d) < 0.8) { posR.value = tween; tween = null; }
    } else if (!REDUCE) {
      posR.value += hovering.value ? SPEED_HOVER : SPEED;
    }
  }
  // boucle sans couture : deux copies, on replie modulo une copie
  const w = (track.value?.scrollWidth ?? 0) / 2;
  if (w > 0) {
    let shift = 0;
    if (posR.value >= w) shift = -w;
    else if (posR.value < 0) shift = w;
    if (shift) {
      posR.value += shift;
      if (tween !== null) tween += shift;
      dragStartPos += shift;
    }
  }
  rafId = requestAnimationFrame(carTick);
}
onMounted(() => { rafId = requestAnimationFrame(carTick); });
onUnmounted(() => cancelAnimationFrame(rafId));

function carNav(dir: number) {
  tween = (tween ?? posR.value) + dir * cardWidth(); // clics cumulables, pas exact
}

/* glissement (souris ou doigt) — la capture du pointeur n'est prise qu'à
   partir d'un vrai déplacement (>7px) : la prendre dès l'appui redirige
   aussi le click vers le conteneur et rendait les cartes incliquables */
let pressed = false;
function dragDown(e: PointerEvent) {
  pressed = true; dragMoved = false;
  dragStartX = e.clientX; dragStartPos = posR.value;
}
function dragMove(e: PointerEvent) {
  if (!pressed) return;
  const dx = e.clientX - dragStartX;
  if (!dragging.value) {
    if (Math.abs(dx) < 7) return;      // simple clic : on ne s'en mêle pas
    dragging.value = true; tween = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  dragMoved = true;
  posR.value = dragStartPos - dx;
}
function dragUp() { pressed = false; dragging.value = false; }
/* un vrai glissement ne doit pas sélectionner la carte relâchée */
function cardClick(entry: (typeof list.catalog)[number]) {
  if (dragMoved) { dragMoved = false; return; }
  list.selectList(entry);
}

/* ---- joueurs : pas de noms préremplis, validation au lancement ---- */
const DEFAULTS = ["Joueur 1", "Joueur 2"];
const n1 = ref(DEFAULTS.includes(game.names[0]) ? "" : game.names[0]);
const n2 = ref(DEFAULTS.includes(game.names[1]) ? "" : game.names[1]);
const nameErr = ref("");
watch([n1, n2], () => { nameErr.value = ""; });
/* le profil connecté joue en Joueur 1 */
watch(() => profile.username, (u) => {
  if (u && n1.value === "") n1.value = u;
}, { immediate: true });

function launch() {
  if (!n1.value.trim() || !n2.value.trim()) {
    nameErr.value = "Veuillez rentrer des noms de joueur";
    return;
  }
  game.start(n1.value, n2.value);
}

/* ---- règles ---- */
const ROUND_PRESETS = [5, 10, 15, 20];
const TARGET_PRESETS = [500, 1000, 2000];
const roundsCustom = computed(() =>
  ROUND_PRESETS.includes(settings.rounds) ? "" : String(settings.rounds));
const targetCustom = computed(() =>
  TARGET_PRESETS.includes(settings.target) ? "" : String(settings.target));

function setRoundsCustom(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (v >= 1 && v <= 99) settings.rounds = v;
}
function setTargetCustom(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (v >= 50 && v <= 99999) settings.target = v;
}
function timerOn() { if (!settings.timer) settings.timer = 10; }
const showAll = ref(false);   // modale « voir tout » des classements
function pickFromAll(entry: (typeof list.catalog)[number]) {
  list.selectList(entry);
  showAll.value = false;
}
const showRules = ref(false); // règles repliées derrière « Personnaliser »
const ruleSummary = computed(() => {
  const m = settings.mode === "rounds"
    ? `${settings.rounds} manches` : `course à ${settings.target} pts`;
  const t = settings.timer ? `chrono ${settings.timer} s` : "sans chrono";
  const s2 = settings.start === "alt" ? "premier joueur alterné" : "premier joueur aléatoire";
  return `${m} · ${t} · ${s2}`;
});
function setTimer(e: Event) {
  settings.timer = parseInt((e.target as HTMLInputElement).value, 10);
}
</script>

<template>
  <section>
    <div class="setHead">La séance</div>

    <div class="actLbl">Choisis le classement
      <button class="ghost lblBtn" @click="showAll = true">Voir tout</button>
    </div>
    <div class="field" style="margin-bottom:0">
      <div class="carWrap">
        <div class="carousel" :class="{ grabbing: dragging }"
             @pointerenter="hovering = true" @pointerleave="hovering = false"
             @pointerdown="dragDown" @pointermove="dragMove"
             @pointerup="dragUp" @pointercancel="dragUp">
          <div ref="track" class="ctrack" :style="trackStyle">
            <div v-for="(e, i) in loop" :key="i" class="lcard"
                 :class="{ sel: e.slug === list.selectedSlug }" role="button" tabindex="0"
                 @click="cardClick(e)" @keydown.enter="list.selectList(e)">
              <img v-if="e.cover" :src="e.cover" alt="" loading="lazy">
              <div class="lgrad"></div>
              <div class="linfo">
                <div class="lt">{{ e.title }}</div>
                <div class="lc">{{ e.count }} films</div>
              </div>
            </div>
          </div>
        </div>
        <button class="cnav next" type="button" aria-label="Classements suivants" @click="carNav(1)">›</button>
      </div>

      <div v-if="list.status && list.status.type !== 'ok'" class="statusWrap">
        <span class="statusChip" :class="list.status.type">
          <span class="dotc"></span><span>{{ list.status.msg }}</span>
        </span>
      </div>
    </div>

    <!-- modale « voir tout » : galerie de tous les classements.
         Teleport : la section animée (transform) capturerait le position:fixed -->
    <Teleport to="body">
    <div v-if="showAll" class="modal" @click.self="showAll = false">
      <div class="panel allPanel">
        <div class="allHead">
          <div class="setHead" style="margin-bottom:0">Tous les classements</div>
          <button class="ghost lblBtn" @click="showAll = false">Fermer</button>
        </div>
        <div class="lgrid">
          <div v-for="e in list.catalog" :key="e.slug" class="lcard"
               :class="{ sel: e.slug === list.selectedSlug }" role="button" tabindex="0"
               @click="pickFromAll(e)" @keydown.enter="pickFromAll(e)">
            <img v-if="e.cover" :src="e.cover" alt="" loading="lazy">
            <div class="lgrad"></div>
            <div class="linfo">
              <div class="lt">{{ e.title }}</div>
              <div class="lc">{{ e.count }} films</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Teleport>

    <div class="actLbl">Joueurs</div>
    <div class="row2">
      <div class="field" style="margin-bottom:0">
        <label>Joueur 1</label>
        <input id="n1" v-model="n1" type="text" maxlength="18" placeholder="entre un nom">
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Joueur 2</label>
        <input id="n2" v-model="n2" type="text" maxlength="18" placeholder="entre un nom">
      </div>
    </div>
    <div v-if="nameErr" class="formErr" style="text-align:center">{{ nameErr }}</div>

    <div class="actLbl">Règles</div>
    <div class="ruleSummary">
      <span class="sum">{{ ruleSummary }}</span>
      <button class="ghost" @click="showRules = !showRules">
        {{ showRules ? "Fermer" : "Personnaliser" }}
      </button>
    </div>
    <Teleport to="body">
    <div v-if="showRules" class="modal" @click.self="showRules = false">
      <div class="panel rulesPanel">
      <div class="setHead" style="margin-bottom:26px">Règles</div>
      <div class="rulesWrap">
      <div class="field">
        <label>Mode de jeu</label>
        <div class="seg">
          <div class="s" :class="{ on: settings.mode === 'rounds' }" @click="settings.mode = 'rounds'">Nombre de manches</div>
          <div class="s" :class="{ on: settings.mode === 'points' }" @click="settings.mode = 'points'">Course aux points</div>
        </div>
        <div class="modeNote">{{ settings.modeNote }}</div>
      </div>

      <div v-if="settings.mode === 'rounds'" class="field">
        <label>Manches</label>
        <div class="rounds">
          <div v-for="r in ROUND_PRESETS" :key="r" class="r"
               :class="{ on: settings.rounds === r }" @click="settings.rounds = r">{{ r }}</div>
          <input type="number" min="1" max="99" inputmode="numeric" placeholder="custom"
                 title="Nombre personnalisé" :value="roundsCustom" @input="setRoundsCustom">
        </div>
      </div>

      <div v-else class="field">
        <label>Objectif de points</label>
        <div class="rounds">
          <div v-for="t in TARGET_PRESETS" :key="t" class="r"
               :class="{ on: settings.target === t }" @click="settings.target = t">{{ t }}</div>
          <input type="number" min="50" max="99999" inputmode="numeric" placeholder="custom"
                 title="Objectif personnalisé" :value="targetCustom" @input="setTargetCustom">
        </div>
      </div>

      <div class="field">
        <label>Chrono par tour</label>
        <div class="seg">
          <div class="s" :class="{ on: settings.timer === 0 }" @click="settings.timer = 0">Sans chrono</div>
          <div class="s" :class="{ on: settings.timer > 0 }" @click="timerOn">Chrono</div>
        </div>
        <div v-if="settings.timer > 0" class="timerRow">
          <input type="range" min="3" max="30" step="1" :value="settings.timer" @input="setTimer">
          <span class="timerVal">{{ settings.timer }} s</span>
        </div>
      </div>

      <div class="field">
        <label>Qui devine en premier ?</label>
        <div class="seg">
          <div class="s" :class="{ on: settings.start === 'alt' }" @click="settings.start = 'alt'">Alterné</div>
          <div class="s" :class="{ on: settings.start === 'random' }" @click="settings.start = 'random'">Aléatoire</div>
        </div>
      </div>
      </div>
      <div class="btnrow" style="margin-top:26px">
        <button class="big" @click="showRules = false">Valider</button>
      </div>
      </div>
    </div>
    </Teleport>

    <div class="btnrow launchRow">
      <button class="big xl" :disabled="!list.ready" @click="launch">Lancer la séance</button>
    </div>
  </section>
</template>
