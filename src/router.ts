/* ============================================================
   router.ts — URLs partageables et retour navigateur
   /jeu et /fin exigent une partie en cours : un accès direct
   (ou un rechargement, l'état étant en mémoire) renvoie à l'accueil.
   ============================================================ */

import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "accueil", component: () => import("./components/HomeScreen.vue") },
    { path: "/nouvelle-seance", name: "modes", component: () => import("./components/ModeScreen.vue") },
    { path: "/seance", name: "seance", component: () => import("./components/SetupScreen.vue") },
    { path: "/profil", name: "profil", component: () => import("./components/ProfileScreen.vue") },
    { path: "/jeu", name: "jeu", component: () => import("./components/PlayScreen.vue") },
    { path: "/fin", name: "fin", component: () => import("./components/EndScreen.vue") },
    { path: "/competitif", name: "competitif", component: () => import("./components/CompetScreen.vue") },
    { path: "/competitif/jeu", name: "competJeu", component: () => import("./components/CompetPlayScreen.vue") },
    { path: "/competitif/fin", name: "competFin", component: () => import("./components/CompetEndScreen.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  if (["jeu", "fin", "competJeu", "competFin"].includes(String(to.name))) {
    // import paresseux : évite un cycle statique router <-> store
    const { useGameStore } = await import("./stores/game");
    if (useGameStore().round === 0) return { name: "accueil" };
  }
});

export default router;
