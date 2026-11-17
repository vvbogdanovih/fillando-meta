// Parallel load: N workers, TOTAL requests per scenario after a warm-up; latency percentiles.
// Usage: INTERNAL_API_TOKEN=… [N=16] [TOTAL=480] node load.mjs <api> legacy|v2 <label> [log.jsonl]
// Read-only GETs; the internal token bypasses the per-IP throttle like the storefront's SSR.
import fs from 'node:fs'
import { readCatalogSitemap } from './sitemap-export.mjs'
const [base, mode, label, logFile] = process.argv.slice(2) // mode: legacy | v2
const H = { 'X-Internal-Token': process.env.INTERNAL_API_TOKEN ?? '' }
const N = Number(process.env.N ?? 16), TOTAL = Number(process.env.TOTAL ?? 480)
const sitemap = (await readCatalogSitemap(base, H).catch(() => null))?.body
const slugs = sitemap?.variants?.map(v => v.slug) ?? (await (await fetch(base + '/products/variants/slugs', { headers: H })).json()).map(v => v.slug)
// One category by its slug — the old and the new API both serve it; never the full list (D06).
const filament = (await (await fetch(base + '/categories/slug/filament', { headers: H })).json())._id
const combos = [['PLA', 'black'], ['PETG', 'white'], ['PLA', 'red'], ['ABS', 'black'], ['TPU', 'blue']]
const pick = a => a[Math.floor(Math.random() * a.length)]
const scenarios = {
	catalog: () => mode === 'legacy'
		? `/products/catalog?category_id=${filament}&limit=24&page=${1 + Math.floor(Math.random() * 12)}`
		: `/products/catalog/v2?category_id=${filament}&limit=24&page=${1 + Math.floor(Math.random() * 12)}`,
	filters: () => {
		const [polymer, family] = pick(combos)
		return mode === 'legacy'
			? `/products/catalog?category_id=${filament}&limit=24&polymer=${polymer}&color_family=${family}`
			: `/products/catalog/v2?category_id=${filament}&limit=24&filters=${encodeURIComponent(JSON.stringify({ attributes: [{ key: "polymer", values: [polymer] }], color_families: [family] }))}`
	},
	product: () => `/products/by-slug/${encodeURIComponent(pick(slugs))}`
}
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
const report = {}
for (const [name, url] of Object.entries(scenarios)) {
	for (let i = 0; i < 30; i++) await fetch(base + url(), { headers: H }).then(r => r.arrayBuffer())
	const times = [], statuses = {}
	let next = 0
	const started = performance.now()
	await Promise.all(Array.from({ length: N }, async () => {
		while (next++ < TOTAL) {
			const t = performance.now()
			const r = await fetch(base + url(), { headers: H })
			await r.arrayBuffer()
			times.push(performance.now() - t)
			statuses[r.status] = (statuses[r.status] ?? 0) + 1
		}
	}))
	const wall = (performance.now() - started) / 1000
	times.sort((x, y) => x - y)
	report[name] = { n: times.length, rps: +(times.length / wall).toFixed(1), p50: +pct(times, 50).toFixed(1), p95: +pct(times, 95).toFixed(1), p99: +pct(times, 99).toFixed(1), max: +times.at(-1).toFixed(1), statuses }
}
console.log(label, JSON.stringify(report))
if (logFile) fs.appendFileSync(logFile, JSON.stringify({ label, base, mode, N, TOTAL, at: new Date().toISOString(), report }) + '\n')
