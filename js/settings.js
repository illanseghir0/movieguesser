/* ============================================================
   settings.js — réglages persistants (localStorage) et écran
   Paramètres : mode de jeu, manches / objectif, ordre de passage
   ============================================================ */

const CFG = Object.assign(
  { mode:"rounds", rounds:10, target:1000, start:"alt" },
  JSON.parse(localStorage.getItem("gtrCfg")||"{}"));
const saveCfg = ()=> localStorage.setItem("gtrCfg", JSON.stringify(CFG));

function renderCfg(){
  document.querySelectorAll("#segMode .s").forEach(s=>s.classList.toggle("on", s.dataset.v===CFG.mode));
  document.querySelectorAll("#segStart .s").forEach(s=>s.classList.toggle("on", s.dataset.v===CFG.start));
  show($("fRounds"), CFG.mode==="rounds");
  show($("fTarget"), CFG.mode==="points");
  document.querySelectorAll("#rounds .r").forEach(r=>r.classList.toggle("on", +r.dataset.r===CFG.rounds));
  document.querySelectorAll("#targets .r").forEach(r=>r.classList.toggle("on", +r.dataset.t===CFG.target));
  $("roundsCustom").value = CFG.rounds;
  $("targetCustom").value = CFG.target;
  $("modeNote").textContent = CFG.mode==="rounds"
    ? `La partie dure ${CFG.rounds} manches — 1 point par manche gagnée.`
    : `Le vainqueur d'une manche marque l'écart entre les deux estimations. Premier à ${CFG.target} points.`;
}

$("segMode").addEventListener("click", e=>{
  const s = e.target.closest(".s"); if(!s) return;
  CFG.mode = s.dataset.v; saveCfg(); renderCfg();
});
$("segStart").addEventListener("click", e=>{
  const s = e.target.closest(".s"); if(!s) return;
  CFG.start = s.dataset.v; saveCfg(); renderCfg();
});
$("rounds").addEventListener("click", e=>{
  const r = e.target.closest(".r"); if(!r) return;
  CFG.rounds = +r.dataset.r; saveCfg(); renderCfg();
});
$("roundsCustom").addEventListener("input", e=>{
  const v = parseInt(e.target.value,10);
  if(v>=1 && v<=99){ CFG.rounds = v; saveCfg();
    document.querySelectorAll("#rounds .r").forEach(r=>r.classList.toggle("on", +r.dataset.r===v));
    $("modeNote").textContent = `La partie dure ${v} manches — 1 point par manche gagnée.`; }
});
$("targets").addEventListener("click", e=>{
  const r = e.target.closest(".r"); if(!r) return;
  CFG.target = +r.dataset.t; saveCfg(); renderCfg();
});
$("targetCustom").addEventListener("input", e=>{
  const v = parseInt(e.target.value,10);
  if(v>=50 && v<=99999){ CFG.target = v; saveCfg();
    document.querySelectorAll("#targets .r").forEach(r=>r.classList.toggle("on", +r.dataset.t===v));
    $("modeNote").textContent = `Le vainqueur d'une manche marque l'écart entre les deux estimations. Premier à ${v} points.`; }
});

renderCfg();
