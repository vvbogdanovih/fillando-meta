// The backend's catalogue sitemap export as one document: `GET /catalog/sitemap` is an index of
// parts (Plan-0010 B05, each part ≤ 50 000 URLs and ≤ 2 MiB under one revision) and every part is
// read with the index's revision/epoch. Concatenated in index order the parts are exactly the single
// export the backend gave before the split ({variants, categories, landings}, same order).
export async function readCatalogSitemap(base, headers = {}) {
	const get = async path => {
		const response = await fetch(base + path, { headers })
		return { status: response.status, body: await response.json().catch(() => null) }
	}
	const index = await get('/catalog/sitemap')
	if (index.status !== 200) return index
	const body = { variants: [], categories: [], landings: [] }
	for (const part of index.body.parts) {
		const query = new URLSearchParams({
			revision: String(index.body.revision),
			epoch: String(index.body.epoch),
			...(part.from === null ? {} : { from: part.from }),
			...(part.to === null ? {} : { to: part.to })
		})
		const read = await get(`/catalog/sitemap/part?${query}`)
		if (read.status !== 200) return read
		for (const key of Object.keys(body)) body[key].push(...read.body[key])
	}
	return { status: 200, body, parts: index.body.parts.length }
}

/** Every `<loc>` of a storefront sitemap, following a sitemap index into its files. */
export async function storefrontSitemapUrls(origin, url = `${origin}/sitemap.xml`) {
	const text = await (await fetch(url)).text()
	const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
	if (!text.includes('<sitemapindex')) return locs
	const nested = []
	for (const loc of locs) nested.push(...(await storefrontSitemapUrls(origin, origin + new URL(loc).pathname)))
	return nested
}
