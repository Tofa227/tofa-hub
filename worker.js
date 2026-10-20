// TOFA Life Hub — прокси для «цена и фото по ссылке».
// Cloudflare Worker: Workers & Pages → Create → Worker → Edit code → вставить этот файл → Deploy.
// Открывает страницу магазина и возвращает { title, image, price, currency }.
// Отвечает только приложению (ALLOWED), чтобы чужие сайты не пользовались прокси.

const ALLOWED = ['https://tofa227.github.io'];
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0], 'Content-Type': 'application/json; charset=utf-8', 'Vary': 'Origin' };
    const out = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cors });
    if (origin && !ALLOWED.includes(origin)) return out({ error: 'forbidden' }, 403);
    const url = new URL(req.url).searchParams.get('url') || '';
    if (!/^https?:\/\/[^/]+\.[^/]+/.test(url)) return out({ error: 'bad url' }, 400);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'hu,en;q=0.8,ru;q=0.6' }, redirect: 'follow', cf: { cacheTtl: 3600 } });
      const html = (await r.text()).slice(0, 2_000_000);
      const meta = parseMeta(html, r.url || url);
      // Shopify-магазины (в т.ч. store.bambulab.com): точная цена из /products/<handle>.js
      if (!meta.price && /\/products\/[^/?#]+/.test(r.url || url)) {
        try {
          const u = new URL(r.url || url), v = u.searchParams.get('variant'); u.search = ''; u.hash = '';
          const j = await (await fetch(u.toString().replace(/\/$/, '') + '.js', { headers: { 'User-Agent': UA } })).json();
          const vr = (j.variants || []).find(x => String(x.id) === v) || j.variants?.[0];
          if (vr) meta.price = vr.price / 100;
          meta.title ||= j.title; meta.image ||= j.featured_image && (j.featured_image.startsWith('//') ? 'https:' + j.featured_image : j.featured_image);
        } catch (e) {}
      }
      return out(meta);
    } catch (e) { return out({ error: 'fetch failed' }, 502); }
  },
};

export function parseMeta(html, base) {
  const dec = s => s && s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  const metaTag = name => {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*>`, 'i'), m = html.match(re);
    if (!m) return '';
    const c = m[0].match(/content=["']([^"']*)["']/i); return c ? dec(c[1]) : '';
  };
  const res = { title: '', image: '', price: 0, currency: '' };
  // 1) JSON-LD Product
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(m[1].trim()); } catch (e) { continue; }
    const stack = [data];
    while (stack.length) {
      const o = stack.pop(); if (!o || typeof o !== 'object') continue;
      if (Array.isArray(o)) { stack.push(...o); continue; }
      if (o['@graph']) stack.push(o['@graph']);
      const t = [].concat(o['@type'] || []);
      if (t.includes('Product') || t.includes('ProductGroup')) {
        res.title ||= dec(o.name || '');
        const img = [].concat(o.image || [])[0]; res.image ||= typeof img === 'string' ? img : img?.url || '';
        let offers = [].concat(o.offers || []);
        if (!offers.length && o.hasVariant) offers = [].concat(o.hasVariant).flatMap(v => [].concat(v.offers || []));
        for (const of of offers) {
          const p = parseFloat(String(of.price ?? of.lowPrice ?? of.priceSpecification?.price ?? '').replace(',', '.'));
          if (p > 0) { res.price ||= p; res.currency ||= of.priceCurrency || of.priceSpecification?.priceCurrency || ''; break; }
        }
      }
    }
  }
  // 2) OpenGraph / microdata
  res.title ||= metaTag('og:title') || dec((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '');
  res.image ||= metaTag('og:image') || metaTag('og:image:secure_url') || metaTag('twitter:image');
  if (!res.price) {
    const p = metaTag('product:price:amount') || metaTag('og:price:amount') || metaTag('price')
      || (html.match(/itemprop=["']price["'][^>]*content=["']([\d.,\s]+)["']/i) || [])[1] || '';
    const v = parseFloat(p.replace(/\s/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, ''));
    if (v > 0) res.price = v;
    res.currency ||= metaTag('product:price:currency') || metaTag('og:price:currency') || metaTag('priceCurrency');
  }
  if (res.image && !/^https?:/.test(res.image)) { try { res.image = new URL(res.image, base).toString(); } catch (e) {} }
  return res;
}
