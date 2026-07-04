import { describe, expect, it } from "vitest";
import { normListUrl, parseFilmPage, parseListPage } from "../src/lib/letterboxd";

describe("normListUrl", () => {
  it("normalise une URL de liste standard", () => {
    expect(normListUrl("https://letterboxd.com/official/list/letterboxds-top-500-films/"))
      .toBe("https://letterboxd.com/official/list/letterboxds-top-500-films/");
  });

  it("accepte les variantes (http, sans slash final, page, query)", () => {
    expect(normListUrl("http://letterboxd.com/dave/list/mon-top"))
      .toBe("https://letterboxd.com/dave/list/mon-top/");
    expect(normListUrl("https://letterboxd.com/dave/list/mon-top/page/3/"))
      .toBe("https://letterboxd.com/dave/list/mon-top/");
    expect(normListUrl("  https://letterboxd.com/dave/list/mon-top/?share=x  "))
      .toBe("https://letterboxd.com/dave/list/mon-top/");
  });

  it("rejette ce qui n'est pas une liste letterboxd", () => {
    expect(normListUrl("https://letterboxd.com/film/parasite/")).toBeNull();
    expect(normListUrl("https://exemple.com/official/list/x/")).toBeNull();
    expect(normListUrl("n'importe quoi")).toBeNull();
  });
});

describe("parseListPage", () => {
  const html = `<html><head>
    <meta property="og:title" content="Ma Liste Culte, a list of films by Dave • Letterboxd">
    </head><body>
    <div class="paginate-pages"><li class="paginate-page">1</li><li class="paginate-page">4</li></div>
    <div data-item-slug="harakiri" data-item-name="Harakiri (1962)" data-list-index="0"></div>
    <div data-item-slug="parasite" data-item-name="Parasite (2019)" data-list-index="1"></div>
    <div data-item-slug="sans-annee" data-item-name="Film Sans Année" data-list-index="2"></div>
    </body></html>`;

  it("extrait titre, pagination et films (titre/année/rang)", () => {
    const p = parseListPage(html, 0);
    expect(p.title).toBe("Ma Liste Culte");
    expect(p.totalPages).toBe(4);
    expect(p.entries).toHaveLength(3);
    expect(p.entries[0]).toMatchObject({ rank: 1, title: "Harakiri", year: 1962, slug: "harakiri" });
    expect(p.entries[1]).toMatchObject({ rank: 2, title: "Parasite", year: 2019 });
    expect(p.entries[2]).toMatchObject({ rank: 3, title: "Film Sans Année", year: null });
    expect(p.entries[0].url).toBe("https://letterboxd.com/film/harakiri/");
  });

  it("numérote à partir de startIndex quand data-list-index manque", () => {
    const noIdx = `<div data-item-slug="a" data-item-name="A (2000)"></div>`;
    const p = parseListPage(noIdx, 100);
    expect(p.entries[0].rank).toBe(101);
  });
});

describe("parseFilmPage", () => {
  const html = `<html><head>
    <meta property="og:title" content="Interstellar (2014)">
    <meta property="og:image" content="https://a.ltrbxd.com/resized/sm/crop-paysage.jpg">
    <script type="application/ld+json">/* <![CDATA[ */
    {"image":"https://a.ltrbxd.com/resized/film-poster/interstellar-0-600-0-900-crop.jpg","@type":"Movie",
     "director":[{"@type":"Person","name":"Christopher Nolan"}]}
    /* ]]> */</script>
    </head><body></body></html>`;

  it("préfère l'affiche portrait du JSON-LD et extrait réalisateur + année", () => {
    const m = parseFilmPage(html);
    expect(m.poster).toContain("film-poster");
    expect(m.director).toBe("Christopher Nolan");
    expect(m.year).toBe(2014);
  });

  it("retombe sur og:image sans JSON-LD et joint deux réalisateurs", () => {
    const html2 = `<html><head>
      <meta property="og:title" content="City of God (2002)">
      <meta property="og:image" content="https://a.ltrbxd.com/og.jpg">
      <script type="application/ld+json">{"@type":"Movie","director":[
        {"@type":"Person","name":"Fernando Meirelles"},{"@type":"Person","name":"Kátia Lund"},
        {"@type":"Person","name":"Un Troisième"}]}</script>
      </head></html>`;
    const m = parseFilmPage(html2);
    expect(m.director).toBe("Fernando Meirelles & Kátia Lund"); // deux max
    const m2 = parseFilmPage(`<meta property="og:image" content="https://a.ltrbxd.com/og.jpg">`);
    expect(m2.poster).toBe("https://a.ltrbxd.com/og.jpg");
    expect(m2.director).toBeNull();
  });
});
