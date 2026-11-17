#!/usr/bin/env node
// Synthetic large catalogue for the D06 acceptance load (Plan-0010 B05/B06/R01): ~10 000 v2
// categories (groups three levels deep, product categories at the leaves) and ~100 000 active
// SKUs with typed characteristics, a colour axis on half of the categories and a numeric axis on
// the rest. No real data: names, prices and colours are generated. Writes ONLY to a database
// named `fillando_load_YYYYMMDD` on the local MongoDB 127.0.0.1:27019 and refuses anything else;
// `--replace` drops that database first. Indexes are left to the API (Mongoose schema indexes at
// start-up), i.e. the same set production has.
//
//   NODE_PATH=<fillando-be>/node_modules node large-fixture.cjs fillando_load_20261028 [--replace]
//     [--roots=20] [--branches=10] [--leaves=49] [--big=50] [--big-skus=1025] [--small-skus=5]
//     [--promo=2]   (per cent of SKUs on promotion: open-ended, dated or already ended)
//     [--images=3]  (photos per SKU; with them and the visible «Виробник» characteristic every SKU
//                   is a real Google feed item, as migrated filament is — 0 excludes them all)
//     [--description=long|short]  (short: the one-line description of the 29.10 fixture; with
//                   --images=0 it reproduces that fixture for before/after comparisons)
//     [--name-length=N]  (pad every category name to N characters, e.g. 200 for the ancestors
//                   stress of a chain — Plan-0010 D06.4)
//     [--shape=chain:20000 | --shape=wide:150000]
//       TD-0013 §6 stress trees instead of the catalogue: a chain of nested groups ending in one
//       product category (40 SKUs), or one group with that many product categories below it
//       (one SKU in every 50th). The database may then carry a suffix: fillando_load_YYYYMMDD_chain.
const { MongoClient, ObjectId } = require('mongodb')

const args = process.argv.slice(2)
const name = args[0]
const flag = (key, fallback) => {
	const found = args.find(arg => arg.startsWith(`--${key}=`))
	return found ? Number(found.split('=')[1]) : fallback
}
if (!/^fillando_load_\d{8}(_[a-z]+)?$/.test(name ?? '')) {
	console.error('Database must be fillando_load_YYYYMMDD (local synthetic fixture only).')
	process.exit(2)
}
const ROOTS = flag('roots', 20)
const BRANCHES = flag('branches', 10)
const LEAVES = flag('leaves', 49)
const BIG = flag('big', 50)
const BIG_SKUS = flag('big-skus', 1025)
const SMALL_SKUS = flag('small-skus', 5)
const PROMO = flag('promo', 2)
const IMAGES = flag('images', 3)
const SHORT = args.includes('--description=short')
const NAME_LENGTH = flag('name-length', 0)
const named = name => (NAME_LENGTH > name.length ? `${name} ${'я'.repeat(NAME_LENGTH - name.length - 1)}` : name)
const SHAPE = (args.find(arg => arg.startsWith('--shape=')) ?? '').slice(8)

const FAMILIES = [
	'black', 'white', 'gray', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
	'brown', 'gold', 'silver', 'transparent', 'multicolor'
]
const BRANDS = Array.from({ length: 40 }, (_, i) => `Brand ${i + 1}`)
const MATERIALS = ['Сталь', 'Алюміній', 'Пластик', 'Дерево', 'Скло', 'Бавовна', 'Кераміка']
const definition = (key, label, value_type, extra = {}) => ({
	key,
	label,
	value_type,
	unit: null,
	is_required: false,
	filter_enabled: true,
	filter_type: 'multi-select',
	visible_in_specs: true,
	order: 0,
	multiple: false,
	semantic: 'generic',
	options: [],
	...extra
})

const definitionsOf = colour => [
	definition('brand_text', 'Виробник', 'string', { order: 0 }),
	definition('power', 'Потужність', 'number', { unit: 'Вт', filter_type: 'range', order: 1 }),
	definition('wifi', 'Wi-Fi', 'boolean', { order: 2 }),
	definition('material', 'Матеріал', 'string', { semantic: 'material', order: 3 }),
	// The variation of every product: required, as every variation is (owner, 2026-11-06).
	colour
		? definition('color', 'Колір', 'string', { semantic: 'color', is_required: true, filter_enabled: false, filter_type: null, order: 4 })
		: definition('size', 'Розмір', 'number', { unit: 'см', semantic: 'size', is_required: true, filter_type: 'range', order: 4 })
]

;(async () => {
	const client = await MongoClient.connect('mongodb://127.0.0.1:27019', {
		appName: 'fillando-large-fixture'
	})
	const db = client.db(name)
	const existing = await db.listCollections().toArray()
	if (existing.length && !args.includes('--replace')) {
		console.error(`${name} is not empty; pass --replace to rebuild it.`)
		process.exit(2)
	}
	if (existing.length) await db.dropDatabase()
	const started = Date.now()
	let seed = 42
	const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
	const pick = list => list[Math.floor(random() * list.length)]

	const colors = FAMILIES.flatMap((family, f) =>
		[0, 1, 2].map(n => ({
			_id: new ObjectId(),
			name_uk: `${family} ${n + 1}`,
			name_en: `${family} ${n + 1}`,
			slug: `${family}-${n + 1}`,
			family,
			hex_stops: [`#${(f * 17 + n * 40).toString(16).padStart(2, '0')}4060`],
			order: f * 3 + n
		}))
	)
	await db.collection('colors').insertMany(colors)

	const now = new Date()
	const categories = []
	const leaves = []
	let order = 0
	if (SHAPE) {
		const [kind, size] = SHAPE.split(':')
		const nodes = Number(size)
		if (!['chain', 'wide'].includes(kind) || !(nodes >= 2)) throw Error('--shape=chain:N or wide:N')
		const root = new ObjectId()
		categories.push({ _id: root, parent_id: null, name: 'Stress', slug: `stress-${kind}`, kind: 'group' })
		let parent = root
		for (let n = 1; n < nodes; n++) {
			const _id = new ObjectId()
			const last = n === nodes - 1
			const product = kind === 'wide' || last
			categories.push({
				_id,
				parent_id: parent,
				name: `${kind === 'chain' ? 'Рівень' : 'Категорія'} ${n}`,
				slug: `stress-${kind}-${n}`,
				kind: product ? 'product' : 'group',
				...(product ? { attribute_definitions: definitionsOf(false) } : {})
			})
			if (kind === 'chain') parent = _id
			if (product && (kind === 'chain' || n % 50 === 1)) leaves.push({ _id, colour: false, skus: kind === 'chain' ? 40 : 1 })
		}
	}
	for (let r = 0; r < (SHAPE ? 0 : ROOTS); r++) {
		const root = new ObjectId()
		categories.push({ _id: root, parent_id: null, name: `Розділ ${r + 1}`, slug: `load-r${r + 1}`, kind: 'group' })
		for (let b = 0; b < BRANCHES; b++) {
			const branch = new ObjectId()
			categories.push({ _id: branch, parent_id: root, name: `Група ${r + 1}.${b + 1}`, slug: `load-r${r + 1}-b${b + 1}`, kind: 'group' })
			for (let l = 0; l < LEAVES; l++) {
				const leaf = new ObjectId()
				const colour = (r + b + l) % 2 === 0
				const definitions = definitionsOf(colour)
				categories.push({
					_id: leaf,
					parent_id: branch,
					name: `Категорія ${r + 1}.${b + 1}.${l + 1}`,
					slug: `load-r${r + 1}-b${b + 1}-l${l + 1}`,
					kind: 'product',
					attribute_definitions: definitions
				})
				leaves.push({ _id: leaf, colour })
			}
		}
	}
	for (let at = 0; at < categories.length; at += 20000)
	await db.collection('categories').insertMany(
		categories.slice(at, at + 20000).map(row => ({
			order: order++,
			status: 'active',
			attribute_contract_version: 2,
			attribute_definitions: [],
			required_attributes: [],
			image: null,
			seo: { title: null, description: null, h1: null, intro_html: null, bottom_html: null },
			createdAt: now,
			updatedAt: now,
			...row,
			name: named(row.name)
		}))
	)

	// A few big categories (where the facets work hard) and a long tail of small ones.
	let sku = 0
	let products = []
	let variants = []
	const flush = async (force = false) => {
		if (force || variants.length >= 20000) {
			if (products.length) await db.collection('products').insertMany(products)
			if (variants.length) await db.collection('product_variants').insertMany(variants)
			products = []
			variants = []
		}
	}
	for (const [index, leaf] of leaves.entries()) {
		const total = leaf.skus ?? (index < BIG ? BIG_SKUS : SMALL_SKUS)
		for (let made = 0; made < total; ) {
			const productId = new ObjectId()
			const count = Math.min(4, total - made)
			const brand = pick(BRANDS)
			products.push({
				_id: productId,
				name: `Товар ${productId.toHexString().slice(-8)}`,
				category_id: leaf._id,
				vendor_id: null,
				description: {
					html: SHORT
						? '<p>Синтетичний товар для заміру навантаження.</p>'
						: `<p>Синтетичний товар ${productId.toHexString().slice(-8)} для заміру навантаження.</p><p>${'Опис характеристик, комплектації й застосування. '.repeat(8)}</p>`,
					json: {}
				},
				attributes: [],
				attributes_v2: [
					{ k: 'brand_text', v: brand },
					{ k: 'power', v: 100 + Math.floor(random() * 3000) },
					{ k: 'wifi', v: random() > 0.5 },
					{ k: 'material', v: pick(MATERIALS) }
				],
				variant_axis: { key: leaf.colour ? 'color' : 'size' },
				createdAt: now,
				updatedAt: now
			})
			const used = new Set()
			for (let v = 0; v < count; v++) {
				let color
				do color = pick(colors)
				while (leaf.colour && used.has(String(color._id)))
				used.add(String(color._id))
				sku++
				const price = 100 + Math.floor(random() * 5000)
				// A share of SKUs on promotion (TD-0012): the price order and bounds must use the
				// effective price; a third end in a week, a third have already ended.
				const promo = random() * 100 < PROMO ? Math.floor(random() * 3) : -1
				variants.push({
					_id: new ObjectId(),
					product_id: productId,
					category_id: leaf._id,
					name: `Товар ${productId.toHexString().slice(-8)} — ${leaf.colour ? color.name_uk : `${40 + v * 10} см`}`,
					slug: `load-sku-${sku}`,
					sku: `LD-${String(sku).padStart(6, '0')}`,
					price,
					stock: random() > 0.2 ? Math.floor(random() * 50) : 0,
					images: Array.from({ length: IMAGES }, (_, k) => `https://cdn.example.invalid/load/${sku}-${k + 1}.webp`),
					status: 'active',
					v_value: leaf.colour ? color.name_en : String(40 + v * 10),
					variant_value: leaf.colour ? String(color._id) : 40 + v * 10,
					...(leaf.colour ? { color_id: color._id, color_family: color.family } : {}),
					weight_g: 500 + Math.floor(random() * 2000),
					...(promo < 0
						? {}
						: {
								promo_percent: 5 + Math.floor(random() * 40),
								...(promo === 0 ? {} : { promo_ends_at: new Date(now.getTime() + (promo === 1 ? 7 : -7) * 86400000) })
							}),
					price_updated_at: now,
					createdAt: now,
					updatedAt: now
				})
			}
			made += count
		}
		await flush()
	}
	await flush(true)
	await db.collection('catalog_control').insertOne({
		_id: 'catalog',
		revision: 1,
		epoch: 1,
		phase: 'idle',
		operation_id: null,
		owner_id: null,
		writes_started: false,
		admin_draft_writes_enabled: true
	})
	console.log(
		JSON.stringify({
			database: name,
			categories: categories.length,
			product_categories: leaves.length,
			products: await db.collection('products').estimatedDocumentCount(),
			skus: sku,
			seconds: Math.round((Date.now() - started) / 100) / 10
		})
	)
	await client.close()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
