<script setup lang="ts">
import { computed, ref } from "vue";
import { useGameStore } from "../stores/game";
import { useProfileStore } from "../stores/profile";

const game = useGameStore();
const profile = useProfileStore();

/* ---- stats de la carte de membre ---- */
const winRate = computed(() => {
  const p = profile.profile;
  if (!p || !p.games_played) return "—";
  return Math.round((p.games_won / p.games_played) * 100) + " %";
});
const since = computed(() => {
  const d = profile.profile?.created_at;
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
});

/* ---- formulaire (connexion / création) ---- */
const mode = ref<"in" | "up">("in");
const email = ref("");
const password = ref("");
const uname = ref("");
const err = ref("");
const info = ref("");

async function submit() {
  err.value = ""; info.value = "";
  if (mode.value === "in") {
    const e = await profile.signIn(email.value.trim(), password.value);
    if (e) err.value = e;
  } else {
    const r = await profile.signUp(email.value.trim(), password.value, uname.value.trim());
    if (r?.err) err.value = r.err;
    else if (r?.info) info.value = r.info;
  }
}
</script>

<template>
  <section>
    <!-- membre connecté : la carte -->
    <template v-if="profile.profile">
      <div class="setHead">Carte de membre</div>

      <div class="member">
        <div class="mhead">
          <div>
            <span class="mlbl">Le club des cinéphiles</span>
            <div class="uname">{{ profile.profile.username }}</div>
          </div>
          <div v-if="since" class="since">membre depuis {{ since }}</div>
        </div>
        <div class="mstats">
          <div class="ms">
            <div class="n">{{ profile.profile.games_played }}</div>
            <div class="l">Séances</div>
          </div>
          <div class="ms hi">
            <div class="n">{{ profile.profile.games_won }}</div>
            <div class="l">Victoires</div>
          </div>
          <div class="ms">
            <div class="n">{{ winRate }}</div>
            <div class="l">Taux de victoire</div>
          </div>
          <div class="ms">
            <div class="n">{{ profile.profile.best_gap ?? "—" }}</div>
            <div class="l">Meilleur écart</div>
          </div>
        </div>
      </div>

      <div class="clubIntro" style="margin-top:26px;margin-bottom:0">
        Tes statistiques s'écrivent à chaque générique de fin,<br>quand tu joues en Joueur 1.
      </div>

      <div class="btnrow" style="margin-top:28px">
        <button class="big" @click="game.goSetup()">Nouvelle séance</button>
        <button class="linkBtn" @click="profile.signOut()">déconnexion</button>
      </div>
    </template>

    <!-- non connecté : rejoindre le club -->
    <template v-else>
      <div class="setHead">{{ mode === "in" ? "Le club" : "Rejoindre le club" }}</div>
      <div class="clubIntro">
        Un profil garde la trace de tes séances, tes victoires
        et ton estimation la plus fine — de générique en générique.
      </div>

      <div v-if="!profile.enabled" class="clubIntro" style="color:var(--true)">
        Les profils ne sont pas disponibles sur cette version du site.
      </div>

      <form v-else style="max-width:400px;margin:0 auto" @submit.prevent="submit">
        <div v-if="mode === 'up'" class="field">
          <label>Pseudo</label>
          <input v-model="uname" type="text" maxlength="20" autocomplete="username" spellcheck="false">
        </div>
        <div class="field">
          <label>Email</label>
          <input v-model="email" type="text" inputmode="email" autocomplete="email" spellcheck="false">
        </div>
        <div class="field">
          <label>Mot de passe</label>
          <input v-model="password" type="password"
                 :autocomplete="mode === 'in' ? 'current-password' : 'new-password'">
        </div>

        <div v-if="err" class="formErr">{{ err }}</div>
        <div v-if="info" class="formOk">{{ info }}</div>

        <div class="btnrow" style="margin-top:22px">
          <button class="big" type="submit" :disabled="profile.busy">
            {{ mode === "in" ? "Se connecter" : "Créer le profil" }}
          </button>
        </div>
        <div class="authAlt">
          <template v-if="mode === 'in'">Pas encore membre ? <a @click="mode = 'up'; err = ''">Rejoins le club</a></template>
          <template v-else>Déjà membre ? <a @click="mode = 'in'; err = ''">Connecte-toi</a></template>
        </div>
      </form>
    </template>
  </section>
</template>
