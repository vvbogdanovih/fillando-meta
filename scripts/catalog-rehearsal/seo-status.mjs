// D08 §3.10: HTTP statuses, redirects, robots and canonical of the storefront against the SEO matrix
// (TD-0013), for an ordinary browser and for Googlebot. Prints PASS/FAIL; exit code 1 on any FAIL.
// Usage: node seo-status.mjs <storefront-origin>      e.g. https://fillando.com   (read-only GETs)
import { storefrontSitemapUrls } from './sitemap-export.mjs'
const [origin] = process.argv.slice(2)
if (!origin) {
	console.error('usage: node seo-status.mjs <storefront-origin>')
	process.exit(1)
}
const AGENTS = {
	browser: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
	googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
}
let failed = 0
const check = (name, ok, detail = '') => {
	if (!ok) failed++
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const get = async (path, agent) => {
	const r = await fetch(origin + path, { redirect: 'manual', headers: { 'User-Agent': AGENTS[agent] } })
	const html = r.status === 200 ? await r.text() : ''
	const meta = name => html.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`))?.[1] ?? null
	const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/)?.[1] ?? null
	const location = r.headers.get('location')
	return {
		status: r.status,
		html,
		robots: meta('robots'),
		canonical: canonical ? new URL(canonical).pathname + new URL(canonical).search : null,
		location: location ? new URL(location, origin).pathname + new URL(location, origin).search : null
	}
}

// One product and the landings from the storefront's own sitemap (followed into its files when
// /sitemap.xml is a sitemap index — more than one backend part).
const urls = (await storefrontSitemapUrls(origin)).map(loc => new URL(loc).pathname)
const products = urls.filter(p => p.startsWith('/products/'))
const landings = urls.filter(p => /^\/filament\/[^/]+$/.test(p))
check('sitemap: products, landings, /filament, /catalog', products.length > 0 && landings.length > 0 && urls.includes('/filament') && urls.includes('/catalog'),
	`${urls.length} URLs: ${products.length} products, ${landings.length} landings`)
const product = products[0]

for (const agent of Object.keys(AGENTS)) {
	console.log(`\n# ${agent}`)
	for (const path of ['/', '/catalog', '/filament', '/filament/pla', '/filament?page=2', product]) {
		const r = await get(path, agent)
		const selfCanonical = path === '/' ? true : r.canonical === path
		check(`${path} → 200, self-canonical, indexable`, r.status === 200 && selfCanonical && !/noindex/.test(r.robots ?? ''),
			`${r.status}, canonical ${r.canonical}, robots ${r.robots}`)
	}
	// An advertising click: Google Ads adds `gad_source` and `gad_campaignid` beside `gclid`. The page
	// is the clean one — 200, indexable, canonical without the parameters — never a 404 (audit 14.11.2026).
	for (const path of ['/filament', '/filament/pla', '/catalog']) {
		const r = await get(`${path}?gclid=probe&gad_source=1&gad_campaignid=1&utm_source=google`, agent)
		check(`${path}?gclid&gad_source&gad_campaignid&utm_source → 200, canonical ${path}, indexable`, r.status === 200 && r.canonical === path && !/noindex/.test(r.robots ?? ''),
			`${r.status}, canonical ${r.canonical}, robots ${r.robots}`)
	}
	for (const [path, target] of [
		['/filament?page=1', '/filament'],
		['/filament?polymer=PLA', '/filament/pla'],
		['/filament?f.polymer=PLA', '/filament/pla'],
		['/filament?color_family=black', '/filament?color=black']
	]) {
		const r = await get(path, agent)
		check(`${path} → 308 ${target}`, r.status === 308 && r.location === target, `${r.status} ${r.location}`)
	}
	const filtered = await get('/filament?color=black', agent)
	check('/filament?color=black → 200 noindex, follow, no canonical', filtered.status === 200 && /noindex/.test(filtered.robots ?? '') && /follow/.test(filtered.robots ?? '') && filtered.canonical === null,
		`${filtered.status}, robots ${filtered.robots}, canonical ${filtered.canonical}`)
	for (const path of ['/filament?color=plaid', '/filament?bogus=1', '/filament?page=99', '/filament/nope', '/no-such-section-r01', '/products/no-such-product-r01']) {
		const r = await get(path, agent)
		check(`${path} → 404`, r.status === 404, String(r.status))
	}
	const page = await get(product, agent)
	const ld = [...page.html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
	check(`${product}: Product/ProductGroup JSON-LD with brand and offer`, /"@type":"(Product|ProductGroup)"/.test(ld) && /"brand"/.test(ld) && /"offers"/.test(ld))
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
