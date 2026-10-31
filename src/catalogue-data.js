const ORIGIN = "https://playzip.com";
export const genres = [
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

export function parseCatalogue(data, requestedPage) {
  const {html,url}=data;
  if(Array.isArray(data.games)) {
    if(!Number.isInteger(data.page) || !Number.isInteger(data.totalPages) || data.page<1 || data.totalPages<data.page || data.totalPages>10000 || data.games.length>2000)throw new Error('Invalid cached catalogue page.');
    const games=data.games.filter(game=>/^[1-9]\d*$/.test(game.id) && typeof game.name==='string' && game.name.length>0 && game.url===`${ORIGIN}/game/${game.id}`);
    if(games.length!==data.games.length)throw new Error('Invalid cached catalogue game.');
    return {...data,games};
  }
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
      const source = image.getAttribute("data-src") || image.getAttribute("src");
      if (!source?.trim()) throw new Error('No cover');
      const cover = new URL(
        source,
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

