<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useGameStore } from "../stores/game";
import { useListStore } from "../stores/list";
import { useProfileStore } from "../stores/profile";

const props = defineProps<{ bootUrl: string | null }>();

const game = useGameStore();
const list = useListStore();
const profile = useProfileStore();

const url = ref("https://letterboxd.com/official/list/letterboxds-top-500-films/");
const n1 = ref(game.names[0]);
const n2 = ref(game.names[1]);

/* la dernière liste jouée, restaurée au boot, préremplit le champ */
watch(() => props.bootUrl, (u) => { if (u) url.value = u; }, { immediate: true });

/* profil connecté = Joueur 1 : prérempli tant que l'utilisateur n'a rien saisi */
watch(() => profile.username, (u) => {
  if (u && (n1.value === "Joueur 1" || n1.value === "")) n1.value = u;
}, { immediate: true });

/* ---- citations pour l'accueil ---- */
const QUOTES: Array<[string, string]> = [
  ["« La vie, c'est comme une boîte de chocolats : on ne sait jamais sur quoi on va tomber. »", "Forrest Gump — 1994"],
  ["« Je suis le roi du monde ! »", "Titanic — 1997"],
  ["« Que la Force soit avec toi. »", "Star Wars — 1977"],
  ["« Franchement, ma chère, c'est le cadet de mes soucis. »", "Autant en emporte le vent — 1939"],
  ["« La première règle du Fight Club est : il est interdit de parler du Fight Club. »", "Fight Club — 1999"],
  ["« I'll be back. »", "Terminator — 1984"],
  ["« Toto, j'ai l'impression que nous ne sommes plus au Kansas. »", "Le Magicien d'Oz — 1939"],
  ["« C'est pas ta faute. »", "Will Hunting — 1997"],
  ["« Un grand pouvoir implique de grandes responsabilités. »", "Spider-Man — 2002"],
  ["« Voici venir ton coucher de soleil, cow-boy. »", "Il était une fois dans l'Ouest — 1968"],
  ["« E.T. téléphone maison. »", "E.T. l'extra-terrestre — 1982"],
];
const quote = ref<[string, string]>(QUOTES[0]);
onMounted(() => { quote.value = QUOTES[(Math.random() * QUOTES.length) | 0]; });
</script>

<template>
  <section>
    <div class="tagline">Deux cinéphiles, une liste culte.<br>
      Un film s'affiche — <b>qui devinera son rang au plus près ?</b></div>

    <div class="panel">
      <div class="field">
        <label>Le classement à deviner</label>
        <div class="urlrow">
          <input v-model="url" type="text" spellcheck="false"
                 placeholder="https://letterboxd.com/…/list/…"
                 @keydown.enter="list.loadList(url)">
          <button :disabled="list.loading" @click="list.loadList(url)">Charger</button>
        </div>
        <div class="srcnote">Colle l'URL de n'importe quelle liste Letterboxd classée
          (ex. <i>top-250-films-with-the-most-fans</i>).</div>
        <div class="statusWrap">
          <span v-if="list.status" class="statusChip" :class="list.status.type">
            <span class="dotc"></span><span>{{ list.status.msg }}</span>
          </span>
        </div>
      </div>

      <div class="row2" style="margin-top:6px">
        <div class="field" style="margin-bottom:0">
          <label>Joueur 1</label>
          <input id="n1" v-model="n1" type="text" maxlength="18">
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Joueur 2</label>
          <input id="n2" v-model="n2" type="text" maxlength="18">
        </div>
      </div>

      <div class="btnrow" style="margin-top:28px">
        <button class="big" :disabled="!list.ready" @click="game.start(n1, n2)">Lancer le duel</button>
        <button class="ghost" @click="game.goSettings()">Paramètres</button>
      </div>
    </div>

    <div class="strip"></div>
    <div class="quote">
      <span>{{ quote[0] }}</span>
      <span class="qa">{{ quote[1] }}</span>
    </div>
  </section>
</template>
