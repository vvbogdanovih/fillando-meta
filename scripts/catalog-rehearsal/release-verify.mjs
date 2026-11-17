// Storefront-side state that D08 §3.7 / §3.10 compares before and after the filament migration:
// the legacy and typed listings, every landing, the catalogue sitemap export and the refill card.
// Usage: INTERNAL_API_TOKEN=… node release-verify.mjs <api> <out.json>   (read-only, no credentials)
import fs from 'node:fs'
import { readCatalogSitemap } from './sitemap-export.mjs'
const [base, out] = process.argv.slice(2)
if (!base || !out) {
	console.error('usage: node release-verify.mjs <api> <out.json>')
	process.exit(1)
}
const H = { 'X-Internal-Token': process.env.INTERNAL_API_TOKEN ?? '' }
const get = async path => {
	const r = await fetch(base + path, { headers: H })
	const json = r.headers.get('content-type')?.includes('json')
	return { status: r.status, body: json ? await r.json() : await r.text() }
}
const result = {}
// Every visible product category from the paged select list (the set of the legacy GET /categories,
// without its definitions — Plan-0010 D06); the walk restarts on a revision conflict.
const options = []
for (let cursor = null, pages = 0; pages === 0 || cursor; pages++) {
	const page = await get(`/categories/options?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
	if (page.status !== 200) throw new Error(`GET /categories/options: ${page.status}`)
	options.push(...page.body.items)
	cursor = page.body.next_cursor
}
const filament = options.find(c => c.slug === 'filament')
if (!filament) throw new Error('no filament category in GET /categories/options')
const F = filament._id
result.categories = options.map(c => ({ slug: c.slug, name: c.name })).sort((a, b) => a.slug.localeCompare(b.slug))

const legacy = await get(`/products/catalog?category_id=${F}&limit=1`)
result.legacy_catalog = { status: legacy.status, total: legacy.body?.total ?? legacy.body?.pagination?.total ?? null, code: legacy.body?.details?.code ?? null }
const typed = await get(`/products/catalog/v2?category_id=${F}&limit=1`)
result.v2_catalog = {
	status: typed.status,
	total: typed.body?.total ?? null,
	colour_families: typed.body?.facets?.colors?.length ?? null,
	code: typed.body?.details?.code ?? null
}

// The product strip of the home page and the catalogue hub (one card per product): the home page's
// first read, and a failure of it is a failure of the page — before the migration and after it.
const strip = await get('/products/catalog/v2/strip?limit=8')
const cards = Array.isArray(strip.body?.items) ? strip.body.items : []
result.strip = {
	status: strip.status,
	items: cards.length,
	grouped: cards.every(card => card.group && Number.isInteger(card.group.count) && typeof card.group.price_min === 'number'),
	products: cards.map(card => card.product_id).sort()
}

const landings = await get('/landings')
result.landings = []
for (const l of (landings.body ?? []).filter(l => l.category_id === F).sort((a, b) => a.slug.localeCompare(b.slug))) {
	const detail = await get(`/landings/slug/filament/${l.slug}`)
	result.landings.push({
		slug: l.slug,
		status: l.status,
		product_count: l.product_count,
		detail_status: detail.status,
		contract_version: detail.body?.contract_version ?? null,
		filters_v2: detail.body?.filters_v2 ?? null,
		h1: detail.body?.h1 ?? null,
		title: detail.body?.title ?? null
	})
}

const sitemap = await readCatalogSitemap(base, H)
result.sitemap_status = sitemap.status
result.sitemap = sitemap.status === 200
	? Object.fromEntries(['variants', 'categories', 'landings'].map(k => [k, sitemap.body[k]]))
	: sitemap.body

// Refill cards: every price-sheet row named «без котушки» and its typed notice.
const refills = await get(`/products/price-sheet?q=${encodeURIComponent('без котушки')}&limit=100`)
result.refills = []
for (const row of refills.body?.items ?? []) {
	const page = await get(`/products/by-slug/${row.slug}`)
	result.refills.push({
		slug: row.slug,
		status: page.status,
		attribute_notice: page.body?.attribute_notice ?? null
	})
}
fs.writeFileSync(out, JSON.stringify(result, null, 1))
console.log(out, `legacy ${result.legacy_catalog.status}`, `v2 ${result.v2_catalog.status}/${result.v2_catalog.total}`,
	`strip ${result.strip.status}/${result.strip.items}`, `landings ${result.landings.length}`, `sitemap ${result.sitemap_status}`, `refills ${result.refills.length}`)
