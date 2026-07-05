<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { supabase } from "../lib/supabase";
import { useProfileStore } from "../stores/profile";
import { useFriendsStore } from "../stores/friends";
import type { Profile } from "../types";

const profile = useProfileStore();
const friends = useFriendsStore();

onMounted(() => { if (profile.profile) friends.load(); });

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

/* ---- mes amis : ajout par pseudo, réponses, profil consultable ---- */
const fUname = ref("");
const fMsg = ref("");
const fOk = ref(false);

async function addFriend() {
  if (!fUname.value.trim()) return;
  fMsg.value = "";
  const e = await friends.add(fUname.value);
  fOk.value = !e;
  fMsg.value = e ?? "Invitation envoyée — elle attend sa réponse";
  if (!e) fUname.value = "";
}

/* profil d'un ami en modale (profiles est en lecture publique) */
const viewed = ref<Profile | null>(null);
const viewedRate = computed(() => {
  const p = viewed.value;
  if (!p || !p.games_played) return "—";
  return Math.round((p.games_won / p.games_played) * 100) + " %";
});
async function viewProfile(id: string) {
  if (!supabase) return;
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (data) viewed.value = data as Profile;
}
function fmtSince(iso: string | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
</script>

<template>
  <section>
    <!-- membre connecté : la carte -->
    <template v-if="profile.profile">
      <div class="setHead">Carte de membre</div>

      <div class="breakout">
        <div class="member">
          <div class="mhead">
            <div class="ppBig">{{ profile.profile.username.charAt(0).toUpperCase() }}</div>
            <div>
              <div class="uname">{{ profile.profile.username }}</div>
              <div v-if="since" class="since">membre depuis {{ since }}</div>
            </div>
          </div>
          <div class="stub"><span>Admit One</span></div>
        </div>

        <div class="mstats">
          <div class="ms">
            <div class="n">{{ profile.profile.games_played }}</div>
            <div class="l">Séances</div>
          </div>
          <div class="ms">
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

      <div class="clubIntro" style="margin-top:30px;margin-bottom:0">
        Tes statistiques s'écrivent à chaque générique de fin.
      </div>

      <!-- ---- mes amis ---- -->
      <div class="actLbl">Mes amis</div>

      <div class="friendAdd">
        <input v-model="fUname" type="text" maxlength="20"
               placeholder="pseudo movieguesser" @keydown.enter="addFriend">
        <button class="ghost" :disabled="friends.busy || !fUname.trim()" @click="addFriend">
          Envoyer l'invitation
        </button>
      </div>
      <div v-if="fMsg" :class="fOk ? 'formOk' : 'formErr'" style="text-align:center">{{ fMsg }}</div>

      <!-- demandes reçues -->
      <template v-if="friends.incoming.length">
        <div class="fSub">Demandes reçues</div>
        <div class="ladder">
          <div v-for="f in friends.incoming" :key="f.id" class="lrow">
            <span class="fdot"></span>
            <span class="who">{{ f.username }}</span>
            <span class="frowBtns">
              <button class="ghost sm" :disabled="friends.busy" @click="friends.respond(f.id, true)">Accepter</button>
              <button class="linkBtn" :disabled="friends.busy" @click="friends.respond(f.id, false)">refuser</button>
            </span>
          </div>
        </div>
      </template>

      <!-- la liste -->
      <p v-if="!friends.friends.length && !friends.incoming.length" class="clubIntro"
         style="margin-top:18px;font-size:14px">
        Le club est meilleur accompagné — invite un premier cinéphile par son pseudo.
      </p>
      <div v-else-if="friends.friends.length" class="ladder" style="margin-top:14px">
        <div v-for="f in friends.friends" :key="f.id" class="lrow">
          <span class="fdot" :class="{ on: friends.isOnline(f.id) }"
                :title="friends.isOnline(f.id) ? 'en ligne' : 'hors ligne'"></span>
          <span class="who fLink" role="button" tabindex="0"
                @click="viewProfile(f.id)" @keydown.enter="viewProfile(f.id)">{{ f.username }}</span>
          <span class="frowBtns">
            <button class="linkBtn" :disabled="friends.busy" @click="friends.remove(f.id)">retirer</button>
          </span>
        </div>
      </div>

      <!-- demandes envoyées -->
      <template v-if="friends.outgoing.length">
        <div class="fSub">Invitations envoyées</div>
        <div class="ladder">
          <div v-for="f in friends.outgoing" :key="f.id" class="lrow">
            <span class="fdot"></span>
            <span class="who">{{ f.username }}</span>
            <span class="when">en attente</span>
            <span class="frowBtns">
              <button class="linkBtn" :disabled="friends.busy" @click="friends.remove(f.id)">annuler</button>
            </span>
          </div>
        </div>
      </template>

      <!-- profil d'un ami -->
      <Teleport to="body">
        <div v-if="viewed" class="modal" @click.self="viewed = null">
          <div class="panel">
            <div class="setHead" style="margin-bottom:6px">{{ viewed.username }}</div>
            <p v-if="fmtSince(viewed.created_at)" class="clubIntro" style="margin-bottom:20px;font-size:13px">
              membre depuis {{ fmtSince(viewed.created_at) }}
            </p>
            <div class="fStats">
              <div class="fs"><b>{{ viewed.games_played }}</b><span>Séances</span></div>
              <div class="fs"><b>{{ viewed.games_won }}</b><span>Victoires</span></div>
              <div class="fs"><b>{{ viewedRate }}</b><span>Taux</span></div>
              <div class="fs"><b>{{ viewed.best_gap ?? "—" }}</b><span>Meilleur écart</span></div>
            </div>
            <div class="btnrow" style="margin-top:24px">
              <button class="ghost" @click="viewed = null">Fermer</button>
            </div>
          </div>
        </div>
      </Teleport>
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
