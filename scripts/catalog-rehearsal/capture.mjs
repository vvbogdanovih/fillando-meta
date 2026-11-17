// Captures the legacy-shaped consumers of one API — partner API, price sheet, admin PDF text and the
// Google feed — into one JSON file for a before/after comparison (Plan-0010 R01/D08).
// Usage: INTERNAL_API_TOKEN=… PARTNER_TOKEN=… ADMIN_COOKIE='<name>=<jwt>' node capture.mjs <api> <out.json>
// Read-only. Needs `pdftotext` (poppler) for the PDF text.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const [base, out] = process.argv.slice(2)
const creds = { token: process.env.PARTNER_TOKEN, cookie: process.env.ADMIN_COOKIE }
const internal = process.env.INTERNAL_API_TOKEN ?? ''
const H = { 'X-Internal-Token': internal }
const get = async path => {
	const r = await fetch(base + path, { headers: H })
	return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() }
}
const result = {}
// Whether a token was given and every partner answer other than 200: two failed captures hold the
// same empty lists and would compare equal (audit, 2026-11-07) — release-check fails on any error
// and skips only when neither side had a token. The same for the PDF and ADMIN_COOKIE.
result.partner_token = Boolean(creds.token)
result.admin_cookie = Boolean(creds.cookie)
result.partner_errors = []
const partner = async (path, body) => {
	const r = await fetch(base + '/partner/v1/' + path, { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + creds.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
	const answer = { status: r.status, body: await r.json().catch(() => null) }
	if (r.status !== 200) result.partner_errors.push({ path, ...answer })
	return answer
}
result.partner_categories = await partner('categories', {})
const skus = []
let cursor = null
do {
	const page = await partner('products/skus', { category_id: null, cursor, limit: 100 })
	if (page.status !== 200) break
	skus.push(...page.body.items)
	cursor = page.body.next_cursor
} while (cursor)
result.partner_skus = skus
result.partner_lookup = []
result.partner_availability = []
for (let i = 0; i < skus.length; i += 100) {
	const chunk = skus.slice(i, i + 100)
	const lookup = await partner('products/lookup', { skus: chunk })
	result.partner_lookup.push(...(lookup.body?.items ?? []))
	const av = await partner('products/availability', { skus: chunk })
	result.partner_availability.push(...(av.body?.items ?? []))
}
const sheet = []
// The sheet's categories with their columns (owner, 2026-11-06), merged over the pages.
const sheetCategories = {}
for (let page = 1; ; page++) {
	const r = await get(`/products/price-sheet?limit=100&page=${page}`)
	if (r.status !== 200) { result.price_sheet_error = r; break }
	sheet.push(...r.body.items)
	for (const category of r.body.categories ?? []) sheetCategories[category.id] ??= category
	if (sheet.length >= r.body.total || !r.body.items.length) break
}
result.price_sheet = sheet
result.price_sheet_categories = Object.values(sheetCategories)
const pdf = await fetch(base + '/products/price-list/pdf', { method: 'POST', headers: { Cookie: creds.cookie, 'Content-Type': 'application/json' }, body: '{}' })
result.pdf_status = pdf.status
if (pdf.status === 201) {
	fs.writeFileSync(out + '.pdf', Buffer.from(await pdf.arrayBuffer()))
	result.pdf_text = execFileSync('pdftotext', ['-layout', out + '.pdf', '-']).toString().replace(/Станом на [^·]+·/, 'Станом на <time> ·')
	// Content order keeps a wrapped cell's lines together, where the layout interleaves the columns
	// of the per-category tables (owner, 2026-11-06): the name checks read this one.
	result.pdf_text_raw = execFileSync('pdftotext', ['-raw', out + '.pdf', '-']).toString().replace(/Станом на [^·]+·/, 'Станом на <time> ·')
}
// Right after a CLI apply the API's feed is stale: the first GET answers 503 CATALOG_FEED_STALE
// and queues a rebuild, which lands in seconds. Wait for it rather than record the 503.
let feed = await get('/feeds/google-shopping.xml')
for (let attempt = 0; feed.status === 503 && attempt < 6; attempt++) {
	await new Promise(resolve => setTimeout(resolve, 5000))
	feed = await get('/feeds/google-shopping.xml')
}
result.feed_status = feed.status
result.feed = typeof feed.body === 'string' ? feed.body.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, '').replace(/Згенеровано[^<]*/, '') : feed.body
fs.writeFileSync(out, JSON.stringify(result, null, 1))
console.log(out, 'partner skus', skus.length, 'errors', result.partner_errors.length, 'lookup', result.partner_lookup.length, 'sheet', sheet.length, 'pdf', pdf.status, 'feed', feed.status)
