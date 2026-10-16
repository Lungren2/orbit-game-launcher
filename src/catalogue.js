const ORIGIN = "https://playzip.com";
const genres = [
  ["all", "All genres"],
  ["action", "Action"],
  ["adventure", "Adventure"],
  ["casual", "Casual"],
  ["indie", "Indie"],
  ["rpg", "RPG"],
  ["simulation", "Simulation"],
  ["strategy", "Strategy"],
  ["shooting", "Shooting"],
  ["sports_racing", "Sports & racing"],
  ["fighting", "Fighting"],
  ["horror", "Horror"],
  ["rts", "RTS"],
  ["card", "Card"],
  ["lan", "LAN"],
  ["r18", "R18"],
];

export function parseCatalogue({ html, url }, requestedPage) {
  // Inert parsing only. Remote HTML and scripts are never inserted into Orbit.
  const document = new DOMParser().parseFromString(html, "text/html");
  if (!document.querySelector(".games_content"))
    throw new Error("The PlayZip catalogue format has changed.");
  const games = [];
  const seen = new Set();
  for (const card of document.querySelectorAll("a.game_item")) {
    const id = /^\/game\/(\d+)\/?$/.exec(card.getAttribute("href") || "")?.[1];
    const image = card.querySelector("img");
    const name = image?.getAttribute("alt")?.trim();
    if (!id || !name || seen.has(id)) continue;
    let coverUrl = null;
    try {
      const cover = new URL(
        image.getAttribute("data-src") || image.getAttribute("src"),
        ORIGIN,
      );
      if (
        cover.protocol === "https:" &&
        (cover.hostname.endsWith(".steamstatic.com") ||
          cover.hostname === "playzip.com")
      )
        coverUrl = cover.href;
    } catch {}
    games.push({ id, name, coverUrl, steamAppId: Number(/\/steam\/apps\/(\d+)\//.exec(coverUrl || '')?.[1]) || null, url: `${ORIGIN}/game/${id}` });
    seen.add(id);
  }
  const pagination = /^(\d+)\s*\/\s*(\d+)$/.exec(
    document.querySelector(".pagination a")?.textContent.trim() || "",
  );
  const page = pagination ? Number(pagination[1]) : requestedPage;
  const totalPages = pagination ? Number(pagination[2]) : 1;
  if (
    !Number.isSafeInteger(totalPages) ||
    totalPages < 1 ||
    totalPages > 10000 ||
    page < 1 ||
    page > totalPages
  )
    throw new Error("PlayZip returned invalid pagination.");
  if (!games.length && document.querySelector("a.game_item"))
    throw new Error("The PlayZip catalogue format has changed.");
  return { games, page, totalPages, url };
}

export function createCatalogue({ request, icon, esc, openGame }) {
  let options = { page: 1, keywords: "", category: "all", sort: "views" };
  let result = null,
    busy = false,
    error = "",
    sequence = 0;
  let target;
  const active = () =>
    target?.isConnected && document.body.dataset.view === "catalogue";

  function draw(focus) {
    if (!active()) return;
    target.innerHTML = `<section class="catalogue-view" aria-label="PlayZip catalogue">
      <div class="catalogue-toolbar">
        <span class="catalogue-source">PlayZip</span>
        <div class="catalogue-filters">
          <select id="catalogue-genre" aria-label="Catalogue genre">${genres.map(([value, label]) => `<option value="${value}" ${options.category === value ? "selected" : ""}>${label}</option>`).join("")}</select>
          <select id="catalogue-sort" aria-label="Catalogue order"><option value="views" ${options.sort === "views" ? "selected" : ""}>Popular</option><option value="latest" ${options.sort === "latest" ? "selected" : ""}>Latest</option></select>
        </div>
        <form class="search-field catalogue-search" role="search" id="catalogue-search-form">${icon("search")}<input id="catalogue-search" name="keywords" type="search" aria-label="Search PlayZip" placeholder="Search PlayZip" maxlength="200" value="${esc(options.keywords)}"><button type="submit" class="icon-button" aria-label="Submit catalogue search">${icon("chevron")}</button></form>
      </div>
      <div class="catalogue-results" aria-live="polite" aria-busy="${busy}">
      ${busy ? `<div class="catalogue-grid skeleton-grid" aria-label="Loading catalogue">${Array.from({ length: 12 }, () => '<div class="catalogue-skeleton"></div>').join("")}</div>` : error ? `<div class="catalogue-message"><p>${esc(error)}</p><button class="pill" id="catalogue-retry">${icon("refresh")} Retry</button></div>` : !result?.games.length ? '<div class="catalogue-message">No games found</div>' : `<div class="catalogue-grid">${result.games.map((game) => `<button class="catalogue-card" data-catalogue-id="${game.id}" aria-label="${esc(game.name)}" title="${esc(game.name)}"><div class="catalogue-cover">${game.coverUrl ? `<img src="${esc(game.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="fallback-name">${esc(game.name)}</span><span class="catalogue-open">${icon("chevron")}</span></div><span class="catalogue-title">${esc(game.name)}</span></button>`).join("")}</div>`}
      </div>
      <form class="catalogue-pagination" id="catalogue-page-form" aria-label="Catalogue pagination">
        <button class="icon-button previous-page" type="button" id="catalogue-prev" aria-label="Previous catalogue page" ${busy || options.page <= 1 || error ? "disabled" : ""}>${icon("chevron")}</button>
        <label class="catalogue-page-label"><span class="sr-only">Page</span><input id="catalogue-page" aria-label="Catalogue page" type="number" min="1" max="${result?.totalPages || 1}" value="${options.page}" ${busy || error || !result?.games.length ? "disabled" : ""}><span>/ ${result?.totalPages || 1}</span></label>
        <button class="icon-button" type="button" id="catalogue-next" aria-label="Next catalogue page" ${busy || !result || options.page >= result.totalPages || error ? "disabled" : ""}>${icon("chevron")}</button>
      </form>
    </section>`;
    target.querySelector("#catalogue-genre").onchange = (event) =>
      change({ category: event.target.value, page: 1 }, "catalogue-genre");
    target.querySelector("#catalogue-sort").onchange = (event) =>
      change({ sort: event.target.value, page: 1 }, "catalogue-sort");
    target.querySelector("#catalogue-search-form").onsubmit = (event) => {
      event.preventDefault();
      change(
        {
          keywords: target.querySelector("#catalogue-search").value.trim(),
          page: 1,
        },
        "catalogue-search",
      );
    };
    target.querySelector("#catalogue-search").oninput = (event) => {
      if (!event.target.value && options.keywords)
        change({ keywords: "", page: 1 }, "catalogue-search");
    };
    target.querySelector("#catalogue-prev").onclick = () =>
      change({ page: options.page - 1 }, "catalogue-prev");
    target.querySelector("#catalogue-next").onclick = () =>
      change({ page: options.page + 1 }, "catalogue-next");
    target.querySelector("#catalogue-page-form").onsubmit = (event) => {
      event.preventDefault();
      const page = Number(target.querySelector("#catalogue-page").value);
      if (Number.isInteger(page) && page >= 1 && page <= result.totalPages)
        change({ page }, "catalogue-page");
    };
    target
      .querySelector("#catalogue-retry")
      ?.addEventListener("click", () => fetchPage());
    target
      .querySelectorAll("[data-catalogue-id]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            openGame(
              result.games.find(
                (game) => game.id === button.dataset.catalogueId,
              ),
            )),
      );
    if (focus)
      target.querySelector(`#${focus}`)?.focus({ preventScroll: true });
  }

  async function fetchPage(focus) {
    const version = ++sequence;
    busy = true;
    error = "";
    draw(focus);
    try {
      const data = await request({ ...options });
      if (version !== sequence) return;
      result = parseCatalogue(data, options.page);
      options.page = result.page;
    } catch (failure) {
      if (version !== sequence) return;
      error =
        failure.name === "TimeoutError"
          ? "PlayZip took too long to respond."
          : failure.message;
    } finally {
      if (version === sequence) {
        busy = false;
        draw(focus);
      }
    }
  }
  function change(patch, focus) {
    options = { ...options, ...patch };
    fetchPage(focus);
  }
  return {
    mount(element) {
      target = element;
      draw();
      if (!result && !busy) fetchPage();
    },
    focusSearch() {
      target?.querySelector("#catalogue-search")?.focus();
    },
  };
}
