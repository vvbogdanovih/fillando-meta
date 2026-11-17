// D06 acceptance load on the synthetic large catalogue (`large-fixture.cjs`): N concurrent
// readers for SECONDS over a mix of public reads — tree pages, the whole catalogue, groups, product
// categories with typed/colour/price filters, product pages and the storefront's product strips
// (`strip_*`: «Новинки», «Акції», a group, a product category, a hand-picked product list) — with
// p50/p95/p99/max per scenario and the API process RSS sampled every second. Read-only GETs.
//
//   INTERNAL_API_TOKEN=… API_PID=<pid> [N=10] [SECONDS=300] [SCENARIOS=a,b] node load-large.mjs <api> <log.jsonl>
//   API_CONTAINER=<docker container> instead of API_PID samples VmRSS of the container's PID 1 (a Linux API).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const [base, logFile] = process.argv.slice(2)
const H = { 'X-Internal-Token': process.env.INTERNAL_API_TOKEN ?? '' }
const N = Number(process.env.N ?? 10)
const SECONDS = Number(process.env.SECONDS ?? 300)
const get = async path => {
	const response = await fetch(base + path, { headers: H })
	const body = await response.arrayBuffer()
	return { status: response.status, bytes: body.byteLength, body }
}
const json = async path => JSON.parse(Buffer.from((await get(path)).body).toString())

// The tree, paged as the storefront reads it; product categories and groups from it.
const nodes = []
for (let cursor = null, guard = 0; guard < 100; guard++) {
	const page = await json(`/categories/tree?limit=1000${cursor ? `&cursor=${cursor}` : ''}`)
	nodes.push(...page.items)
	cursor = page.next_cursor
	if (!cursor) break
}
const cursors = [null]
for (let cursor = null, guard = 0; guard < 100; guard++) {
	const page = await json(`/categories/tree?limit=1000${cursor ? `&cursor=${cursor}` : ''}`)
	cursor = page.next_cursor
	if (!cursor) break
	cursors.push(cursor)
}
const groups = nodes.filter(node => node.kind === 'group')
const products = nodes.filter(node => node.kind === 'product')
const pick = list => list[Math.floor(Math.random() * list.length)]
const brands = Array.from({ length: 40 }, (_, i) => `Brand ${i + 1}`)
const families = ['black', 'white', 'red', 'blue', 'green']
const filters = value => `&filters=${encodeURIComponent(JSON.stringify(value))}`
// Hand-picked «Вітрина» lists for the strips: 24 products of each of a few big categories.
const lists = []
for (const category of products.slice(0, 5)) {
	const page = await json(`/products/catalog/v2?category_id=${category._id}&limit=100`)
	lists.push([...new Set(page.items.map(item => item.product_id))].slice(0, 24))
}
const stripLimit = () => pick([8, 24])

const scenarios = {
	tree: () => `/categories/tree?limit=1000${(c => (c ? `&cursor=${c}` : ''))(pick(cursors))}`,
	catalog_all: () =>
		`/products/catalog/v2?limit=24&page=${1 + Math.floor(Math.random() * 40)}${pick(['', '&sort=price_asc', '&sort=price_desc'])}`,
	catalog_group: () =>
		`/products/catalog/v2?category_id=${pick(groups)._id}&limit=24&page=${1 + Math.floor(Math.random() * 5)}${Math.random() < 0.3 ? filters({ price: { min: 500, max: 3000 }, in_stock: true }) : ''}`,
	catalog_category: () => {
		const category = pick(Math.random() < 0.5 ? products.slice(0, 50) : products)
		const value = {
			attributes: [
				...(Math.random() < 0.6 ? [{ key: 'brand_text', values: [pick(brands), pick(brands)] }] : []),
				...(Math.random() < 0.4 ? [{ key: 'power', min: 500, max: 2500 }] : []),
				...(Math.random() < 0.3 ? [{ key: 'wifi', values: [true] }] : [])
			]
		}
		return `/products/catalog/v2?category_id=${category._id}&limit=24${filters(value)}`
	},
	product: () => `/products/by-slug/load-sku-${1 + Math.floor(Math.random() * 100000)}`,
	// The storefront's strips, one card per product (`GET /products/catalog/v2/strip`): «Новинки»
	// and «Акції» of the whole catalogue and of a group, a collection over a product category and
	// a hand-picked product list — the home page reads 24 per collection, a strip 8.
	strip_new: () => `/products/catalog/v2/strip?limit=${stripLimit()}`,
	strip_sale: () =>
		`/products/catalog/v2/strip?${Math.random() < 0.5 ? `category_id=${pick(groups)._id}&` : ''}limit=${stripLimit()}${filters({ on_sale: true })}`,
	strip_group: () => `/products/catalog/v2/strip?category_id=${pick(groups)._id}&limit=${stripLimit()}`,
	strip_category: () =>
		`/products/catalog/v2/strip?category_id=${pick(Math.random() < 0.5 ? products.slice(0, 50) : products)._id}&limit=24`,
	strip_products: () => `/products/catalog/v2/strip?limit=24${filters({ product_ids: pick(lists) })}`
}
// Colour filters only exist on colour-axis categories: probe one per worker pass.
const colourCategory = products.find(node => node.slug.endsWith('-l1'))

const rss = []
const sampler = setInterval(() => {
	try {
		const kib = process.env.API_CONTAINER
			? execFileSync('docker', ['exec', process.env.API_CONTAINER, 'grep', 'VmRSS', '/proc/1/status']).toString().match(/(\d+)/)[1]
			: execFileSync('ps', ['-o', 'rss=', '-p', process.env.API_PID]).toString().trim()
		rss.push(Number(kib) / 1024)
	} catch {
		// process gone: the run is reported as failed below by the statuses
	}
}, 1000)
const results = Object.fromEntries(Object.keys(scenarios).map(name => [name, { times: [], statuses: {}, maxBytes: 0 }]))
const deadline = Date.now() + SECONDS * 1000
// SCENARIOS=tree,product … runs a subset (to attribute latency or memory to one read).
const names = process.env.SCENARIOS ? process.env.SCENARIOS.split(',') : Object.keys(scenarios)
await Promise.all(
	Array.from({ length: N }, async (_, worker) => {
		for (let i = worker; Date.now() < deadline; i++) {
			const name = names[i % names.length]
			const path = name === 'catalog_category' && colourCategory && i % 7 === 0
				? `/products/catalog/v2?category_id=${colourCategory._id}&limit=24${filters({ color_families: [pick(families)] })}`
				: scenarios[name]()
			const started = performance.now()
			const response = await get(path)
			const row = results[name]
			row.times.push(performance.now() - started)
			row.statuses[response.status] = (row.statuses[response.status] ?? 0) + 1
			row.maxBytes = Math.max(row.maxBytes, response.bytes)
		}
	})
)
clearInterval(sampler)
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
const report = {}
for (const [name, row] of Object.entries(results)) {
	if (!row.times.length) continue
	const sorted = row.times.sort((a, b) => a - b)
	report[name] = {
		n: sorted.length,
		p50: Math.round(pct(sorted, 50)),
		p95: Math.round(pct(sorted, 95)),
		p99: Math.round(pct(sorted, 99)),
		max: Math.round(sorted.at(-1)),
		max_kib: Math.round(row.maxBytes / 1024),
		statuses: row.statuses
	}
}
const summary = {
	at: new Date().toISOString(),
	base,
	...(process.env.API_CONTAINER ? { api: `container ${process.env.API_CONTAINER}` } : {}),
	N,
	SECONDS,
	categories: nodes.length,
	rss_mib: { start: Math.round(rss[0] ?? 0), peak: Math.round(Math.max(...rss)), end: Math.round(rss.at(-1) ?? 0) },
	report
}
console.log(JSON.stringify(summary, null, 1))
if (logFile) fs.appendFileSync(logFile, JSON.stringify(summary) + '\n')
