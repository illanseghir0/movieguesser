/* ============================================================
   utils.js — helpers DOM et divers, partagés par tous les fichiers
   (pas de modules ES : le jeu doit marcher en ouvrant index.html
   directement, donc simple partage par portée globale, scripts
   chargés dans l'ordre en fin de body)
   ============================================================ */

const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = id => document.getElementById(id);
const show = (el, on) => el.classList.toggle("hidden", !on);

function esc(s){
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

/* chip d'état sous le champ URL (ok / err / info) */
function setStatus(type, msg){
  const st = $("status");
  st.className = "statusChip " + type;
  st.innerHTML = `<span class="dotc"></span><span>${msg}</span>`;
}
