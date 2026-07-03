/* ============================================================
   letterboxd.js — couche données
   Récupération d'une liste Letterboxd sans backend :
   letterboxd.com n'autorise pas le cross-origin, on passe par des
   proxys CORS publics (avec fallback). Le parsing reprend scrape.py :
   - pages de liste : [data-item-slug] + data-item-name + data-list-index
   - page film (à la demande) : JSON-LD -> affiche portrait, réalisateur
   Cache localStorage par liste (7 jours), affiches comprises.
   ============================================================ */

let films = null;        // la liste chargée (URL, films.json auto ou drag-drop)
let listTitle = null;    // nom de la liste affiché dans le header
let listKey = null;      // URL normalisée -> clé de cache localStorage
let MAXR = 500;          // rang max = longueur de la liste chargée

const PROXIES = [
  u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  u => "https://corsproxy.io/?url=" + encodeURIComponent(u),
];
let proxyIdx = 0; // on retient le premier proxy qui marche

async function fetchHTML(url){
  for(let k=0;k<PROXIES.length;k++){
    const i = (proxyIdx+k)%PROXIES.length;
    try{
      const r = await fetch(PROXIES[i](url));
      if(r.ok){
        const t = await r.text();
        if(t && t.length>500){ proxyIdx = i; return t; }
      }
    }catch(_){}
  }
  throw new Error("aucun proxy CORS disponible");
}

function normListUrl(u){
  const m = String(u).trim().match(/letterboxd\.com\/([^\/]+)\/list\/([^\/?#]+)/i);
  return m ? `https://letterboxd.com/${m[1]}/list/${m[2]}/` : null;
}

async function loadList(){
  const base = normListUrl($("listUrl").value);
  if(!base){
    setStatus("err","URL invalide — attendu : letterboxd.com/…/list/…");
    return;
  }
  // cache : une liste déjà récupérée (moins de 7 jours) se recharge instantanément
  try{
    const c = JSON.parse(localStorage.getItem("duelList:"+base)||"null");
    if(c && Date.now()-c.t < 7*864e5 && Array.isArray(c.films) && c.films.length){
      applyList(c.films, c.title, base);
      localStorage.setItem("duelLast", base);
      setStatus("ok", `${esc(c.title)} · ${c.films.length} films`);
      return;
    }
  }catch(_){}

  $("loadList").disabled = true;
  try{
    let page=1, out=[], seen=new Set(), title=null, totalPages=null;
    while(page<=20){
      setStatus("info", `Récupération — page ${page}${totalPages?` / ${totalPages}`:""}…`);
      const html = await fetchHTML(page===1 ? base : `${base}page/${page}/`);
      const doc = new DOMParser().parseFromString(html, "text/html");
      if(page===1){
        const og = doc.querySelector('meta[property="og:title"]');
        title = (og?.content || doc.querySelector("h1")?.textContent || "Liste Letterboxd")
                .split("•")[0].split(", a list")[0].trim();
        const pg = [...doc.querySelectorAll(".paginate-page")]
                   .map(e=>parseInt(e.textContent,10)).filter(n=>n>0);
        if(pg.length) totalPages = Math.max(...pg);
      }
      const nodes = doc.querySelectorAll("[data-item-slug]");
      if(!nodes.length) break;
      nodes.forEach(n=>{
        const slug = n.getAttribute("data-item-slug");
        if(!slug || seen.has(slug)) return;
        seen.add(slug);
        const nm = (n.getAttribute("data-item-name") || slug.replace(/-/g," ")).trim();
        const m = nm.match(/^(.+?)\s+\((\d{4})\)\s*$/);
        const idx = n.getAttribute("data-list-index");
        out.push({ rank: idx!=null ? +idx+1 : out.length+1,
                   title: m ? m[1] : nm, year: m ? +m[2] : null,
                   slug, url: `https://letterboxd.com/film/${slug}/` });
      });
      if(totalPages && page>=totalPages) break;
      page++;
      await new Promise(r=>setTimeout(r,250)); // politesse
    }
    if(!out.length) throw new Error("liste vide");
    out.sort((a,b)=>a.rank-b.rank);
    applyList(out, title, base);
    saveListCache();
    localStorage.setItem("duelLast", base);
    setStatus("ok", `${esc(title)} · ${out.length} films`);
  }catch(e){
    setStatus("err","Liste inaccessible (proxys indisponibles ou liste privée) — réessaie dans un instant");
  }finally{
    $("loadList").disabled = false;
  }
}

function applyList(list, title, key){
  films = list; listTitle = title || "Liste Letterboxd"; listKey = key;
  MAXR = list[list.length-1].rank;
  $("dataTag").textContent = `${listTitle} · ${films.length} films`;
  $("start").disabled = false;
}

function saveListCache(){
  if(!listKey) return;
  try{
    localStorage.setItem("duelList:"+listKey,
      JSON.stringify({t:Date.now(), title:listTitle, films}));
  }catch(_){}
}

/* ---- affiche, année et réalisateur, récupérés à la demande (page film) ---- */
const metaQ = {};
function ensureMeta(f){
  if(!f || !f.slug || (f.poster!==undefined && f.director!==undefined)) return Promise.resolve();
  if(metaQ[f.slug]) return metaQ[f.slug];
  metaQ[f.slug] = (async()=>{
    try{
      const html = await fetchHTML(f.url);
      const doc = new DOMParser().parseFromString(html, "text/html");
      // le JSON-LD contient l'affiche portrait (og:image n'est qu'un crop paysage)
      let ld = null;
      const sc = doc.querySelector('script[type="application/ld+json"]');
      if(sc){ try{ ld = JSON.parse(sc.textContent.replace(/\/\*[\s\S]*?\*\//g,"")); }catch(_){} }
      f.poster = (ld && ld.image)
              || doc.querySelector('meta[property="og:image"]')?.content
              || f.poster || null;
      const dirs = ld && ld.director ? (Array.isArray(ld.director)?ld.director:[ld.director]) : [];
      f.director = dirs.map(d=>d && d.name).filter(Boolean).slice(0,2).join(" & ") || null;
      if(!f.year){
        const m = (doc.querySelector('meta[property="og:title"]')?.content||"").match(/\((\d{4})\)/);
        if(m) f.year = +m[1];
      }
    }catch(_){
      if(f.poster===undefined) f.poster = null;
      if(f.director===undefined) f.director = null;
    }
    saveListCache();
  })();
  return metaQ[f.slug];
}

/* ---- films.json (secours local, produit par scrape.py) ---- */
function normFilms(data){
  return data.map(d=>({rank:+d.rank, title:d.title, poster:d.poster||null,
                       year:d.year||null, slug:d.slug||null, url:d.url||null}))
             .filter(d=>d.rank && d.title).sort((a,b)=>a.rank-b.rank);
}

function loadJSON(f){
  const fr = new FileReader();
  fr.onload = ()=>{
    try{
      const data = JSON.parse(fr.result);
      if(!Array.isArray(data) || !data.length) throw 0;
      applyList(normFilms(data), "films.json", null);
      setStatus("ok", `films.json · ${films.length} films`);
    }catch(_){ setStatus("err","Fichier illisible — attendu : le films.json de scrape.py"); }
  };
  fr.readAsText(f);
}

/* ---- restaure la dernière liste jouée (visiteur qui revient) ---- */
function restoreLast(){
  if(films) return;
  try{
    const last = localStorage.getItem("duelLast");
    if(!last) return;
    const c = JSON.parse(localStorage.getItem("duelList:"+last)||"null");
    if(c && Array.isArray(c.films) && c.films.length){
      $("listUrl").value = last;
      applyList(c.films, c.title, last);
      setStatus("ok", `${esc(c.title)} · ${c.films.length} films`);
    }
  }catch(_){}
}
