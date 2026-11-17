// Section-by-section comparison of two `capture.mjs` outputs; prints what differs and examples.
// Usage: node compare.cjs <before.json> <after.json>
const [aPath, bPath] = process.argv.slice(2)
const path = require('path')
const a = require(path.resolve(aPath)), b = require(path.resolve(bPath))
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y)
for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
	if (eq(a[key], b[key])) { console.log('SAME   ', key); continue }
	if (Array.isArray(a[key]) && Array.isArray(b[key])) {
		const diffs = []
		const n = Math.max(a[key].length, b[key].length)
		for (let i = 0; i < n; i++) if (!eq(a[key][i], b[key][i])) diffs.push(i)
		console.log('DIFF   ', key, `${a[key].length} vs ${b[key].length}, differing rows: ${diffs.length}`)
		const fields = new Map()
		for (const i of diffs) {
			const x = a[key][i] ?? {}, y = b[key][i] ?? {}
			for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) if (!eq(x[f], y[f])) fields.set(f, (fields.get(f) ?? 0) + 1)
		}
		console.log('        fields:', JSON.stringify(Object.fromEntries(fields)))
		if (diffs.length) {
			const i = diffs[0]
			for (const f of fields.keys()) console.log('        e.g.', f, JSON.stringify(a[key][i]?.[f])?.slice(0, 300), '→', JSON.stringify(b[key][i]?.[f])?.slice(0, 300))
		}
	} else if (typeof a[key] === 'string' && typeof b[key] === 'string') {
		const la = a[key].split('\n'), lb = b[key].split('\n')
		const diff = []
		for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) diff.push(i)
		console.log('DIFF   ', key, `lines ${la.length} vs ${lb.length}, differing lines: ${diff.length}`)
		for (const i of diff.slice(0, 4)) console.log('        ', JSON.stringify(la[i]?.slice(0, 160)), '\n      → ', JSON.stringify(lb[i]?.slice(0, 160)))
	} else console.log('DIFF   ', key, JSON.stringify(a[key]).slice(0, 200), '→', JSON.stringify(b[key]).slice(0, 200))
}
