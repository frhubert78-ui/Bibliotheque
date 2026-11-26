// Recherche des couvertures, résumés et extraits pour tous les livres de l'appli.
// Lancé automatiquement par GitHub Actions ; écrit covers.json à la racine.
// Clé Google Books (secret GB_KEY) ajoutée le 26/11/2026.
import fs from "node:fs";
const html = fs.readFileSync("index.html", "utf8");
const grab = n => { const i = html.indexOf("const " + n + " = ["); const j = html.indexOf("].map(", i); return eval(html.slice(i + ("const " + n + " = ").length, j + 1)); };
const books = [...grab("BASE").map(r => ({ titre: r[0], auteur: r[1] })), ...grab("NEW").map(r => ({ titre: r[0], auteur: r[1] }))];
const out = fs.existsSync("covers.json") ? JSON.parse(fs.readFileSync("covers.json", "utf8")) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = b => (b.titre + "|" + b.auteur).toLowerCase();
const cleanT = t => (t || "").replace(/\s*[–—-]\s*(tome|vol\.?)\s*\d+.*$/i, "").replace(/[«»"]/g, "").trim();
const goodA = a => a && !/vérifier|disney|marvel|larousse|harrap|bescherelle|oxford|sgel|moulinex|anonyme|traduction/i.test(a);
const lastName = a => { if (!goodA(a)) return ""; const x = a.split(/[,&(]/)[0].replace(/\b(Madame|Abbé|et)\b/g, " ").trim().split(/\s+/); return x[x.length - 1] || ""; };
const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const GBKEY = process.env.GB_KEY || "";
const UA = { headers: { "User-Agent": "MaBibliotheque/1.0 (github.com/frhubert78-ui/Bibliotheque)" } };
let gbCalls = 0, gbFail = 0;
async function gb(q, extra = "") {
  if (!GBKEY) return null;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books${extra}&key=${GBKEY}`;
  for (let a = 0; a < 3; a++) { gbCalls++; await sleep(400);
    try { const r = await fetch(url); if (r.status === 429 || r.status >= 500) { await sleep(10000 * (a + 1)); continue; } const j = await r.json(); return j.items || []; } catch (e) { await sleep(3000); } }
  gbFail++; return null;
}
async function olGet(u) { for (let a = 0; a < 3; a++) { try { await sleep(700); const r = await fetch(u, UA); if (r.ok) return await r.json(); await sleep(5000); } catch (e) { await sleep(3000); } } return null; }
async function ol(T, L, nT) {
  const f = "&limit=15&fields=key,title,cover_i,language,ebook_access,ia,author_name";
  let r = await olGet(`https://openlibrary.org/search.json?title=${encodeURIComponent(T)}${L ? "&author=" + encodeURIComponent(L) : ""}${f}`);
  let docs = (r && r.docs) || [];
  if (!docs.some(d => d.cover_i)) { const r2 = await olGet(`https://openlibrary.org/search.json?q=${encodeURIComponent(T + (L ? " " + L : ""))}${f}`); docs = docs.concat((r2 && r2.docs) || []); }
  const sc = d => (norm(d.title) === nT ? 6 : norm(d.title).includes(nT) || nT.includes(norm(d.title)) ? 3 : 0) + ((d.language || []).includes("fre") ? 4 : 0) + (d.cover_i ? 3 : 0) + (L && (d.author_name || []).join(" ").toLowerCase().includes(L.toLowerCase()) ? 2 : 0);
  docs = docs.filter(d => sc(d) >= 5).sort((a, b) => sc(b) - sc(a));
  const best = docs.find(d => d.cover_i) || docs[0]; if (!best) return null;
  const o = {}; if (best.cover_i) o.img = `https://covers.openlibrary.org/b/id/${best.cover_i}-L.jpg`;
  const w = await olGet(`https://openlibrary.org${best.key}.json`);
  if (w && w.description) o.desc = (typeof w.description === "string" ? w.description : w.description.value || "").replace(/\(\[source\].*$/s, "").slice(0, 1600);
  const pub = docs.find(d => d.ebook_access === "public" && d.ia && d.ia.length); if (pub) o.ia = `https://archive.org/details/${pub.ia[0]}`;
  o.link = `https://openlibrary.org${best.key}`;
  return o;
}
let done = 0, found = 0; const START = Date.now();
for (const b of books) {
  if (Date.now() - START > 40 * 60000) { console.log("Temps écoulé : la suite au prochain passage."); break; }
  const k = key(b); if (out[k] && out[k].olt && (out[k].img || !GBKEY || out[k].px)) { if (out[k].img) found++; continue; }
  const T = cleanT(b.titre), L = lastName(b.auteur), nT = norm(T), m = out[k] || {};
  const score = v => { const vi = v.volumeInfo || {}, t = norm(vi.title); return (t === nT ? 6 : t.includes(nT) || nT.includes(t) ? 3 : 0) + (vi.language === "fr" ? 4 : 0) + (vi.imageLinks ? 3 : 0) + (vi.description ? 1 : 0) + (L && (vi.authors || []).join(" ").toLowerCase().includes(L.toLowerCase()) ? 2 : 0); };
  const qA = `intitle:"${T}"` + (L ? ` inauthor:"${L}"` : "");
  let ok = !!GBKEY;
  const o = await ol(T, L, nT); if (o) { for (const x of ["img", "desc", "ia", "link"]) if (o[x] && !m[x]) m[x] = o[x]; }
  if (GBKEY) { let all = [];
    for (const [q, x] of [[qA, "&langRestrict=fr"], [qA, ""]]) { const it = await gb(q, x); if (it === null) { ok = false; break; } all = all.concat(it); if (it.some(v => score(v) >= 7)) break; }
    all.sort((x, y) => score(y) - score(x)); const v = all.find(x => x.volumeInfo.imageLinks && score(x) >= 3) || all.find(x => score(x) >= 3);
    if (v) { const vi = v.volumeInfo; if (!m.img && vi.imageLinks) m.img = (vi.imageLinks.thumbnail || vi.imageLinks.smallThumbnail).replace("http:", "https:").replace("&edge=curl", "");
      const d = [v, ...all].find(x => x.volumeInfo.description && score(x) >= 3); if (d) m.desc = d.volumeInfo.description.replace(/<[^>]+>/g, " ").slice(0, 1600); m.glink = vi.previewLink || vi.infoLink; }
    let pv = all.find(x => (x.accessInfo || {}).embeddable && ["PARTIAL", "ALL_PAGES"].includes(x.accessInfo.viewability) && score(x) >= 3);
    if (!pv && ok) { const it2 = await gb(qA, "&filter=partial"); if (it2) pv = it2.filter(x => score(x) >= 3).sort((x, y) => score(y) - score(x))[0]; else ok = false; }
    if (pv) { if ((pv.accessInfo || {}).embeddable) m.eid = pv.id; m.read = (pv.accessInfo || {}).webReaderLink || pv.volumeInfo.previewLink; } }
  m.olt = 1;
  if (ok) m.px = 1;
  out[k] = m;
  done++; if (m.img) found++;
  console.log(`${m.img ? "✔" : "✘"} ${b.titre} — ${b.auteur}`);
  if (done % 20 === 0) fs.writeFileSync("covers.json", JSON.stringify(out));
}
fs.writeFileSync("covers.json", JSON.stringify(out));
console.log(`\nLivres : ${books.length} · avec couverture : ${found} · appels Google : ${gbCalls} (échecs : ${gbFail})`);
