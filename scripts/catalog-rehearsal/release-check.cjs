// D08 §3.7 verdict: compares the captures taken before the filament migration (legacy) with the
// ones taken after it and prints PASS/FAIL per check. Exit code 0 only when every check passes.
// Usage: node release-check.cjs <before-dir> <after-dir> [mapping.json] [dry-run.json]
// Each dir holds capture.json (capture.mjs), facets.json (facets.mjs: legacy before, v2 after)
// and verify.json (release-verify.mjs). Read-only; nothing is sent anywhere.
// Three changes are intended (owner, 2026-11-05) and only these are allowed through: every product
// and SKU name gains the mapping's `product_name_addition` before the variation, the mapping's
// `value_aliases` merge two spellings of one value («Glow» → «Luminous»), the single SKUs the dry-run
// report lists in `colored_skus` go on the colour axis (their SKU name, colour and the colour facet
// change), and the feed's `g:product_highlight` are the characteristics the product page shows.
// The dry-run report defaults to <before-dir>/../dry-run.json, where catalog-release.mjs writes it.
// `removed_keys` (owner, 2026-11-06: the free-text «Матеріал») are not carried over: their rows leave the
// partner cards. The price sheet is built per category: its `values` are the category's columns (a v1
// category has none) and the deprecated `material` is null once typed — both compared apart.
// `enum_labels` make lists of text characteristics: exports and `g:material` print the label
// («Шовковий (Silk)», «TPU (Flex)») where they printed the stored value; ids, facets and pins keep it. The mapping defaults to
// fillando-be/scripts/catalog-v2-migration.filament.json beside this meta checkout.
const fs = require('fs')
const path = require('path')
const [beforeDir, afterDir, mappingArg, dryRunArg] = process.argv.slice(2)
if (!beforeDir || !afterDir) {
	console.error('usage: node release-check.cjs <before-dir> <after-dir> [mapping.json]')
	process.exit(1)
}
const mappingPath = mappingArg ?? path.join(__dirname, '../../repos/fillando-be/scripts/catalog-v2-migration.filament.json')
const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
const addition = mapping.product_name_addition ?? null
const aliases = mapping.value_aliases ?? {}
const labels = mapping.enum_labels ?? {}
const materialKey = Object.entries(mapping.semantics ?? {}).find(([, meaning]) => meaning === 'material')?.[0]
const removedKeys = new Set(mapping.removed_keys ?? [])
/** A before-side partner card without the characteristics the migration does not carry over. */
const unremove = value =>
	removedKeys.size
		? JSON.parse(JSON.stringify(value), (k, v) =>
				Array.isArray(v) ? v.filter(x => !(x && typeof x === 'object' && !Array.isArray(x) && removedKeys.has(x.key))) : v)
		: value
/** A before-side value as the migration will print it: merged by the aliases, then labelled. */
const printed = (key, value) => {
	const merged = aliases[key]?.[value] ?? value
	return labels[key]?.[merged] ?? merged
}
const dryRunPath = dryRunArg ?? path.join(beforeDir, '..', 'dry-run.json')
const colored = fs.existsSync(dryRunPath) ? (JSON.parse(fs.readFileSync(dryRunPath, 'utf8')).report?.colored_skus ?? {}) : {}
const coloredSkus = new Set(Object.keys(colored))
const N = coloredSkus.size
const insert = addition ? ` — ${addition}` : null
// The after-side with the name addition taken out again, so everything else compares exactly.
const unrename = value =>
	insert
		? JSON.parse(JSON.stringify(value), (key, v) => (typeof v === 'string' && v.includes(insert) ? v.split(insert).join('') : v))
		: value
const load = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
const before = { capture: load(beforeDir, 'capture.json'), facets: load(beforeDir, 'facets.json'), verify: load(beforeDir, 'verify.json') }
// The before-side as the aliases merge it: facet counts of the old spelling move to the new one
// (a SKU never carried both), and partner cards read the new value.
for (const row of before.facets)
	for (const [key, map] of Object.entries(aliases))
		for (const [from, to] of Object.entries(map))
			if (row.facets?.[key]?.[from] !== undefined) {
				row.facets[key][to] = (row.facets[key][to] ?? 0) + row.facets[key][from]
				delete row.facets[key][from]
			}
const realias = value =>
	JSON.parse(JSON.stringify(value), (k, v) =>
		v && typeof v === 'object' && !Array.isArray(v) && typeof v.key === 'string' && typeof v.value === 'string' ? { ...v, value: printed(v.key, v.value) } : v)
before.capture.partner_lookup = unremove(realias(before.capture.partner_lookup ?? []))
before.capture.partner_skus = unremove(realias(before.capture.partner_skus ?? []))
// `g:material` is the characteristic marked material, printed with its label.
if (materialKey && typeof before.capture.feed === 'string')
	before.capture.feed = before.capture.feed.replace(/<g:material>([^<]*)<\/g:material>/g, (line, value) => `<g:material>${printed(materialKey, value)}</g:material>`)
const after = { capture: load(afterDir, 'capture.json'), facets: load(afterDir, 'facets.json'), verify: load(afterDir, 'verify.json') }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
// Facet maps are compared as sets of value → count: the legacy and typed answers order keys differently.
const sorted = v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v)
let failed = 0
const check = (name, ok, detail = '') => {
	if (!ok) failed++
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const skip = (name, why) => console.log(`SKIP  ${name} — ${why}`)

// Listing and facets (6 filter combinations, legacy before vs typed after).
const legacyTotal = before.verify.legacy_catalog.total ?? before.facets[0]?.total
check('legacy listing before = 200', before.verify.legacy_catalog.status === 200, `total ${legacyTotal}`)
check('legacy listing after = 409', after.verify.legacy_catalog.status === 409, String(after.verify.legacy_catalog.code))
check('v2 listing after: total = legacy total', after.verify.v2_catalog.status === 200 && after.verify.v2_catalog.total === legacyTotal,
	`${after.verify.v2_catalog.total} vs ${legacyTotal}`)
check('v2 colour families = legacy colour families', after.verify.v2_catalog.colour_families === Object.keys(before.facets[0]?.facets?.__colors ?? {}).length,
	`${after.verify.v2_catalog.colour_families}`)
// Colour facets: the newly coloured single SKUs (N) join their families — never fewer, at most N more,
// exactly N more over the whole catalogue. A combo filtering by colour may gain them as results.
const sum = map => Object.values(map ?? {}).reduce((total, count) => total + count, 0)
before.facets.forEach((b, i) => {
	const a = after.facets[i]
	const label = JSON.stringify(b.combo)
	const byColour = Object.hasOwn(b.combo, 'color')
	if (byColour && N) {
		const gained = (a?.total ?? 0) - b.total
		check(`facets ${label}: total (+ ≤ ${N} newly coloured)`, a && gained >= 0 && gained <= N, `${a?.total} vs ${b.total}`)
	} else check(`facets ${label}: total and first-page SKUs`, a && a.total === b.total && eq(a.skus, b.skus), `${a?.total} vs ${b.total}`)
	const keys = new Set([...Object.keys(b.facets), ...Object.keys(a?.facets ?? {})])
	const diff = [...keys].filter(k => {
		if (eq(sorted(b.facets[k]), sorted(a?.facets?.[k]))) return false
		if (!N || !(k === '__colors' || byColour)) return true
		const before = b.facets[k] ?? {}, now = a?.facets?.[k] ?? {}
		const grew = Object.keys(before).every(v => (now[v] ?? 0) >= before[v])
		const extra = sum(now) - sum(before)
		return !(grew && extra >= 0 && extra <= N && (k !== '__colors' || Object.keys(b.combo).length || extra === N))
	})
	check(`facets ${label}: counts`, diff.length === 0, diff.length ? `differ: ${diff.join(', ')}` : `${keys.size} dimensions`)
})

// The product strip of the home page and the hub: the same products, each card with its group.
// (Captures taken before the probe had it carry no `strip` and are not compared.)
const bs = before.verify.strip, as = after.verify.strip
if (bs && as)
	check('strip: 200 with grouped cards, same products', as.status === 200 && as.items > 0 && as.grouped === true && bs.status === 200 && eq(bs.products, as.products),
		`${bs.status}/${bs.items} → ${as.status}/${as.items}`)

// Landings: the same pages, each 200 on the typed contract with the same count.
const bl = before.verify.landings, al = after.verify.landings
check('landings: same slugs', eq(bl.map(l => l.slug), al.map(l => l.slug)), `${al.length}`)
const badLanding = al.filter(l => l.detail_status !== 200 || l.contract_version !== 2 || !l.filters_v2)
check('landings after: 200, contract_version 2, filters_v2', badLanding.length === 0, badLanding.map(l => l.slug).join(', '))
const countDiff = al.filter(l => bl.find(x => x.slug === l.slug)?.product_count !== l.product_count)
check('landings: product counts unchanged', countDiff.length === 0, countDiff.map(l => l.slug).join(', '))
const copyDiff = al.filter(l => { const x = bl.find(y => y.slug === l.slug); return x?.h1 !== l.h1 || x?.title !== l.title })
check('landings: h1/title unchanged', copyDiff.length === 0, copyDiff.map(l => l.slug).join(', '))

// Sitemap export and the refill card.
check('catalogue sitemap unchanged', after.verify.sitemap_status === 200 && eq(before.verify.sitemap, after.verify.sitemap),
	Object.entries(after.verify.sitemap ?? {}).map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : '?'}`).join(', '))
const refills = after.verify.refills
check('refill cards found', refills.length > 0, `${refills.length}`)
for (const r of refills) {
	check(`refill ${r.slug}: notice with badge`, r.status === 200 && !!r.attribute_notice?.title && !!r.attribute_notice?.badge, r.attribute_notice?.badge ?? 'none')
}

// Legacy-shaped consumers: partner API, price sheet, PDF, feed — names gain the addition (intended).
const bc = { ...before.capture }, ac = { ...after.capture }
// Per-category columns: the rows' `values` and the deprecated `material` are checked apart below.
const sheetRow = ({ values, material, ...row }) => row
for (const side of [bc, ac]) if (Array.isArray(side.price_sheet)) side.price_sheet = side.price_sheet.map(sheetRow)
{
	const sheet = after.capture.price_sheet ?? []
	const columns = new Map((after.capture.price_sheet_categories ?? []).map(category => [category.id, category.columns ?? []]))
	const typed = sheet.filter(row => (columns.get(row.category_id) ?? []).length)
	check('price sheet after: every category lists its columns', sheet.length > 0 && sheet.every(row => columns.has(row.category_id)), `${columns.size} categor${columns.size === 1 ? 'y' : 'ies'}, ${[...columns.values()].map(list => list.length).join('/')} columns`)
	check('price sheet after: rows carry their category values', typed.length > 0 && typed.every(row => Object.keys(row.values ?? {}).length > 0), `${typed.length} rows`)
	check('price sheet after: no «Матеріал» (deprecated, null)', sheet.every(row => row.material == null), `${sheet.filter(row => row.material != null).length} left`)
}
for (const key of ['partner_categories', 'partner_skus', 'partner_availability', 'price_sheet', 'partner_lookup'])
	if (ac[key] !== undefined) ac[key] = unrename(ac[key])
// The newly coloured SKUs change on purpose (SKU name, colour, variant): compared separately below.
const skuOf = row => row?.article ?? row?.sku ?? null
const withoutColored = list => (Array.isArray(list) ? list.filter(row => !coloredSkus.has(skuOf(row))) : list)
const coloredSheet = (after.capture.price_sheet ?? []).filter(row => coloredSkus.has(row.article))
if (N) {
	check('price sheet after: newly coloured SKUs carry their dictionary colour', coloredSheet.length === N && coloredSheet.every(row => String(row.color ?? '').includes(colored[row.article])), `${coloredSheet.length}/${N}`)
	for (const key of ['partner_skus', 'price_sheet', 'partner_lookup']) {
		bc[key] = withoutColored(bc[key])
		ac[key] = withoutColored(ac[key])
	}
}
// The order of a list sorted by name may move with the longer names: compared as sets.
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && eq(a.map(x => JSON.stringify(x)).sort(), b.map(x => JSON.stringify(x)).sort())
if (insert) {
	const sheet = after.capture.price_sheet ?? []
	const named = sheet.filter(row => String(row.name ?? '').includes(addition)).length
	check('price sheet after: every name carries the addition', sheet.length > 0 && named === sheet.length, `${named}/${sheet.length}`)
}
// A failed request leaves the same empty list on both sides, which compares equal and passes without
// checking anything (audit, 2026-11-07: partner API 500 twice → ALL CHECKS PASSED). So every request
// must answer 200 and every list be read to its end; the one allowed SKIP is a capture made without
// PARTNER_TOKEN on both sides (every answer 401), as the PDF without ADMIN_COOKIE. A capture without
// `partner_errors` predates this record and fails.
const answers = side => side.partner_errors ?? [{ path: 'no partner_errors (older capture.mjs)', status: '— capture again' }]
const partnerSkipped = [bc, ac].every(side => side.partner_token === false && side.partner_errors?.every(e => e.status === 401))
if (partnerSkipped) skip('partner API answers', 'no PARTNER_TOKEN (401 before and after)')
else for (const [name, side] of [['before', before.capture], ['after', after.capture]])
	check(`partner API ${name}: every request 200, SKUs listed`, answers(side).length === 0 && side.partner_skus?.length > 0,
		answers(side).length ? answers(side).slice(0, 3).map(e => `${e.path} ${e.status}`).join(', ') : `${side.partner_skus?.length ?? 0} SKUs`)
check('price sheet: every page 200 before and after', !before.capture.price_sheet_error && !after.capture.price_sheet_error,
	[before.capture.price_sheet_error, after.capture.price_sheet_error].map(e => e?.status ?? 200).join(' / '))
for (const key of ['partner_categories', 'partner_skus', 'partner_availability', 'price_sheet'])
	if (partnerSkipped && key.startsWith('partner_')) skip(`${key} unchanged`, 'no PARTNER_TOKEN (401 before and after)')
	else check(`${key} unchanged${insert ? ' (but for the name addition)' : ''}`, (eq(bc[key], ac[key]) || sameSet(bc[key], ac[key])) && bc[key] !== undefined, Array.isArray(ac[key]) ? `${ac[key].length} rows` : '')
// The admin PDF needs ADMIN_COOKIE; without it (401 on both sides) the check is skipped, not failed.
// A cookie that was given but refused (expired) is a FAIL, not a SKIP.
if (bc.pdf_status === 401 && ac.pdf_status === 401 && !bc.admin_cookie && !ac.admin_cookie) skip('pdf_text unchanged', 'no ADMIN_COOKIE (401 before and after)')
else {
	check('pdf generated', bc.pdf_status === 201 && ac.pdf_status === 201, `${bc.pdf_status} / ${ac.pdf_status}`)
	// Longer names wrap differently in the PDF table, so its text is not compared line by line:
	// the same SKUs must be listed, and the names must carry the addition.
	const skusOf = text => (String(text ?? '').match(/FL-\d+/g) ?? []).sort()
	check('pdf: same SKUs', bc.pdf_text !== undefined && eq(skusOf(bc.pdf_text), skusOf(ac.pdf_text)), `${skusOf(ac.pdf_text).length} SKU mentions`)
	if (insert) {
		// A narrow name cell wraps after a hyphen («3D-» / «друку»): the line break is not a space.
		const text = String(ac.pdf_text_raw ?? ac.pdf_text).replace(/-\n/g, '-').replace(/\s+/g, ' ')
		check('pdf: names carry the addition', text.includes(addition), `${text.split(addition).length - 1} name cell(s)`)
	}
}
// Lookup: only the value of the colour row may differ, and the new value must be the SKU's own colour.
const colourRow = row => row?.key === 'kolir' || row?.label === 'Колір'
const blank = card => JSON.parse(JSON.stringify(card), (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && colourRow(v) ? { ...v, value: '<colour>' } : v))
const colourOf = card => { let found; JSON.parse(JSON.stringify(card), (k, v) => { if (v && typeof v === 'object' && colourRow(v) && !Array.isArray(v) && found === undefined) found = v.value; return v }); return found }
const nameOf = card => { const s = JSON.stringify(card); const m = s.match(/"name":"([^"]*)"/); return m ? m[1] : '' }
let sameCards = 0, colourOnly = 0, colourInName = 0
const otherDiff = []
bc.partner_lookup.forEach((b, i) => {
	const a = ac.partner_lookup[i]
	if (eq(a, b)) return sameCards++
	if (!eq(blank(a), blank(b))) return otherDiff.push(i)
	colourOnly++
	if (nameOf(a).includes(colourOf(a))) colourInName++
})
if (partnerSkipped) skip('partner lookup', 'no PARTNER_TOKEN (401 before and after)')
else {
	check('partner lookup: same number of cards', bc.partner_lookup.length === ac.partner_lookup.length, `${ac.partner_lookup.length}`)
	check('partner lookup: only the «Колір» value differs', otherDiff.length === 0, `${sameCards} identical, ${colourOnly} colour value only${otherDiff.length ? `, other differences at ${otherDiff.slice(0, 5).join(', ')}` : ''}`)
	check('partner lookup: new colour = colour in the SKU name', colourInName === colourOnly, `${colourInName}/${colourOnly}`)
}
// Feed: identical except lines whose only change is a date-time (promotion window = generation time),
// the name addition in titles, and the highlights (now the characteristics the page shows).
// `g:custom_label_4` is counted from the paid orders of the last 90 days at every generation: one
// order paid, or one growing 90 days old, between the two snapshots moves a SKU across «popular» /
// «bestseller» — the shop's sales, not the migration (audit 14.11.2026). Compared as present.
const stamp = s => s
	.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, '<time>')
	.replace(/<g:custom_label_4>[^<]*<\/g:custom_label_4>/, '<g:custom_label_4><sales></g:custom_label_4>')
const highlight = line => line.trim().startsWith('<g:product_highlight>')
const feedAfter = insert ? String(ac.feed).split(insert).join('') : String(ac.feed)
if (insert) check('feed after: titles carry the addition', String(ac.feed).includes(insert), `${String(ac.feed).split(insert).length - 1} occurrence(s)`)
const itemsAfter = feedAfter.split('</item>').slice(0, -1)
check('feed after: every item has highlights', itemsAfter.length > 0 && itemsAfter.every(item => item.includes('<g:product_highlight>')), `${(feedAfter.match(/<g:product_highlight>/g) ?? []).length} highlights`)
// Items of the newly coloured SKUs differ on purpose (title, colour): left out of the line comparison.
const dropColored = xml => (N ? xml.replace(/<item>[\s\S]*?<\/item>\n?/g, item => (coloredSkus.has((item.match(/<g:id>([^<]*)<\/g:id>/) ?? [])[1]) ? '' : item)) : xml)
if (N) {
	const coloredItems = (feedAfter.match(/<item>[\s\S]*?<\/item>/g) ?? []).filter(item => coloredSkus.has((item.match(/<g:id>([^<]*)<\/g:id>/) ?? [])[1]))
	check('feed after: newly coloured SKUs have g:color', coloredItems.length === N && coloredItems.every(item => item.includes('<g:color>')), `${coloredItems.length}/${N}`)
}
const fb = dropColored(String(bc.feed)).split('\n').filter(line => !highlight(line)), fa = dropColored(feedAfter).split('\n').filter(line => !highlight(line))
const feedDiff = [], feedTime = []
for (let i = 0; i < Math.max(fb.length, fa.length); i++) if (fb[i] !== fa[i]) (stamp(fb[i] ?? '') === stamp(fa[i] ?? '') ? feedTime : feedDiff).push(i)
const items = s => (String(s).match(/<item>/g) ?? []).length
check('feed: same items', ac.feed_status === 200 && items(bc.feed) === items(ac.feed), `${items(ac.feed)} items`)
check(`feed: no change except date-times, the sales label${insert ? ', the name addition' : ''} and highlights`, feedDiff.length === 0, `${feedTime.length} line(s) differ only by a date-time or the sales label${feedDiff.length ? `; other: ${JSON.stringify(fa[feedDiff[0]]).slice(0, 160)}` : ''}`)

console.log(failed ? `\n${failed} check(s) FAILED — stop (runbook §4)` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
