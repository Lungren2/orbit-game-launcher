const LIBRARY_PAGE_SIZE = 100;

function validateCollection(collection) {
  if (collection === undefined) return;
  if (!collection || typeof collection !== 'object' || Array.isArray(collection) ||
      !Number.isInteger(collection.prefixCount) || collection.prefixCount < 0 || collection.prefixCount > 50000 ||
      !['playzipIds', 'steamIds'].every(key => Array.isArray(collection[key]) && collection[key].length <= 50000 &&
        collection[key].every(id => typeof id === 'string' && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))))) {
    throw new Error('Invalid library pagination.');
  }
}

// Installed games and active transfers occupy the first slots in the same
// pages as the catalogue. Remove their catalogue copies before slicing.
function catalogueWindow(games, {page = 1, collection} = {}) {
  validateCollection(collection);
  const pageSize = collection ? LIBRARY_PAGE_SIZE : 30;
  const prefixCount = collection?.prefixCount || 0;
  if (collection) {
    const playzipIds = new Set(collection.playzipIds), steamIds = new Set(collection.steamIds);
    games = games.filter(game => !playzipIds.has(game.id) && !steamIds.has(String(game.steamAppId)));
  }
  const totalGames = prefixCount + games.length;
  const totalPages = Math.max(1, Math.ceil(totalGames / pageSize));
  page = Math.min(page, totalPages);
  const start = (page - 1) * pageSize, end = page * pageSize;
  return {
    games: games.slice(Math.max(0, start - prefixCount), Math.max(0, end - prefixCount)),
    page, totalPages, totalGames,
    ...(collection ? {collection: true, prefixStart: Math.min(start, prefixCount), prefixEnd: Math.min(end, prefixCount)} : {}),
  };
}

module.exports = {catalogueWindow, validateCollection};
