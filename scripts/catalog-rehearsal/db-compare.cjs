#!/usr/bin/env node
// Read-only: byte-compares two MongoDB databases collection by collection (documents sorted by
// _id, BSON bytes) and their indexes. Used after a rehearsal's restore/cleanup to prove the copy
// is back to the reference dump (Plan-0010 R01, D08). Never writes; prints no document content,
// only ids of differing documents.
//
//   node db-compare.cjs <uriA> <dbA> <uriB> <dbB> [--ignore=catalog_control,catalog_operations]
//
// Needs the `mongodb` package: run with NODE_PATH=<fillando-be>/node_modules.
const { createHash } = require('node:crypto')
const { MongoClient, BSON } = require('mongodb')

async function describe(db) {
	const result = {}
	for (const { name } of await db.listCollections({ type: 'collection' }).toArray()) {
		const digest = createHash('sha256')
		const docs = new Map()
		for await (const row of db.collection(name).find({}).sort({ _id: 1 })) {
			const bytes = BSON.serialize(row)
			digest.update(bytes)
			docs.set(String(row._id), createHash('sha256').update(bytes).digest('hex'))
		}
		const indexes = (await db.collection(name).indexes())
			.map(({ v, ns, ...index }) => JSON.stringify(index))
			.sort()
		result[name] = { count: docs.size, hash: digest.digest('hex'), docs, indexes }
	}
	return result
}

async function main([uriA, dbA, uriB, dbB, ...flags]) {
	if (!dbB) throw Error('Usage: db-compare.cjs <uriA> <dbA> <uriB> <dbB> [--ignore=a,b]')
	const ignore = new Set(
		(flags.find(flag => flag.startsWith('--ignore='))?.slice(9) ?? '').split(',').filter(Boolean)
	)
	const a = await new MongoClient(uriA, { serverSelectionTimeoutMS: 5000 }).connect()
	const b = await new MongoClient(uriB, { serverSelectionTimeoutMS: 5000 }).connect()
	try {
		const [left, right] = await Promise.all([describe(a.db(dbA)), describe(b.db(dbB))])
		const names = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
		const report = { identical: [], different: {}, only_a: [], only_b: [], ignored: [] }
		let documents = 0
		for (const name of names) {
			if (ignore.has(name)) {
				report.ignored.push(name)
				continue
			}
			if (!right[name]) {
				report.only_a.push(name)
				continue
			}
			if (!left[name]) {
				report.only_b.push(name)
				continue
			}
			const [x, y] = [left[name], right[name]]
			const sameIndexes = JSON.stringify(x.indexes) === JSON.stringify(y.indexes)
			if (x.hash === y.hash && sameIndexes) {
				report.identical.push(name)
				documents += x.count
				continue
			}
			const changed = [...x.docs].filter(([id, hash]) => y.docs.has(id) && y.docs.get(id) !== hash)
			report.different[name] = {
				count_a: x.count,
				count_b: y.count,
				indexes_equal: sameIndexes,
				changed: changed.length,
				changed_ids: changed.slice(0, 5).map(([id]) => id),
				only_a_ids: [...x.docs.keys()].filter(id => !y.docs.has(id)).slice(0, 5),
				only_b_ids: [...y.docs.keys()].filter(id => !x.docs.has(id)).slice(0, 5)
			}
		}
		console.log(
			JSON.stringify(
				{ identical_collections: report.identical.length, identical_documents: documents, ...report },
				null,
				1
			)
		)
		process.exitCode =
			Object.keys(report.different).length || report.only_a.length || report.only_b.length ? 2 : 0
	} finally {
		await Promise.all([a.close(), b.close()])
	}
}

main(process.argv.slice(2)).catch(error => {
	console.error(error.message)
	process.exitCode = 1
})
