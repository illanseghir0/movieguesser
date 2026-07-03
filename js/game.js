/* ============================================================
   game.js — boucle de jeu
   manches, entracte, révélation en 3 temps, scores, générique
   ============================================================ */

const S = { names:["Joueur 1","Joueur 2"], score:[0,0], playRounds:10,
            round:0, deck:[], current:null, guesses:[null,null],
            phase:0, order:[0,1], history:[] };

const PL = [document.querySelector("#play .pl.p1"), document.querySelector("#play .pl.p2")];

// timers de la séquence de révélation (annulés si on passe à la suite)
let timers = [];
const later = (fn,ms)=>{ if(REDUCE) fn(); else timers.push(setTimeout(fn,ms)); };
const clearTimers = ()=>{ timers.forEach(clearTimeout); timers=[]; };

/* ---------- start ---------- */
$("start").addEventListener("click", ()=>{
  S.names = [$("n1").value.trim()||"Joueur 1", $("n2").value.trim()||"Joueur 2"];
  startGame();
});
$("rematch").addEventListener("click", startGame);
$("again").addEventListener("click", ()=>{
  show($("end"),false); show($("home"),true); setBackdrop(null); newQuote();
});

function startGame(){
  if(!films || !films.length) return;
  S.score = [0,0]; S.round = 0; S.history = [];
  // tirage sans répétition
  S.deck = films.slice(); for(let i=S.deck.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[S.deck[i],S.deck[j]]=[S.deck[j],S.deck[i]];}
  S.playRounds = Math.min(CFG.rounds, S.deck.length);
  $("sn1").textContent=S.names[0]; $("sn2").textContent=S.names[1];
  $("sp1").textContent=0; $("sp2").textContent=0;
  // bornes dynamiques : la ligne, la saisie et les textes suivent la taille de la liste
  $("hint").textContent = `Son rang — entre 1 et ${MAXR}`;
  const gi = $("guessInput"); gi.max = MAXR; gi.placeholder = `1–${MAXR}`;
  $("ticks").innerHTML = [0,.25,.5,.75,1]
    .map(f=>`<span>${Math.round(1+(MAXR-1)*f)}</span>`).join("");
  show($("home"),false); show($("settings"),false); show($("end"),false); show($("play"),true);
  nextRound();
}

/* ---------- round flow ---------- */
function nextRound(){
  clearTimers();
  S.round++;
  if(CFG.mode==="points"){
    if(Math.max(...S.score) >= CFG.target || S.round > S.deck.length) return endGame();
    $("midLbl").textContent = `Premier à ${CFG.target}`;
    $("roundLbl").textContent = `Manche ${S.round}`;
    $("progFill").style.width = Math.min(100, Math.max(...S.score)/CFG.target*100)+"%";
  } else {
    if(S.round > S.playRounds) return endGame();
    $("midLbl").textContent = "Manche";
    $("roundLbl").textContent = `${S.round} / ${S.playRounds}`;
    $("progFill").style.width = ((S.round-1)/S.playRounds*100)+"%";
  }
  S.current = S.deck[S.round-1];
  S.guesses = [null,null];
  S.phase = 0;
  // ordre de passage de la manche
  S.order = CFG.start==="fixed"  ? [0,1]
          : CFG.start==="random" ? (Math.random()<.5?[0,1]:[1,0])
          : (S.round%2 ? [0,1] : [1,0]); // alterné
  $("sp1").textContent=S.score[0]; $("sp2").textContent=S.score[1];
  $("stage").classList.remove("revealing");
  renderPoster();
  show($("filmInfo"),true);
  show($("revealBox"),false); show($("guessBox"),true);
  askGuess();
}

function setBackdrop(src){
  const bd = $("bdImg");
  bd.classList.remove("on");
  if(src){ bd.onload = ()=>bd.classList.add("on"); bd.src = src; }
}

let renderSeq = 0;
async function renderPoster(){
  const f = S.current, p = $("poster"), g = $("posterGlow");
  const my = ++renderSeq;
  fillInfo(f);
  if(f.poster===undefined){
    // affiche pas encore récupérée : placeholder pendant le fetch
    g.style.display = "none"; setBackdrop(null);
    p.innerHTML = `<div class="ph"><div class="loader"></div></div>`;
    await ensureMeta(f);
    if(my!==renderSeq) return; // la manche a changé entre-temps
    fillInfo(f);
  } else if(f.director===undefined && f.slug){
    // films.json d'origine : on va chercher le réalisateur (et une meilleure affiche) en fond
    ensureMeta(f).then(()=>{ if(my===renderSeq) fillInfo(f); });
  }
  if(f.poster){
    p.innerHTML = `<img src="${f.poster}" alt="affiche">`;
    g.src = f.poster; g.style.display = "";
    setBackdrop(f.poster);
  } else {
    p.innerHTML = `<div class="ph"><div class="ico">🎞️</div><div class="t">${esc(f.title)}</div>${f.year?`<div class="y">${f.year}</div>`:""}</div>`;
    g.style.display = "none";
    setBackdrop(null);
  }
}

function fillInfo(f){
  const sub = [f.year, f.director ? `de ${f.director}` : null].filter(Boolean).join(" · ");
  $("filmInfo").innerHTML = `<div class="ft">${esc(f.title)}</div>${sub?`<div class="fy">${esc(sub)}</div>`:""}`;
}

function setTurn(i){
  PL[0].classList.toggle("turn", i===0);
  PL[1].classList.toggle("turn", i===1);
}

function askGuess(){
  const p = S.order[S.phase];
  $("prompt").innerHTML = `Au tour de <span class="who${p+1}">${esc(S.names[p])}</span>`;
  $("guessWrap").className = "guess g"+(p+1);
  $("guessInput").value = "";
  $("validate").className = "p"+(p+1);
  $("validate").textContent = S.phase===0 ? "Valider" : "Révéler";
  setTurn(p);
  // entracte : toujours avant le 2e joueur (secret), et avant le 1er si l'ordre varie
  if(S.phase===1 || CFG.start!=="fixed"){ openHandoff(p); }
  else { $("guessInput").focus(); }
}

/* ---------- handoff : le joueur suivant ne doit rien voir ---------- */
function openHandoff(p){
  const h = $("handoff");
  h.classList.remove("hidden","h1","h2");
  h.classList.add("h"+(p+1));
  $("handoffName").textContent = S.names[p];
  const b = $("handoffGo");
  b.className = "big p"+(p+1);
  b.focus();
}
$("handoffGo").addEventListener("click", ()=>{
  show($("handoff"), false);
  $("guessInput").focus();
});

$("guessInput").addEventListener("keydown", e=>{ if(e.key==="Enter") $("validate").click(); });
$("validate").addEventListener("click", ()=>{
  const v = parseInt($("guessInput").value,10);
  if(!(v>=1 && v<=MAXR)){
    const w = $("guessWrap");
    w.classList.remove("shake"); void w.offsetWidth; w.classList.add("shake");
    $("guessInput").focus(); return;
  }
  S.guesses[S.order[S.phase]] = v;
  if(S.phase===0){ S.phase=1; askGuess(); }
  else { reveal(); }
});

/* ---------- reveal : séquence en 3 temps ---------- */
function reveal(){
  clearTimers();
  const f = S.current, [g1,g2] = S.guesses;
  const d1 = Math.abs(g1-f.rank), d2 = Math.abs(g2-f.rank);
  let win, pts = 0;
  if(CFG.mode==="points"){
    // le vainqueur marque l'écart entre les deux estimations
    pts = Math.abs(d1-d2);
    if(d1<d2){ S.score[0]+=pts; win=1; }
    else if(d2<d1){ S.score[1]+=pts; win=2; }
    else { win=0; }
  } else {
    if(d1<d2){ S.score[0]++; win=1; }
    else if(d2<d1){ S.score[1]++; win=2; }
    else { S.score[0]++; S.score[1]++; win=0; }
  }
  S.history.push({title:f.title, year:f.year, rank:f.rank, g:[g1,g2], d:[d1,d2], win, pts});

  setTurn(-1);
  show($("guessBox"),false);
  show($("filmInfo"),false);
  $("stage").classList.add("revealing");
  show($("revealBox"),true);

  const tr = $("trueRankBig");
  tr.textContent = "# ?"; tr.classList.add("dim");
  $("filmTitle").textContent = f.title + (f.year? ` (${f.year})`:"");
  $("revealDir").textContent = f.director ? `un film de ${f.director}` : "";
  $("filmLink").innerHTML = f.url
    ? `<a href="${f.url}" target="_blank" rel="noopener">Voir sur Letterboxd ↗</a>` : "";
  const v = $("verdict"); v.className = "verdict"; v.textContent = "";
  $("gaps").innerHTML = "";
  show($("next"),false);

  // temps 1 : les paris des deux joueurs se placent sur la ligne
  const pos = r => `${((r-1)/(MAXR-1))*100}%`;
  $("bubP1").textContent = S.names[0].split(" ")[0]+" · "+g1;
  $("bubP2").textContent = S.names[1].split(" ")[0]+" · "+g2;
  $("bubT").textContent = "#"+f.rank;
  const m1=$("markP1"), m2=$("markP2"), mt=$("markT");
  m1.className="mark m1"; m2.className="mark m2"; mt.className="mark mt";
  [m1,m2,mt].forEach(m=>{ m.style.left="0"; m.style.opacity="0"; });
  $("axisFill").style.width="0";
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    m1.style.left = pos(g1); m1.style.opacity="1";
    m2.style.left = pos(g2); m2.style.opacity="1";
  }));

  // temps 2 : le vrai rang tombe (compteur + marqueur orange)
  later(()=>{
    mt.style.left = pos(f.rank); mt.style.opacity="1";
    $("axisFill").style.width = pos(f.rank);
    tr.classList.remove("dim");
    countUp(tr, f.rank);
  }, 1100);

  // temps 3 : verdict, écarts, scores
  later(()=>{
    const ptsMode = CFG.mode==="points";
    if(win===0){
      v.className = "verdict tie show";
      v.textContent = d1===0 ? "🎯 Double perfection — rang exact pour les deux !"
                    : ptsMode ? `Égalité parfaite — personne ne marque (écart de ${d1})`
                              : `Égalité parfaite — +1 chacun (écart de ${d1})`;
      m1.classList.add("won"); m2.classList.add("won");
    } else {
      const w = win-1, gap = w===0?d1:d2;
      v.className = "verdict win"+win+" show";
      v.textContent = gap===0
        ? `🎯 ${S.names[w]} — rang exact !${ptsMode?` +${pts} pts`:""}`
        : ptsMode ? `${S.names[w]} marque ${pts} points !`
                  : `${S.names[w]} marque le point ! (écart de ${gap})`;
      (w===0?m1:m2).classList.add("won");
    }
    $("gaps").innerHTML = `<span>${esc(S.names[0])} : écart <b>${d1}</b></span><span>${esc(S.names[1])} : écart <b>${d2}</b></span>`;
    $("sp1").textContent=S.score[0]; $("sp2").textContent=S.score[1];
    if(win===1 || (win===0 && !ptsMode)) bump($("sp1"));
    if(win===2 || (win===0 && !ptsMode)) bump($("sp2"));
    show($("next"),true);
    $("next").focus({preventScroll:true});
  }, 2450);

  // précharge l'affiche de la manche suivante pendant qu'on regarde le verdict
  const nf = S.deck[S.round];
  if(nf) ensureMeta(nf).then(()=>{ if(nf.poster) new Image().src = nf.poster; });
}

function countUp(el, to){
  if(REDUCE){ el.textContent = "#"+to; return; }
  const from = to <= MAXR/2 ? MAXR : 1, t0 = performance.now(), dur = 950;
  (function step(t){
    const p = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-p,3);
    el.textContent = "#"+Math.round(from+(to-from)*e);
    if(p<1) requestAnimationFrame(step);
  })(t0);
}

function bump(el){ el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }

$("next").addEventListener("click", nextRound);
$("quit").addEventListener("click", endGame);

/* ---------- end : générique ---------- */
function endGame(){
  clearTimers();
  show($("play"),false); show($("handoff"),false); show($("end"),true);
  setBackdrop(null);
  $("en1").textContent=S.names[0]; $("en2").textContent=S.names[1];
  $("ep1").textContent=S.score[0]; $("ep2").textContent=S.score[1];
  const w = $("winner");
  if(S.score[0]>S.score[1]){ w.textContent=`${S.names[0]} l'emporte`; w.style.color="var(--p1)"; }
  else if(S.score[1]>S.score[0]){ w.textContent=`${S.names[1]} l'emporte`; w.style.color="var(--p2)"; }
  else { w.textContent="Match nul"; w.style.color="var(--true)"; }

  const st = $("stats"), rc = $("recap");
  if(!S.history.length){ st.innerHTML=""; rc.innerHTML=""; }
  else{
    let best=null, worst=null;
    S.history.forEach(h=>[0,1].forEach(p=>{
      const e = {p, gap:h.d[p], h};
      if(!best  || e.gap < best.gap)  best = e;
      if(!worst || e.gap > worst.gap) worst = e;
    }));
    st.innerHTML = statCard("Prix de la précision",best) + statCard("Nanar de l'estimation",worst);
    rc.innerHTML = "<h3>Les films de la soirée</h3>" + S.history.map(recRow).join("");
  }
  if(S.history.length && S.score[0]!==S.score[1] && !REDUCE) confetti();
}

function statCard(lbl,e){
  return `<div class="stat"><div class="lbl">${lbl}</div>
    <div class="val" style="color:var(--p${e.p+1})">${esc(S.names[e.p])} — écart ${e.gap}</div>
    <div class="sub">${esc(e.h.title)} (#${e.h.rank})</div></div>`;
}

function recRow(h){
  const chip = p => `<span class="chip c${p+1}${(h.win===p+1||h.win===0)?" win":""}">${h.g[p]} · ±${h.d[p]}</span>`;
  return `<div class="rec-row">
    <div class="rec-film"><b>#${h.rank}</b> ${esc(h.title)}${h.year?` <span class="y">${h.year}</span>`:""}</div>
    <div class="rec-chips">${chip(0)}${chip(1)}</div></div>`;
}

function confetti(){
  const box = document.createElement("div"); box.className = "confetti";
  const colors = ["#00e054","#40bcf4","#ff8000","#e8eef3"];
  for(let i=0;i<70;i++){
    const s = document.createElement("i");
    s.style.left = (Math.random()*100)+"%";
    s.style.background = colors[i%4];
    s.style.animationDelay = (Math.random()*.9)+"s";
    s.style.animationDuration = (2.2+Math.random()*1.6)+"s";
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(()=>box.remove(), 5000);
}
