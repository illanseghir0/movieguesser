/* ============================================================
   main.js — accueil, citations, chargeur films.json, tilt 3D,
   et boot (films.json local sinon dernière liste jouée)
   ============================================================ */

/* ---- citations pour l'accueil ---- */
const QUOTES = [
  ["« La vie, c'est comme une boîte de chocolats : on ne sait jamais sur quoi on va tomber. »","Forrest Gump — 1994"],
  ["« Je suis le roi du monde ! »","Titanic — 1997"],
  ["« Que la Force soit avec toi. »","Star Wars — 1977"],
  ["« Franchement, ma chère, c'est le cadet de mes soucis. »","Autant en emporte le vent — 1939"],
  ["« La première règle du Fight Club est : il est interdit de parler du Fight Club. »","Fight Club — 1999"],
  ["« I'll be back. »","Terminator — 1984"],
  ["« Toto, j'ai l'impression que nous ne sommes plus au Kansas. »","Le Magicien d'Oz — 1939"],
  ["« C'est pas ta faute. »","Will Hunting — 1997"],
  ["« Un grand pouvoir implique de grandes responsabilités. »","Spider-Man — 2002"],
  ["« Ils ne savaient pas que c'était impossible, alors ils l'ont fait. »","attribué à Mark Twain, cité partout au cinéma"],
  ["« Voici venir ton coucher de soleil, cow-boy. »","Il était une fois dans l'Ouest — 1968"],
  ["« E.T. téléphone maison. »","E.T. l'extra-terrestre — 1982"],
];

function newQuote(){
  const q = QUOTES[(Math.random()*QUOTES.length)|0];
  $("qt").textContent = q[0]; $("qa").textContent = q[1];
}
newQuote();

/* ---- navigation accueil <-> paramètres ---- */
$("loadList").addEventListener("click", loadList);
$("listUrl").addEventListener("keydown", e=>{ if(e.key==="Enter") loadList(); });
$("openSettings").addEventListener("click", ()=>{ show($("home"),false); show($("settings"),true); });
$("backHome").addEventListener("click", ()=>{ show($("settings"),false); show($("home"),true); });

/* ---- zone de drop films.json ---- */
const drop = $("drop"), file = $("file");
drop.addEventListener("click", ()=>file.click());
file.addEventListener("change", e=> e.target.files[0] && loadJSON(e.target.files[0]));
["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");}));
drop.addEventListener("drop", e=> e.dataTransfer.files[0] && loadJSON(e.dataTransfer.files[0]));

/* ---- boot : films.json à côté de la page, sinon dernière liste jouée ---- */
fetch("films.json").then(r=>r.ok?r.json():null).then(d=>{
  if(d && Array.isArray(d) && d.length){
    applyList(normFilms(d), "films.json", null);
  } else { restoreLast(); }
}).catch(restoreLast);

/* ---- tilt 3D sur l'affiche (desktop uniquement) ---- */
const zone = $("posterZone");
if(!REDUCE && matchMedia("(pointer:fine)").matches){
  zone.addEventListener("pointermove", e=>{
    const r = zone.getBoundingClientRect();
    const x = (e.clientX-r.left)/r.width - .5, y = (e.clientY-r.top)/r.height - .5;
    zone.style.transform = `perspective(700px) rotateY(${x*9}deg) rotateX(${-y*9}deg)`;
  });
  zone.addEventListener("pointerleave", ()=>{ zone.style.transform=""; });
}
