<script setup lang="ts">
/* Générique du mode compétitif : score final, sort de l'inscription au
   classement (envoyée par le store game via compet.submit), rappel des
   manches, et le classement mis à jour. */
import { computed } from "vue";
import { useCompetStore } from "../stores/compet";
import { useGameStore } from "../stores/game";
import { useProfileStore } from "../stores/profile";
import router from "../router";

const compet = useCompetStore();
const game = useGameStore();
const profile = useProfileStore();

const statusMsg = computed(() => {
  switch (compet.submitState) {
    case "sent": return { cls: "ok", txt: compet.myRank
      ? `✓ Score inscrit au classement — ${compet.myRank}ᵉ place`
      : "✓ Score inscrit au classement" };
    case "anon": return { cls: "info", txt: "Partie hors classement — connecte-toi avant de participer pour y figurer" };
    case "already": return { cls: "info", txt: "Tu avais déjà participé à ce défi — ce score n'est pas retenu" };
    case "partial": return { cls: "info", txt: "Partie abandonnée — le score n'est pas enregistré, ta participation reste à jouer" };
    case "error": return { cls: "err", txt: "L'envoi du score a échoué — réessaie depuis la page Compétition" };
    default: return null;
  }
});

const bestRound = computed(() => {
  if (!game.history.length) return null;
  return game.history.reduce((a, b) => (b.d[0] < a.d[0] ? b : a));
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
</script>

<template>
  <section id="end">
    <div class="winner" style="color:var(--cream)">Générique</div>

    <div class="finalScore">
      <div class="f1"><span class="fname">{{ game.names[0] }}</span>&nbsp;&nbsp;<span class="fpts">{{ game.score[0] }} pts</span></div>
    </div>

    <div v-if="statusMsg" class="statusWrap">
      <span class="statusChip" :class="statusMsg.cls">
        <span class="dotc"></span><span>{{ statusMsg.txt }}</span>
      </span>
    </div>

    <div v-if="bestRound" class="stats" style="grid-template-columns:1fr">
      <div class="stat">
        <div class="lbl">Prix de la précision</div>
        <div class="val">écart {{ bestRound.d[0] }} — +{{ bestRound.pts }} pts</div>
        <div class="sub">{{ bestRound.title }} (#{{ bestRound.rank }})</div>
      </div>
    </div>

    <div v-if="game.history.length" class="rec">
      <h3>Tes manches</h3>
      <div v-for="(h, i) in game.history" :key="i" class="rec-row">
        <div class="rec-film">
          <b>#{{ h.rank }}</b> {{ h.title }}<span v-if="h.year" class="y"> {{ h.year }}</span>
        </div>
        <div class="rec-chips">
          <span class="chip c1 win">{{ h.g[0] }} · ±{{ h.d[0] }} · +{{ h.pts }}</span>
        </div>
      </div>
    </div>

    <template v-if="compet.board.length">
      <div class="actLbl">Le classement</div>
      <div class="ladder">
        <div v-for="(r, i) in compet.board.slice(0, 10)" :key="r.user_id"
             class="lrow" :class="{ me: r.user_id === profile.profile?.id }">
          <span class="pos">{{ i + 1 }}</span>
          <span class="who">{{ r.username }}</span>
          <span class="when">{{ fmtDate(r.played_at) }}</span>
          <span class="sc">{{ r.score }}</span>
        </div>
      </div>
    </template>

    <div class="btnrow" style="margin-top:28px">
      <button class="big" @click="router.push('/competitif')">Retour à la compétition</button>
      <button class="ghost" @click="game.goHome()">Accueil</button>
    </div>
  </section>
</template>
