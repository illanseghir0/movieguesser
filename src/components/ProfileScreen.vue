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

/* ---- connexion par code email (pas de mot de passe) ---- */
const step = ref<"email" | "code">("email");
const email = ref("");
const uname = ref("");
const code = ref("");
const err = ref("");
const cooldown = ref(0);
let cdTimer: number | undefined;

function startCooldown() {
  cooldown.value = 30;
  clearInterval(cdTimer);
  cdTimer = window.setInterval(() => {
    if (--cooldown.value <= 0) clearInterval(cdTimer);
  }, 1000);
}

async function sendCode() {
  err.value = "";
  const e = await profile.sendCode(email.value.trim(), uname.value.trim() || undefined);
  if (e) { err.value = e; return; }
  step.value = "code";
  code.value = "";
  startCooldown();
}

async function verify() {
  err.value = "";
  const e = await profile.verifyCode(email.value.trim(), code.value);
  if (e) err.value = e;
  // succès : la session s'ouvre, le template bascule sur la carte de membre
}

function changeEmail() {
  step.value = "email"; code.value = ""; err.value = "";
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
      <div class="setHead">Le club</div>
      <div class="clubIntro">
        Un profil garde la trace de tes séances, tes victoires
        et ton estimation la plus fine — de générique en générique.
      </div>

      <div v-if="!profile.enabled" class="clubIntro" style="color:var(--true)">
        Les profils ne sont pas disponibles sur cette version du site.
      </div>

      <!-- étape 1 : email (+ pseudo pour une première fois) -->
      <form v-if="profile.enabled && step === 'email'" style="max-width:400px;margin:0 auto"
            @submit.prevent="sendCode">
        <div class="field">
          <label>Email</label>
          <input v-model="email" type="text" inputmode="email" autocomplete="email"
                 spellcheck="false" placeholder="ton@email.fr">
        </div>
        <div class="field">
          <label>Pseudo <span style="text-transform:none;letter-spacing:.05em">(si première séance)</span></label>
          <input v-model="uname" type="text" maxlength="20" autocomplete="username"
                 spellcheck="false" placeholder="optionnel">
        </div>

        <div v-if="err" class="formErr">{{ err }}</div>

        <div class="btnrow" style="margin-top:22px">
          <button class="big" type="submit" :disabled="profile.busy || !email.trim()">
            Recevoir le code
          </button>
        </div>
        <div class="authAlt">Un code à usage unique arrive par email — pas de mot de passe à retenir.</div>
      </form>

      <!-- étape 2 : le code à 6 chiffres -->
      <form v-else-if="profile.enabled" style="max-width:400px;margin:0 auto"
            @submit.prevent="verify">
        <div class="formOk" style="text-align:center;margin-bottom:18px">
          Code envoyé à {{ email }} — vérifie ta boîte mail.
        </div>
        <div class="field">
          <label>Le code</label>
          <input v-model="code" class="otpInput" type="text" inputmode="numeric"
                 autocomplete="one-time-code" maxlength="8" placeholder="········" spellcheck="false">
        </div>

        <div v-if="err" class="formErr">{{ err }}</div>

        <div class="btnrow" style="margin-top:22px">
          <button class="big" type="submit" :disabled="profile.busy || code.trim().length < 6">
            Entrer dans le club
          </button>
        </div>
        <div class="authAlt">
          <a v-if="cooldown <= 0" @click="sendCode">Renvoyer un code</a>
          <template v-else>Renvoyer un code ({{ cooldown }} s)</template>
          &nbsp;·&nbsp;<a @click="changeEmail">changer d'email</a>
        </div>
      </form>
    </template>
  </section>
</template>
