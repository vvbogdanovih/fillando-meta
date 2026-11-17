// D06 tree operations on a synthetic catalogue (`large-fixture.cjs`, Plan-0010 TD-0013 §6):
//
//   move  — real journal moves through the admin API: draft categories between draft groups, published
//           product categories (the big ones, 1 025 SKUs) between published groups and back. Times every
//           PATCH /categories/:id/draft-placement (and the draft creations it needs) — p50/p95/max.
//           Writes: only to the API it is pointed at, which must run over a fillando_load_* database.
//   reads — every tree read a shopper or the admin triggers on a stress shape (chain / wide): the public
//           and admin tree (all cursor pages), children of the root and of the deepest node, the deepest
//           category, a product in it with its path, the catalogue of the root, the sitemap index and
//           parts. Status, time and payload per read; any payload over 2 MiB is a FAIL.
//
//   INTERNAL_API_TOKEN=… ADMIN_COOKIE='<cookie>=<jwt>' [MOVES=30] node tree-ops.mjs <api> move
//   INTERNAL_API_TOKEN=… ADMIN_COOKIE=… node tree-ops.mjs <api> reads [log.jsonl]
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'

const [base, mode, logFile] = process.argv.slice(2)
const H = { 'X-Internal-Token': process.env.INTERNAL_API_TOKEN ?? '', Cookie: process.env.ADMIN_COOKIE ?? '' }
const LIMIT = 2 * 1024 * 1024
const call = async (method, path, body) => {
	const started = performance.now()
	const response = await fetch(base + path, {
		method,
		headers: { ...H, ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() } : {}) },
		body: body ? JSON.stringify(body) : undefined
	})
	const text = await response.text()
	return {
		status: response.status,
		ms: performance.now() - started,
		bytes: Buffer.byteLength(text),
		body: (() => {
			try {
				return JSON.parse(text)
			} catch {
				return text
			}
		})()
	}
}
const pct = (values, p) => {
	const sorted = [...values].sort((a, b) => a - b)
	return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0)
}
const summary = values => ({ n: values.length, p50: pct(values, 50), p95: pct(values, 95), max: pct(values, 100) })
const adminTree = async () => {
	const nodes = []
	let cursor = null
	let revision = null
	for (let guard = 0; guard < 1000; guard++) {
		const page = await call('GET', `/categories/admin/tree?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
		if (page.status !== 200) throw Error(`admin tree ${page.status} ${JSON.stringify(page.body).slice(0, 200)}`)
		nodes.push(...page.body.items)
		revision = page.body.revision
		cursor = page.body.next_cursor
		if (!cursor) break
	}
	return { nodes, revision }
}

const report = { at: new Date().toISOString(), base, mode }
if (mode === 'move') {
	const MOVES = Number(process.env.MOVES ?? 30)
	let { nodes, revision } = await adminTree()
	const receipt = (result, label) => {
		if (result.status !== 200 && result.status !== 201)
			throw Error(`${label} ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`)
		revision = result.body.revision
		return result.body
	}
	const times = { create: [], draft_move: [], published_move: [] }
	// Two draft groups at the root and MOVES draft product categories, alternating between them.
	const stamp = Date.now().toString(36)
	const groups = []
	for (const n of [1, 2]) {
		const created = await call('POST', '/categories/drafts', {
			name: `Чернетка ${stamp} ${n}`,
			slug: `draft-${stamp}-${n}`,
			kind: 'group',
			parent_id: null,
			order: 100000 + n,
			expected_revision: revision
		})
		times.create.push(created.ms)
		groups.push(receipt(created, 'create group').category_id)
	}
	const drafts = []
	for (let n = 0; n < MOVES; n++) {
		const created = await call('POST', '/categories/drafts', {
			name: `Чернетка ${stamp} категорія ${n}`,
			slug: `draft-${stamp}-c${n}`,
			kind: 'product',
			parent_id: groups[0],
			order: n,
			expected_revision: revision
		})
		times.create.push(created.ms)
		drafts.push(receipt(created, 'create draft').category_id)
	}
	for (const [n, id] of drafts.entries()) {
		const moved = await call('PATCH', `/categories/${id}/draft-placement`, {
			parent_id: groups[1],
			order: n,
			expected_revision: revision
		})
		times.draft_move.push(moved.ms)
		receipt(moved, 'draft move')
	}
	// Published: the fixture's first leaves are the big product categories; move each to the next
	// section's first group and back, so every move carries 1 025 SKUs' category to a new parent.
	const published = nodes.filter(node => node.kind === 'product' && node.status === 'active').slice(0, Math.ceil(MOVES / 2))
	const targets = nodes.filter(node => node.kind === 'group' && node.status === 'active' && node.parent_id !== null)
	for (const node of published) {
		const target = targets.find(group => group._id !== node.parent_id)
		for (const parent of [target._id, node.parent_id]) {
			const moved = await call('PATCH', `/categories/${node._id}/draft-placement`, {
				parent_id: parent,
				order: node.order ?? 0,
				expected_revision: revision
			})
			times.published_move.push(moved.ms)
			receipt(moved, 'published move')
		}
	}
	// The public tree shows the final placement (every published node back under its parent).
	;({ nodes } = await adminTree())
	report.back_in_place = published.every(node => nodes.find(row => row._id === node._id)?.parent_id === node.parent_id)
	report.times = Object.fromEntries(Object.entries(times).map(([key, values]) => [key, summary(values)]))
} else if (mode === 'reads') {
	const rows = []
	const read = async (label, path, admin = false) => {
		const result = await call('GET', path)
		rows.push({ label, path: path.slice(0, 90), status: result.status, ms: Math.round(result.ms), kib: Math.round(result.bytes / 1024), ok: result.status === 200 && result.bytes <= LIMIT })
		return result
	}
	const walk = async (label, first) => {
		let cursor = null
		let pages = 0
		let items = 0
		let maxBytes = 0
		let total = 0
		const started = performance.now()
		do {
			const result = await call('GET', `${first}${first.includes('?') ? '&' : '?'}limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
			if (result.status !== 200) {
				rows.push({ label, path: first, status: result.status, ms: Math.round(result.ms), kib: Math.round(result.bytes / 1024), ok: false, body: JSON.stringify(result.body).slice(0, 200) })
				return []
			}
			pages++
			items += result.body.items.length
			maxBytes = Math.max(maxBytes, result.bytes)
			total += result.bytes
			cursor = result.body.next_cursor
			if (pages === 1) walk.firstItems = result.body.items
		} while (cursor && pages < 1000)
		rows.push({ label, path: first, status: 200, pages, items, ms: Math.round(performance.now() - started), max_page_kib: Math.round(maxBytes / 1024), kib: Math.round(total / 1024), ok: maxBytes <= LIMIT && !cursor })
		return walk.firstItems
	}
	await walk('public tree (all pages)', '/categories/tree')
	const { nodes } = await adminTree()
	await walk('admin tree (all pages)', '/categories/admin/tree')
	const root = nodes.find(node => node.parent_id === null)
	const leaf = nodes.filter(node => node.kind === 'product').at(-1)
	await walk('children of the root', `/categories/children?parent_id=${root._id}`)
	await walk('children of the deepest product category', `/categories/children?parent_id=${leaf._id}`)
	await read('roots', '/categories/children')
	await walk('ancestors of the deepest category (all pages)', `/categories/${leaf._id}/ancestors`)
	await read('deepest category by slug', `/categories/slug/${leaf.slug}`)
	await read('deepest category by id', `/categories/${leaf._id}`)
	await walk('product category options (all pages)', '/categories/options')
	// The legacy list (every product category with definitions, unpaginated) stays unchanged for the
	// storefront released before Plan-0010 until R04; the new FE never reads it. Measured on request
	// only (LEGACY_LIST=1) and never counted as a failure: at 150 000 categories it is ~250 MB.
	if (process.env.LEGACY_LIST === '1') {
		await read('legacy list GET /categories (until R04)', '/categories')
		rows.at(-1).ok = true
		rows.at(-1).note = 'legacy, not a new-FE read'
	}
	const listing = await read('catalogue of the deepest category', `/products/catalog/v2?category_id=${leaf._id}&limit=24`)
	const sku = listing.body?.items?.[0]?.slug
	if (sku) await read('product in the deepest category', `/products/by-slug/${sku}`)
	await read('catalogue of the root group', `/products/catalog/v2?category_id=${root._id}&limit=24`)
	await read('whole catalogue', '/products/catalog/v2?limit=24')
	const index = await read('sitemap index', '/catalog/sitemap')
	for (const [n, part] of (index.body?.parts ?? []).entries()) {
		const query = new URLSearchParams({ revision: index.body.revision, epoch: index.body.epoch, ...(part.from ? { from: part.from } : {}), ...(part.to ? { to: part.to } : {}) })
		await read(`sitemap part ${n}`, `/catalog/sitemap/part?${query}`)
	}
	report.nodes = nodes.length
	report.reads = rows
	report.fail = rows.filter(row => !row.ok).length
} else {
	console.error('mode: move | reads')
	process.exit(2)
}
console.log(JSON.stringify(report, null, 1))
if (logFile) fs.appendFileSync(logFile, JSON.stringify(report) + '\n')
if (report.fail) process.exit(1)
