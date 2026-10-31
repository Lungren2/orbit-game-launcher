const ORIGIN = 'https://playzip.com';
const CATEGORIES = ['all', 'shooting', 'casual', 'action', 'sports_racing', 'adventure', 'simulation', 'r18', 'rpg', 'strategy', 'fighting', 'horror', 'rts', 'card', 'indie', 'lan'];
const cache = new Map();
const pending = new Map();

function catalogueUrl(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid catalogue options.');
  const { page = 1, keywords = '', category = 'all', sort = 'views' } = options;
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error('Invalid catalogue page.');
  if (typeof keywords !== 'string' || keywords.length > 200) throw new Error('Search must be 200 characters or fewer.');
  if (!CATEGORIES.includes(category) || !['views', 'latest'].includes(sort)) throw new Error('Invalid catalogue filter.');
  const url = new URL(category === 'all' ? '/' : `/category/${category}`, ORIGIN);
  url.search = new URLSearchParams({ page: String(page), sort, l: 'english', ...(keywords.trim() ? { keywords: keywords.trim() } : {}) }).toString();
  return url.href;
}

async function readCatalogue(url, fetchPage, signal) {
  const response = await fetchPage(url, {
    headers: { Accept: 'text/html', 'User-Agent': 'Orbit-Catalogue/1.0' },
    redirect: 'error', signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`PlayZip returned ${response.status}. Try again shortly.`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('PlayZip returned an unexpected response.');
  let html = '';
  let size = 0;
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 2 * 1024 * 1024) throw new Error('PlayZip returned an oversized page.');
    html += decoder.decode(chunk, { stream: true });
  }
  html += decoder.decode();
  if (!html.includes('games_content')) throw new Error('PlayZip catalogue is unavailable. Try again shortly.');
  return { html, url };
}

async function fetchCatalogue(options, fetchPage = fetch) {
  const url = catalogueUrl(options);
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.data;
  if (pending.has(url)) return pending.get(url);
  const task = readCatalogue(url, fetchPage).then(data => {
    if (cache.size >= 32) cache.delete(cache.keys().next().value);
    cache.set(url, { data, expires: Date.now() + 5 * 60 * 1000 });
    return data;
  }).finally(() => pending.delete(url));
  pending.set(url, task);
  return task;
}
module.exports = { catalogueUrl, fetchCatalogue, readCatalogue, CATEGORIES };
