<script setup lang="ts">
import { ref } from "vue";
import { useProfileStore } from "../stores/profile";

const profile = useProfileStore();

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
    if (e) { err.value = e; return; }
    profile.authOpen = false;
  } else {
    const r = await profile.signUp(email.value.trim(), password.value, uname.value.trim());
    if (r?.err) { err.value = r.err; return; }
    if (r?.info) { info.value = r.info; return; }
    profile.authOpen = false;
  }
}
</script>

<template>
  <div class="modal" @click.self="profile.authOpen = false">
    <div class="panel">
      <div class="setHead">{{ mode === "in" ? "Connexion" : "Créer un profil" }}</div>

      <form @submit.prevent="submit">
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
          <button class="ghost" type="button" @click="profile.authOpen = false">Annuler</button>
        </div>
      </form>

      <div class="authAlt">
        <template v-if="mode === 'in'">Pas encore de profil ? <a @click="mode = 'up'; err = ''">Crée-le ici</a></template>
        <template v-else>Déjà un compte ? <a @click="mode = 'in'; err = ''">Connecte-toi</a></template>
      </div>
    </div>
  </div>
</template>
