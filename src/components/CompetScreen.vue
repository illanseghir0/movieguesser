<script setup lang="ts">
/* Lobby du mode compétitif : le défi du moment (règles fixées par
   l'équipe, non modifiables), le classement public, et l'entrée en jeu.
   Sans connexion on peut jouer, mais le score n'est pas retenu. */
import { computed, onMounted, ref } from "vue";
import { useCompetStore } from "../stores/compet";
import { useGameStore } from "../stores/game";
import { useListStore } from "../stores/list";
import { useProfileStore } from "../stores/profile";

const compet = useCompetStore();
const game = useGameStore();
const list = useListStore();
const profile = useProfileStore();

const err = ref("");
const joining = ref(false); // anti double-clic pendant le chargement de la liste

onMounted(() => {
  compet.load();
  list.loadCatalog();
});

const listEntry = computed(() =>
  compet.challenge
    ? list.catalog.find((e) => e.slug === compet.challenge!.list_slug) ?? null
    : null);

const endsLbl = computed(() => {
  if (!compet.challenge) return "";
  return new Date(compet.challenge.ends_at).toLocaleDateString("fr-FR",
    { day: "numeric", month: "long", year: "numeric" });
});

const ruleLine = computed(() => {
  const c = compet.challenge;
  if (!c) return "";
  const n = listEntry.value?.count;
  return `${c.rounds} manches · ${c.timer_seconds} s par réponse · barème (${n ?? "films de la liste"} − écart) / 10`;
});

async function participer() {
  if (joining.value) return;
  err.value = "";
  const c = compet.challenge, entry = listEntry.value;
  if (!c || !entry) { err.value = "Le classement du défi est introuvable — réessaie dans un instant."; return; }
  joining.value = true;
  try {
    // remember=false : ne pas écraser la « dernière liste jouée » du mode local
    await list.selectList(entry, false);
    if (!list.ready) { err.value = "Impossible de charger le classement — réessaie dans un instant."; return; }
    game.startCompet({ challengeId: c.id, rounds: c.rounds, timer: c.timer_seconds });
  } finally {
    joining.value = false;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
</script>

<template>
  <section>
    <div class="setHead">Compétition</div>

    <!-- profils/DB indisponibles sur cette version -->
    <p v-if="!compet.enabled" class="clubIntro">
      Le mode compétitif est indisponible sur cette version.
    </p>

    <template v-else>
      <p class="clubIntro">
        Un défi unique, les mêmes règles pour tous, fixées par MovieGuesser.
        Une seule participation — vise juste.
      </p>

      <div v-if="!compet.loaded || compet.loading" class="statusWrap">
        <span class="statusChip info"><span class="dotc"></span><span>Recherche du défi en cours…</span></span>
      </div>

      <!-- erreur réseau/DB : ne pas la faire passer pour « aucun défi » -->
      <template v-else-if="compet.loadError">
        <div class="statusWrap">
          <span class="statusChip err"><span class="dotc"></span>
            <span>Impossible de joindre la salle des défis</span></span>
        </div>
        <div class="btnrow" style="margin-top:18px">
          <button class="ghost" @click="compet.load()">Réessayer</button>
        </div>
      </template>

      <p v-else-if="!compet.challenge" class="clubIntro" style="color:var(--muted)">
        Aucun défi en cours pour le moment — reviens bientôt,
        la prochaine compétition se prépare.
      </p>

      <template v-else>
        <div class="actLbl">Le défi du moment</div>
        <div class="challCard">
          <div class="challCover">
            <img v-if="listEntry?.cover" :src="listEntry.cover" alt="">
            <div class="lgrad"></div>
          </div>
          <div class="challBody">
            <div class="challTitle">{{ compet.challenge.title }}</div>
            <div class="challList">{{ listEntry?.title ?? compet.challenge.list_slug }}</div>
            <p class="challRules">{{ ruleLine }}</p>
            <p class="challEnds">ouvert jusqu'au {{ endsLbl }}</p>
          </div>
        </div>

        <div class="btnrow" style="margin-top:26px">
          <button v-if="!compet.myRow" class="big xl" :disabled="!listEntry || joining" @click="participer()">
            {{ joining ? "Ouverture de la salle…" : "Participer" }}
          </button>
          <button v-else class="big xl" disabled>Score enregistré · {{ compet.myRow.score }} pts</button>
        </div>
        <p v-if="!profile.profile && !compet.myRow" class="competNote">
          Tu peux jouer sans compte, mais seule une
          <a style="cursor:pointer" @click="game.goProfile()">connexion</a>
          inscrit ton score au classement.
        </p>
        <p v-if="compet.myRow" class="competNote">
          Une seule participation par défi — rendez-vous au prochain.
        </p>
        <div v-if="err" class="formErr" style="text-align:center">{{ err }}</div>

        <div class="actLbl">Le classement</div>
        <p v-if="!compet.board.length" class="clubIntro" style="margin-bottom:12px">
          Personne n'a encore osé. Sois la première ou le premier au générique.
        </p>
        <div v-else class="ladder">
          <div v-for="(r, i) in compet.board" :key="r.user_id"
               class="lrow" :class="{ me: r.user_id === profile.profile?.id }">
            <span class="pos">{{ i + 1 }}</span>
            <span class="who">{{ r.username }}</span>
            <span class="when">{{ fmtDate(r.played_at) }}</span>
            <span class="sc">{{ r.score }}</span>
          </div>
        </div>
      </template>
    </template>
  </section>
</template>
