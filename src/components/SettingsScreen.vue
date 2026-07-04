<script setup lang="ts">
import { ref } from "vue";
import { useGameStore } from "../stores/game";
import { useListStore } from "../stores/list";
import { useSettingsStore } from "../stores/settings";

const game = useGameStore();
const list = useListStore();
const settings = useSettingsStore();

const ROUND_PRESETS = [5, 10, 15, 20];
const TARGET_PRESETS = [500, 1000, 2000];

function setRoundsCustom(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (v >= 1 && v <= 99) settings.rounds = v;
}
function setTargetCustom(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (v >= 50 && v <= 99999) settings.target = v;
}

/* zone de drop films.json */
const over = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
function onDrop(e: DragEvent) {
  over.value = false;
  const f = e.dataTransfer?.files[0];
  if (f) list.loadJSONFile(f);
}
function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) list.loadJSONFile(f);
}
</script>

<template>
  <section class="panel">
    <div class="setHead">Paramètres</div>

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
        <input type="number" min="1" max="99" inputmode="numeric"
               title="Nombre personnalisé" :value="settings.rounds" @input="setRoundsCustom">
      </div>
    </div>

    <div v-else class="field">
      <label>Objectif de points</label>
      <div class="rounds">
        <div v-for="t in TARGET_PRESETS" :key="t" class="r"
             :class="{ on: settings.target === t }" @click="settings.target = t">{{ t }}</div>
        <input type="number" min="50" max="99999" inputmode="numeric"
               title="Objectif personnalisé" :value="settings.target" @input="setTargetCustom">
      </div>
    </div>

    <div class="field">
      <label>Qui devine en premier ?</label>
      <div class="seg">
        <div class="s" :class="{ on: settings.start === 'alt' }" @click="settings.start = 'alt'">Alterné</div>
        <div class="s" :class="{ on: settings.start === 'random' }" @click="settings.start = 'random'">Aléatoire</div>
        <div class="s" :class="{ on: settings.start === 'fixed' }" @click="settings.start = 'fixed'">Toujours J1</div>
      </div>
    </div>

    <details class="alt">
      <summary>Données locales : charger un films.json (scrape.py)</summary>
      <div class="drop" :class="{ over }" @click="fileInput?.click()"
           @dragenter.prevent="over = true" @dragover.prevent="over = true"
           @dragleave.prevent="over = false" @drop.prevent="onDrop">
        Glisse ton <b>films.json</b> ici, ou clique pour le choisir.
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onPick">
      </div>
    </details>

    <div class="btnrow" style="margin-top:26px">
      <button class="big" @click="game.goHome()">Retour au jeu</button>
    </div>
  </section>
</template>
