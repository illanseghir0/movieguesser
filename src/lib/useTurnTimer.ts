/* ============================================================
   useTurnTimer — chrono de tour basé sur l'horloge réelle
   Un setInterval décompté tick par tick se fige quand l'onglet
   passe en arrière-plan (throttling navigateur) : on pouvait
   « geler » le chrono pour réfléchir. Ici la date limite est
   posée une fois (Date.now() + s) et chaque tick recalcule le
   temps restant réel ; au retour d'onglet on recale aussitôt.
   ============================================================ */

import { onUnmounted, ref } from "vue";

export function useTurnTimer(onExpire: () => void) {
  const timeLeft = ref(0);
  let deadline = 0;
  let int: number | undefined;

  function stop() { clearInterval(int); int = undefined; }

  function tick() {
    const left = Math.ceil((deadline - Date.now()) / 1000);
    timeLeft.value = Math.max(0, left);
    if (left <= 0) { stop(); onExpire(); }
  }

  function start(seconds: number) {
    stop();
    if (!seconds) return;
    deadline = Date.now() + seconds * 1000;
    timeLeft.value = seconds;
    // 4 ticks/s : l'affichage reste net même si le navigateur en saute
    int = window.setInterval(tick, 250);
  }

  const onVis = () => {
    if (int !== undefined && document.visibilityState === "visible") tick();
  };
  document.addEventListener("visibilitychange", onVis);
  onUnmounted(() => {
    stop();
    document.removeEventListener("visibilitychange", onVis);
  });

  return { timeLeft, start, stop };
}
