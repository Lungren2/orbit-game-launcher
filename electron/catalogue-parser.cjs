const { parseDocument, DomUtils } = require('htmlparser2');
const ORIGIN = 'https://playzip.com';
const hasClass = (node, name) => (node.attribs?.class || '').split(/\s+/).includes(name);

function safeCover(source) {
  try {
    const url = new URL(source, ORIGIN);
    if (source && url.protocol === 'https:' && !url.username && !url.password && (url.hostname.endsWith('.steamstatic.com') || url.hostname === 'playzip.com')) return url.href;
  } catch {}
  return null;
}

function parseCataloguePage({html,url}, requestedPage = 1) {
  const document = parseDocument(html, { decodeEntities:true });
  const content = DomUtils.findOne(node => hasClass(node,'games_content'),document.children,true);
  if (!content) throw new Error('The PlayZip catalogue format has changed.');
  const cards = DomUtils.findAll(node => node.name === 'a' && hasClass(node,'game_item'),content.children);
  const games = [], seen = new Set();
  for (const card of cards) {
    const id = /^\/game\/([1-9]\d*)\/?$/.exec(card.attribs.href || '')?.[1];
    const image = DomUtils.findOne(node => node.name === 'img',card.children,true);
    const name = image?.attribs.alt?.trim();
    if (!id || !Number.isSafeInteger(Number(id)) || !name || name.length>500 || seen.has(id)) continue;
    const coverUrl = safeCover(image.attribs['data-src'] || image.attribs.src);
    games.push({id,name,coverUrl,steamAppId:Number(/\/steam\/apps\/(\d+)\//.exec(coverUrl || '')?.[1]) || null,url:`${ORIGIN}/game/${id}`});
    seen.add(id);
  }
  if (cards.length && !games.length) throw new Error('The PlayZip catalogue format has changed.');
  const pagination = DomUtils.findOne(node => hasClass(node,'pagination'),document.children,true);
  const first = pagination && DomUtils.findOne(node => node.name === 'a',pagination.children,true);
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(first ? DomUtils.textContent(first).trim() : '');
  const page = match ? Number(match[1]) : requestedPage, totalPages = match ? Number(match[2]) : 1;
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(totalPages) || page<1 || totalPages<1 || totalPages>1000 || page>totalPages)
    throw new Error('PlayZip returned invalid pagination.');
  if (page !== Math.min(requestedPage,totalPages)) throw new Error('PlayZip returned the wrong catalogue page.');
  return {games,page,totalPages,url};
}
module.exports = { parseCataloguePage, safeCover };
