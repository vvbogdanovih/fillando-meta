// Totals and facet counts of the filament listing under a few filter combinations, normalised so
// the legacy (`/products/catalog`) and the typed (`/products/catalog/v2`) answers can be compared.
// Usage: INTERNAL_API_TOKEN=… node facets.mjs <api> legacy|v2 <out.json>   (read-only)
import fs from 'node:fs'
const [base, mode, out] = process.argv.slice(2)
const H = { 'X-Internal-Token': process.env.INTERNAL_API_TOKEN ?? '' }
// One category by its slug — the old and the new API both serve it; never the full list (D06).
const F = (await (await fetch(base + '/categories/slug/filament', { headers: H })).json())._id
const combos = [{}, { polymer: ['PLA'] }, { polymer: ['PETG'], color: ['black'] }, { color: ['white'] }, { vyrobnyk: ['Kingroon'], polymer: ['PLA', 'PETG'] }, { spool_included: ['Ні (рефіл)'] }]
const result = []
for (const combo of combos) {
	let url
	if (mode === 'legacy') {
		const q = new URLSearchParams({ category_id: F, limit: '100' })
		for (const [k, v] of Object.entries(combo)) q.set(k === 'color' ? 'color_family' : k, v.join(','))
		url = '/products/catalog?' + q
	} else {
		const attributes = Object.entries(combo).filter(([k]) => k !== 'color').map(([key, values]) => ({ key, values }))
		const filters = { attributes, ...(combo.color ? { color_families: combo.color } : {}) }
		url = `/products/catalog/v2?category_id=${F}&limit=100&filters=${encodeURIComponent(JSON.stringify(filters))}`
	}
	// A refused request (429, 5xx) is not an empty listing: two of them would compare equal.
	const answer = await fetch(base + url, { headers: H })
	if (!answer.ok) throw new Error(`GET ${url.split('?')[0]} (${JSON.stringify(combo)}): ${answer.status}`)
	const body = await answer.json()
	const facets = {}
	if (mode === 'legacy') {
		for (const [key, values] of Object.entries(body.facets ?? {})) if (Array.isArray(values)) facets[key] = Object.fromEntries(values.map(v => [String(v.value ?? v.family), v.count]))
		const colors = body.color_options
		if (Array.isArray(colors)) facets.__colors = Object.fromEntries(colors.map(c => [c.family, c.count]))
	} else {
		for (const f of body.facets.attributes) facets[f.key] = Object.fromEntries(f.values.map(v => [String(v.value), v.count]))
		facets.__colors = Object.fromEntries(body.facets.colors.map(c => [c.family, c.count]))
	}
	result.push({ combo, total: body.total ?? body.pagination?.total, skus: (body.items ?? []).map(i => i.sku).sort(), facets })
}
fs.writeFileSync(out, JSON.stringify(result, null, 1))
console.log(out, result.map(r => r.total).join(' / '))
