const { test } = require('node:test');
const assert = require('node:assert/strict');
const { catalogueUrl, fetchCatalogue } = require('../electron/catalogue.cjs');

test('catalogue requests use the fixed origin and encoded filters', () => {
  const url = new URL(catalogueUrl({ page: 2, keywords: 'A&B / 雪', category: 'indie', sort: 'latest' }));
  assert.equal(url.origin, 'https://playzip.com');
  assert.equal(url.pathname, '/category/indie');
  assert.equal(url.searchParams.get('keywords'), 'A&B / 雪');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('l'), 'english');
  for (const options of [{ page: 0 }, { page: 1.5 }, { page: '2' }, { category: '../admin' }, { sort: 'bad' }, { keywords: 'x'.repeat(201) }, null]) assert.throws(() => catalogueUrl(options));
});

test('coalesces concurrent requests and reuses successful pages', async () => {
  let calls = 0;
  const fetch = async (url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Accept, 'text/html');
    return new Response('<div class="games_content">Game 雪</div>', { headers: { 'content-type': 'text/html' } });
  };
  const options = { keywords: 'cache-test' };
  const [a, b] = await Promise.all([fetchCatalogue(options, fetch), fetchCatalogue(options, fetch)]);
  assert.equal(a.html, '<div class="games_content">Game 雪</div>');
  assert.deepEqual(a, b);
  assert.deepEqual(a, await fetchCatalogue(options, fetch));
  assert.equal(calls, 1);
});

test('rejects HTTP failures, non-HTML, challenge pages, and oversized responses', async () => {
  const cases = [
    [new Response('Blocked', { status: 403 }), /403/],
    [new Response('{}', { headers: { 'content-type': 'application/json' } }), /unexpected response/],
    [new Response('<h1>Verify you are human</h1>', { headers: { 'content-type': 'text/html' } }), /unavailable/],
    [new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } }), /oversized/],
  ];
  for (const [i, [response, error]] of cases.entries()) await assert.rejects(fetchCatalogue({ keywords: `failure-${i}` }, async () => response), error);
});

test('failed requests can be retried', async () => {
  const options = { keywords: 'retry-test' };
  await assert.rejects(fetchCatalogue(options, async () => { throw new Error('Offline'); }), /Offline/);
  const result = await fetchCatalogue(options, async () => new Response('<div class="games_content"></div>', { headers: { 'content-type': 'text/html' } }));
  assert.ok(result.html.includes('games_content'));
});
