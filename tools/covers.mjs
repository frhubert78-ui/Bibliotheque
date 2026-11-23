// Recherche des couvertures, résumés et extraits pour tous les livres de l'appli.
// Lancé automatiquement par GitHub Actions ; écrit covers.json à la racine.
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
let gbCalls = 0, gbFail = 0;
async function gb(q, extra = "") {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books${extra}`;
  for (let a = 0; a < 4; a++) {
    gbCalls++; await sleep(1200);
    try { const r = await fetch(url); if (r.status === 429 || r.status >= 500) { console.log("  Google", r.status, "pause"); await sleep(30000 * (a + 1)); continue; }
      const j = await r.json(); return j.items || []; } catch (e) { await sleep(5000); }
  }
  gbFail++; return null;
}
async function ol(T, L) {
  try { await sleep(800); const r = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(T)}${L ? "&author=" + encodeURIComponent(L) : ""}&limit=10&fields=cover_i,language`).then(x => x.json());
    const d = (r.docs || []).find(x => x.cover_i && (x.language || []).includes("fre")) || (r.docs || []).find(x => x.cover_i);
    return d ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null; } catch (e) { return null; }
}
let done = 0, found = 0;
for (const b of books) {
  const k = key(b); if (out[k] && out[k].img && out[k].px) { found++; continue; }
  const T = cleanT(b.titre), L = lastName(b.auteur), nT = norm(T), m = out[k] || {};
  const score = v => { const vi = v.volumeInfo || {}, t = norm(vi.title); return (t === nT ? 6 : t.includes(nT) || nT.includes(t) ? 3 : 0) + (vi.language === "fr" ? 4 : 0) + (vi.imageLinks ? 3 : 0) + (vi.description ? 1 : 0) + (L && (vi.authors || []).join(" ").toLowerCase().includes(L.toLowerCase()) ? 2 : 0); };
  const qA = `intitle:"${T}"` + (L ? ` inauthor:"${L}"` : "");
  let all = [], ok = true;
  for (const [q, x] of [[qA, "&langRestrict=fr"], [qA, ""], [T + (L ? " " + L : ""), ""]]) {
    const it = await gb(q, x); if (it === null) { ok = false; break; } all = all.concat(it);
    if (it.some(v => v.volumeInfo.imageLinks && score(v) >= 7)) break;
  }
  all.sort((x, y) => score(y) - score(x));
  const v = all.find(x => x.volumeInfo.imageLinks && score(x) >= 3) || all.find(x => score(x) >= 3);
  if (v) { const vi = v.volumeInfo;
    if (vi.imageLinks) m.img = (vi.imageLinks.thumbnail || vi.imageLinks.smallThumbnail).replace("http:", "https:").replace("&edge=curl", "");
    m.link = vi.previewLink || vi.infoLink; const d = [v, ...all].find(x => x.volumeInfo.description && score(x) >= 3); if (d) m.desc = d.volumeInfo.description.replace(/<[^>]+>/g, " ").slice(0, 1600); }
  let pv = all.find(x => (x.accessInfo || {}).embeddable && ["PARTIAL", "ALL_PAGES"].includes(x.accessInfo.viewability) && score(x) >= 3);
  if (!pv && ok) { const it2 = await gb(qA, "&filter=partial"); if (it2) pv = it2.filter(x => score(x) >= 3).sort((x, y) => score(y) - score(x))[0]; else ok = false; }
  if (pv) { if ((pv.accessInfo || {}).embeddable) m.eid = pv.id; m.read = (pv.accessInfo || {}).webReaderLink || pv.volumeInfo.previewLink; }
  if (!m.img) m.img = await ol(T, L);
  if (ok) m.px = 1;
  if (m.img || m.desc || ok) out[k] = m;
  done++; if (m.img) found++;
  console.log(`${m.img ? "✔" : "✘"} ${b.titre} — ${b.auteur}`);
  if (done % 20 === 0) fs.writeFileSync("covers.json", JSON.stringify(out));
}
fs.writeFileSync("covers.json", JSON.stringify(out));
console.log(`\nLivres : ${books.length} · avec couverture : ${found} · appels Google : ${gbCalls} (échecs : ${gbFail})`);
