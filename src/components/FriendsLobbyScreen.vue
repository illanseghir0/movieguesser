<script setup lang="ts">
/* Le salon « entre amis » (duel en ligne, sur invitation).
   Hôte : choisit le classement et les règles (mêmes réglages que la
   séance locale, valeurs par défaut si on file droit), invite ses amis,
   attend qu'une place se prenne. Invité : voit la config de l'hôte et
   attend le lancement. Sortir de l'écran dissout le salon (hôte) ou
   libère la place (invité) — rien de persistant.
   Étape C à venir : le bouton Lancer démarrera la partie synchronisée. */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { supabase } from "../lib/supabase";
import { useDuelStore } from "../stores/duel";
import { useFriendsStore } from "../stores/friends";
import { useGameStore } from "../stores/game";
import { useListStore } from "../stores/list";
import { useProfileStore } from "../stores/profile";
import { useRoomStore } from "../stores/rooms";
import { useSettingsStore } from "../stores/settings";
import type { RoomConfig } from "../types";
import ListPicker from "./ListPicker.vue";
import RulesModal from "./RulesModal.vue";

const duel = useDuelStore();
const friends = useFriendsStore();
const game = useGameStore();
const list = useListStore();
const profile = useProfileStore();
const rooms = useRoomStore();
const settings = useSettingsStore();

const showRules = ref(false);
const err = ref("");
/** amis déjà invités pendant cette session de salon */
const invited = ref<Set<string>>(new Set());

/* config de l'hôte : réglages courants + classement sélectionné */
function buildConfig(): RoomConfig {
  return {
    mode: settings.mode, rounds: settings.rounds, target: settings.target,
    timer: settings.timer, list_slug: list.selectedSlug ?? undefined,
  };
}

onMounted(async () => {
  friends.load();
  list.loadCatalog();
  // hôte par défaut : on ouvre un salon en arrivant (sauf si on vient
  // d'en rejoindre un en tant qu'invité)
  if (profile.profile && !rooms.room) {
    err.value = (await rooms.createRoom(buildConfig())) ?? "";
  }
});

/* l'hôte pousse ses réglages au salon dès qu'ils changent */
watch([() => settings.mode, () => settings.rounds, () => settings.target,
       () => settings.timer, () => list.selectedSlug],
  () => { if (rooms.isHost && rooms.room) rooms.setConfig(buildConfig()); });

/* dès qu'on est en salon, le canal de jeu écoute (le lancement de
   l'hôte arrive par là, même pour l'invité resté au lobby) */
watch(() => rooms.room?.id, (id) => { if (id) duel.attach(id); }, { immediate: true });

/* quitter l'écran dissout le salon (hôte) ou libère la place (invité) —
   sauf quand on part jouer (duel.playing) */
onUnmounted(() => {
  if (rooms.room && !duel.playing) { duel.detach(); rooms.leave(); }
});

function launch() {
  if (!otherName.value || !list.ready) return;
  duel.hostStart(otherName.value, {
    mode: settings.mode, rounds: settings.rounds,
    target: settings.target, timer: settings.timer,
  });
}

async function inviteFriend(id: string) {
  err.value = "";
  const e = await rooms.invite(id);
  if (e) { err.value = e; return; }
  invited.value = new Set([...invited.value, id]);
}

/* pseudo de l'autre joueur (hôte ou invité) */
const otherId = computed(() => {
  const r = rooms.room;
  if (!r || !profile.profile) return null;
  return rooms.isHost ? r.guest : r.host;
});
const otherName = ref<string | null>(null);
watch(otherId, async (id) => {
  otherName.value = null;
  if (!id || !supabase) return;
  const { data } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
  otherName.value = (data as { username: string } | null)?.username ?? "?";
}, { immediate: true });

/* résumé des règles affiché (hôte : settings ; invité : config du salon) */
const summary = computed(() => {
  const c = rooms.isHost ? buildConfig() : rooms.room?.config ?? {};
  const m = c.mode === "points" ? `course à ${c.target} pts` : `${c.rounds ?? 10} manches`;
  const t = c.timer ? `chrono ${c.timer} s` : "sans chrono";
  return `${m} · ${t} · devinettes simultanées`;
});
const guestListTitle = computed(() => {
  const slug = rooms.room?.config.list_slug;
  return list.catalog.find((e) => e.slug === slug)?.title ?? slug ?? "classement de l'hôte";
});
</script>

<template>
  <section>
    <div class="setHead">Entre amis</div>

    <!-- connexion obligatoire : le salon vit sur ton profil -->
    <template v-if="!profile.profile">
      <p class="clubIntro">
        Une séance entre amis se joue à visage découvert —
        connecte-toi pour ouvrir un salon ou répondre à une invitation.
      </p>
      <div class="btnrow"><button class="big" @click="game.goProfile()">Connexion</button></div>
    </template>

    <!-- le salon vient d'être dissous par l'hôte -->
    <template v-else-if="rooms.dissolved">
      <p class="clubIntro">L'hôte a levé la séance — le salon est dissous.</p>
      <div class="btnrow"><button class="big" @click="rooms.dissolved = false; game.goHome()">Accueil</button></div>
    </template>

    <!-- invité : la config de l'hôte, en attente du lancement -->
    <template v-else-if="rooms.room && !rooms.isHost">
      <p class="clubIntro">
        Tu es dans le salon de <b>{{ otherName ?? "…" }}</b> — c'est l'hôte qui règle
        la séance et lance la partie.
      </p>
      <div class="actLbl">Le programme</div>
      <div class="ruleSummary">
        <span class="sum">{{ guestListTitle }} · {{ summary }}</span>
      </div>
      <div class="statusWrap" style="margin-top:26px">
        <span class="statusChip info"><span class="dotc"></span>
          <span>En attente du lancement par l'hôte…</span></span>
      </div>
      <div class="btnrow" style="margin-top:30px">
        <button class="ghost" @click="rooms.leave(); game.goHome()">Quitter le salon</button>
      </div>
    </template>

    <!-- hôte : réglages + invitations -->
    <template v-else>
      <ListPicker :remember="false" />

      <div class="actLbl">Règles</div>
      <div class="ruleSummary">
        <span class="sum">{{ summary }}</span>
        <button class="ghost" @click="showRules = true">Personnaliser</button>
      </div>
      <RulesModal :open="showRules" online @close="showRules = false" />

      <div class="actLbl">La salle</div>
      <div class="ladder">
        <div class="lrow">
          <span class="fdot on"></span>
          <span class="who">{{ profile.profile.username }}</span>
          <span class="when">hôte</span>
        </div>
        <div class="lrow">
          <span class="fdot" :class="{ on: !!otherName }"></span>
          <span class="who" :style="otherName ? '' : 'color:var(--muted)'">
            {{ otherName ?? "siège libre" }}
          </span>
          <span v-if="otherName" class="when">prêt</span>
        </div>
      </div>

      <template v-if="!otherName">
        <div class="fSub">Inviter un ami</div>
        <p v-if="!friends.friends.length" class="clubIntro" style="font-size:14px">
          Ta liste d'amis est vide — ajoute des cinéphiles depuis
          <a style="cursor:pointer" @click="game.goProfile()">ta carte de membre</a>.
        </p>
        <div v-else class="ladder">
          <div v-for="f in friends.friends" :key="f.id" class="lrow">
            <span class="fdot" :class="{ on: friends.isOnline(f.id) }"></span>
            <span class="who">{{ f.username }}</span>
            <span class="frowBtns">
              <span v-if="invited.has(f.id)" class="when">invité ✓</span>
              <button v-else class="ghost sm" :disabled="rooms.busy" @click="inviteFriend(f.id)">
                Inviter
              </button>
            </span>
          </div>
        </div>
      </template>
      <div v-if="err" class="formErr" style="text-align:center">{{ err }}</div>

      <div class="btnrow launchRow">
        <button class="big xl" :disabled="!otherName || !list.ready" @click="launch()">
          Lancer la séance
        </button>
      </div>
      <p v-if="!otherName" class="competNote" style="margin-top:-60px">
        La séance se lance dès qu'un ami a pris place.
      </p>
    </template>
  </section>
</template>
