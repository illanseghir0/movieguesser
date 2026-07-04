<script setup lang="ts">
import { ref, watch } from "vue";
import { useGameStore } from "../stores/game";
import { useListStore } from "../stores/list";
import { useProfileStore } from "../stores/profile";
import { useSettingsStore } from "../stores/settings";

const game = useGameStore();
const list = useListStore();
const profile = useProfileStore();
const settings = useSettingsStore();

/* ---- 01 · le classement ---- */
const url = ref(list.defaultUrl);
watch(() => list.defaultUrl, (u) => { url.value = u; });

/* ---- 02 · les joueurs ---- */
const n1 = ref(game.names[0]);
const n2 = ref(game.names[1]);
watch(() => profile.username, (u) => {
  if (u && (n1.value === "Joueur 1" || n1.value === "")) n1.value = u;
}, { immediate: true });

/* ---- 03 · les règles ---- */
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
</script>

<template>
  <section>
    <div class="setHead">La séance</div>

    <div class="actLbl">01 · Le classement</div>
    <div class="field" style="margin-bottom:0">
      <div class="urlrow">
        <input v-model="url" type="text" spellcheck="false"
               placeholder="https://letterboxd.com/…/list/…"
               @keydown.enter="list.loadList(url)">
        <button :disabled="list.loading" @click="list.loadList(url)">Charger</button>
      </div>
      <div class="srcnote">Colle l'URL de n'importe quelle liste Letterboxd classée
        (ex. <i>top-250-films-with-the-most-fans</i>) — le rang à deviner est la position dans la liste.</div>
      <div class="statusWrap">
        <span v-if="list.status" class="statusChip" :class="list.status.type">
          <span class="dotc"></span><span>{{ list.status.msg }}</span>
        </span>
      </div>
    </div>

    <div class="actLbl">02 · Les joueurs</div>
    <div class="row2">
      <div class="field" style="margin-bottom:0">
        <label>Joueur 1</label>
        <input id="n1" v-model="n1" type="text" maxlength="18">
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Joueur 2</label>
        <input id="n2" v-model="n2" type="text" maxlength="18">
      </div>
    </div>

    <div class="actLbl">03 · Les règles</div>
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

    <div class="btnrow" style="margin-top:32px">
      <button class="big" :disabled="!list.ready" @click="game.start(n1, n2)">Lancer la séance</button>
    </div>
  </section>
</template>
