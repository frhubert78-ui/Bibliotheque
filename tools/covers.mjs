// Recherche des couvertures, résumés et extraits pour tous les livres de l'appli.
// Lancé automatiquement par GitHub Actions ; écrit covers.json à la racine.
// Version 2 (26/11/2026) : correspondance stricte (titre + tome + auteur) et résumés en français uniquement.
import fs from "node:fs";
const VER = 2;
const html = fs.readFileSync("index.html", "utf8");
const grab = n => { const i = html.indexOf("const " + n + " = ["); const j = html.indexOf("].map(", i); return eval(html.slice(i + ("const " + n + " = ").length, j + 1)); };
const books = [...grab("BASE").map(r => ({ titre: r[0], auteur: r[1] })), ...grab("NEW").map(r => ({ titre: r[0], auteur: r[1] }))];
const out = fs.existsSync("covers.json") ? JSON.parse(fs.readFileSync("covers.json", "utf8")) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = b => (b.titre + "|" + b.auteur).toLowerCase();
const cleanT = t => (t || "").replace(/\s*[–—-]\s*(tome|vol\.?)\s*\d+.*$/i, "").replace(/\s*\(.*?\)\s*/g, " ").replace(/[«»"]/g, "").trim();
const goodA = a => a && !/vérifier|disney|marvel|larousse|harrap|bescherelle|oxford|sgel|moulinex|anonyme|traduction|illisible/i.test(a);
const lastName = a => { if (!goodA(a)) return ""; const x = a.split(/[,&(·]/)[0].replace(/\b(Madame|Abbé|et)\b/g, " ").trim().split(/\s+/); return x[x.length - 1] || ""; };
const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set("le la les l de du des d un une et a au aux en the of and to".split(" "));
const toks = s => norm(s).split(" ").filter(w => w.length > 1 && !STOP.has(w));
const cover = (need, have) => { const n = toks(need); if (!n.length) return 1; const h = new Set(toks(have)); return n.filter(w => h.has(w)).length / n.length; };
// Le résumé doit être en français : on compte les petits mots typiques.
const isFr = d => { const w = norm(d).split(" "); const fr = w.filter(x => /^(le|la|les|de|des|un|une|et|est|dans|pour|qui|que|avec|sur|pas|son|sa|ses|du|au|elle|il|mais|ce|cette|lui|se|ne|sont)$/.test(x)).length; const en = w.filter(x => /^(the|and|is|of|to|with|his|her|she|he|for|this|that|an)$/.test(x)).length; return fr >= 3 && fr > en * 2; };
const okDesc = d => { d = (d || "").trim(); return d.length >= 80 && isFr(d) && !/^analyse\s*:/i.test(d); };
const GBKEY = process.env.GB_KEY || "";
const UA = { headers: { "User-Agent": "MaBibliotheque/1.0 (github.com/frhubert78-ui/Bibliotheque)" } };
let gbCalls = 0, gbFail = 0;
async function gb(q, extra = "") {
  if (!GBKEY) return null;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=15&printType=books${extra}&key=${GBKEY}`;
  for (let a = 0; a < 3; a++) { gbCalls++; await sleep(400);
    try { const r = await fetch(url); if (r.status === 429 || r.status >= 500) { await sleep(10000 * (a + 1)); continue; } const j = await r.json(); if (j.error) { gbFail++; return null; } return j.items || []; } catch (e) { await sleep(3000); } }
  gbFail++; return null;
}
async function olGet(u) { for (let a = 0; a < 3; a++) { try { await sleep(700); const r = await fetch(u, UA); if (r.ok) return await r.json(); await sleep(5000); } catch (e) { await sleep(3000); } } return null; }

// Un résultat est accepté seulement s'il correspond vraiment au livre.
function matcher(b) {
  const T = cleanT(b.titre), L = norm(lastName(b.auteur));
  const parts = T.split(/\s*[–—:]\s*/).filter(Boolean);
  const series = parts.length > 1 ? parts[0] : "", tome = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const tnum = (b.titre.match(/(?:\btome|\bvol\.?|[–—-])\s*(\d+)\s*$/i) || [])[1];
  return (title, sub, authors, lang) => {
    const full = (title || "") + " " + (sub || "");
    let t;
    if (tome) t = cover(tome, full) >= 0.75 && (cover(series, full) >= 0.5 || cover(T, full) >= 0.8);
    else t = cover(T, full) >= 0.85 && cover(title, T) >= 0.6;
    if (t && tnum && !new RegExp("\\b" + tnum + "\\b").test(norm(full))) t = false;
    if (!t) return 0;
    const a = norm((authors || []).join(" "));
    if (L && !a.includes(L)) return 0;
    if (!L && !tome && norm(title) !== norm(T)) return 0;
    return 5 + (lang === "fr" || lang === "fre" ? 3 : 0) + (norm(title) === norm(T) ? 2 : 0);
  };
}

async function ol(b, T, L, match) {
  const f = "&limit=20&fields=key,title,subtitle,cover_i,language,ebook_access,ia,author_name";
  let r = await olGet(`https://openlibrary.org/search.json?title=${encodeURIComponent(T)}${L ? "&author=" + encodeURIComponent(L) : ""}${f}`);
  let docs = (r && r.docs) || [];
  if (!docs.some(d => d.cover_i && match(d.title, d.subtitle, d.author_name, (d.language || []).includes("fre") ? "fre" : ""))) {
    const r2 = await olGet(`https://openlibrary.org/search.json?q=${encodeURIComponent(T + (L ? " " + L : ""))}${f}`); docs = docs.concat((r2 && r2.docs) || []); }
  const sc = d => { const m = match(d.title, d.subtitle, d.author_name, (d.language || []).includes("fre") ? "fre" : ""); return m ? m + (d.cover_i ? 2 : 0) : 0; };
  docs = docs.filter(d => sc(d) > 0).sort((a, b) => sc(b) - sc(a));
  const best = docs.find(d => d.cover_i) || docs[0]; if (!best) return null;
  const o = {}; if (best.cover_i) o.img = `https://covers.openlibrary.org/b/id/${best.cover_i}-L.jpg`;
  const w = await olGet(`https://openlibrary.org${best.key}.json`);
  if (w && w.description) { const d = (typeof w.description === "string" ? w.description : w.description.value || "").replace(/\(\[source\].*$/s, "").slice(0, 1600); if (okDesc(d)) o.desc = d; }
  const pub = docs.find(d => d.ebook_access === "public" && d.ia && d.ia.length); if (pub) o.ia = `https://archive.org/details/${pub.ia[0]}`;
  o.link = `https://openlibrary.org${best.key}`;
  return o;
}

let done = 0, found = 0; const START = Date.now();
for (const b of books) {
  if (Date.now() - START > 45 * 60000) { console.log("Temps écoulé : la suite au prochain passage."); break; }
  const k = key(b), old = out[k];
  if (old && old.v === VER && (old.px || !GBKEY)) { if (old.img) found++; continue; }
  if (/illisible/i.test(b.titre)) { out[k] = { v: VER, px: 1 }; continue; }
  const T = cleanT(b.titre), L = lastName(b.auteur), match = matcher(b);
  const m = { v: VER };
  let ok = !!GBKEY;
  const o = await ol(b, T, L, match); if (o) Object.assign(m, o);
  if (GBKEY) {
    const sv = v => { const vi = v.volumeInfo || {}; const s = match(vi.title, vi.subtitle, vi.authors, vi.language); return s ? s + (vi.imageLinks ? 2 : 0) + (okDesc(vi.description) ? 1 : 0) : 0; };
    const qA = `intitle:"${T.split(/\s*[–—:]\s*/).pop()}"` + (L ? ` inauthor:"${L}"` : "");
    const qB = T + (L ? " " + L : "");
    let all = [];
    for (const [q, x] of [[qA, "&langRestrict=fr"], [qB, "&langRestrict=fr"], [qA, ""]]) { const it = await gb(q, x); if (it === null) { ok = false; break; } all = all.concat(it); if (it.some(v => sv(v) >= 10)) break; }
    all = all.filter(v => sv(v) > 0).sort((x, y) => sv(y) - sv(x));
    const v = all.find(x => x.volumeInfo.imageLinks) || all[0];
    if (v) { const vi = v.volumeInfo;
      if (!m.img && vi.imageLinks) m.img = (vi.imageLinks.thumbnail || vi.imageLinks.smallThumbnail).replace("http:", "https:").replace("&edge=curl", "");
      const d = all.find(x => okDesc(x.volumeInfo.description)); if (d) m.desc = d.volumeInfo.description.replace(/<[^>]+>/g, " ").slice(0, 1600);
      m.glink = vi.previewLink || vi.infoLink; }
    let pv = all.find(x => (x.accessInfo || {}).embeddable && ["PARTIAL", "ALL_PAGES"].includes(x.accessInfo.viewability));
    if (!pv && ok) { const it2 = await gb(qA, "&filter=partial"); if (it2) pv = it2.filter(x => sv(x) > 0).sort((x, y) => sv(y) - sv(x))[0]; else ok = false; }
    if (pv) { if ((pv.accessInfo || {}).embeddable) m.eid = pv.id; m.read = (pv.accessInfo || {}).webReaderLink || pv.volumeInfo.previewLink; }
  }
  if (ok) m.px = 1;
  // En cas de panne Google, on garde l'ancienne fiche plutôt qu'une fiche vide.
  out[k] = ok || !old ? m : old;
  done++; if (out[k].img) found++;
  console.log(`${out[k].img ? "✔" : "✘"} ${b.titre} — ${b.auteur}`);
  if (done % 20 === 0) fs.writeFileSync("covers.json", JSON.stringify(out));
}
fs.writeFileSync("covers.json", JSON.stringify(out));
console.log(`\nLivres : ${books.length} · avec couverture : ${found} · appels Google : ${gbCalls} (échecs : ${gbFail})`);
