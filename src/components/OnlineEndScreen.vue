<script setup lang="ts">
/* Générique du duel en ligne : vainqueur, score, rappel des manches.
   L'hôte choisit la suite (revanche / retour aux réglages) ; l'invité
   suit. Une partie interrompue (départ de l'autre) l'affiche clairement. */
import { computed, onMounted } from "vue";
import { REDUCE } from "../lib/env";
import router from "../router";
import { useDuelStore } from "../stores/duel";
import { useProfileStore } from "../stores/profile";

const duel = useDuelStore();
const profile = useProfileStore();

const winner = computed(() => {
  const [a, b] = duel.score;
  if (a > b) return `${duel.names[0]} l'emporte`;
  if (b > a) return `${duel.names[1]} l'emporte`;
  return "Match nul";
});

const otherName = computed(() => duel.names[duel.oppSeat]);

/* confetti pour le vainqueur (exception festive validée) */
onMounted(() => {
  if (duel.aborted || !duel.history.length || duel.score[0] === duel.score[1] || REDUCE) return;
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

async function quitAll() {
  await duel.quit();
  router.push("/");
}
</script>

<template>
  <section id="end">
    <template v-if="duel.aborted">
      <div class="winner" style="color:var(--muted)">Séance interrompue</div>
      <p class="clubIntro">
        {{ otherName }} a quitté la salle — la partie s'arrête là,
        rien n'est compté.
      </p>
      <div class="btnrow" style="margin-top:28px">
        <button class="big" @click="quitAll()">Accueil</button>
      </div>
    </template>

    <template v-else>
      <div class="winner" style="color:var(--cream)">{{ winner }}</div>

      <div class="finalScore">
        <div class="f1"><span class="fname">{{ duel.names[0] }}</span>&nbsp;&nbsp;<span class="fpts">{{ duel.score[0] }}</span></div>
        <div class="fvs">VS</div>
        <div class="f2"><span class="fpts">{{ duel.score[1] }}</span>&nbsp;&nbsp;<span class="fname">{{ duel.names[1] }}</span></div>
      </div>

      <div v-if="duel.history.length" class="rec">
        <h3>Les films de la soirée</h3>
        <div v-for="(h, i) in duel.history" :key="i" class="rec-row">
          <div class="rec-film">
            <b>#{{ h.rank }}</b> {{ h.title }}<span v-if="h.year" class="y"> {{ h.year }}</span>
          </div>
          <div class="rec-chips">
            <span class="chip c1" :class="{ win: h.win !== 2 }">{{ h.g[0] }} · ±{{ h.d[0] }}</span>
            <span class="chip c2" :class="{ win: h.win !== 1 }">{{ h.g[1] }} · ±{{ h.d[1] }}</span>
          </div>
        </div>
      </div>

      <div v-if="duel.statsRecorded && profile.username" class="recordedNote">
        ✓ statistiques enregistrées sur le profil {{ profile.username }}
      </div>

      <div class="btnrow" style="margin-top:28px">
        <template v-if="duel.seat === 0">
          <button class="big" @click="duel.rematch(duel.names[1])">Revanche</button>
          <button class="ghost" @click="duel.backToLobby()">Modifier les règles</button>
        </template>
        <span v-else class="hint" style="margin:0 12px">l'hôte décide de la suite…</span>
        <button class="ghost" @click="quitAll()">Quitter</button>
      </div>
    </template>
  </section>
</template>
