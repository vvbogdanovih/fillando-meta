#!/usr/bin/env node
// The catalogue v2 release in one command (Plan-0010 R02; runbook docs/runbooks/catalog-v2-release.md
// §3.4–3.10, owner decision 02.11.2026): backup and its restore check → baseline → dry-run → apply →
// verify → storefront cache purge → new admin writes on → SEO statuses. It runs the same tools the
// runbook lists (fillando-be catalog-v2-migrate.cjs / catalog-admin-writes.cjs, scripts/catalog-rehearsal/*)
// in that order, stops at the first unexpected result and says what to do; a second run continues
// from the step that stopped (state in <dir>/release-state.json, bound to the database, API and
// storefront it was started for). A migration that was interrupted — the catalogue stays closed —
// is continued by the same command (`resume`); Ctrl-C is refused while it runs.
//
//   node scripts/catalog-release.mjs            # release; asks for what it needs
//   node scripts/catalog-release.mjs --api=http://localhost:9001 --site=http://localhost:9000  # local rehearsal
//
// There is no in-place undo (owner decision 06.11.2026): a failed release is rolled back by restoring
// the catalogue from this release's own backup (runbook §5).
//
// The database is the backend's DATABASE_URL — the environment, else fillando-be/.env, as the app reads
// it (owner decision 02.11.2026): the local copy for a rehearsal, the production URI on release day.
// It must name `fillando-prod`; a local database needs local --api/--site and a remote one remote ones.
// Options: --api=https://api.fillando.com --site=https://fillando.com --be=<fillando-be checkout>
//   --dir=~/fillando-release-YYYYMMDD --expect=<dry-run JSON of rehearsal В> --assume-yes (rehearsals only)
// Secrets come from the environment or a hidden prompt, never from arguments:
//   INTERNAL_API_TOKEN, REVALIDATE_SECRET (required),
//   PARTNER_TOKEN, ADMIN_COOKIE (optional: without them the partner and PDF checks are skipped).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

process.umask(0o077)
const META = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const flags = Object.fromEntries(
	process.argv.slice(2).map(arg => {
		const [key, ...value] = arg.replace(/^--/, '').split('=')
		return [key, value.length ? value.join('=') : true]
	})
)
const known = ['api', 'site', 'be', 'dir', 'expect', 'assume-yes']
const unknown = Object.keys(flags).filter(key => !known.includes(key))
if (unknown.length) {
	console.error(`Невідомі параметри: ${unknown.join(', ')}. Див. заголовок scripts/catalog-release.mjs`)
	process.exit(2)
}
const API = String(flags.api ?? 'https://api.fillando.com').replace(/\/$/, '')
const SITE = String(flags.site ?? 'https://fillando.com').replace(/\/$/, '')
const BE = path.resolve(String(flags.be ?? path.join(META, 'repos/fillando-be')))
const today = new Date().toISOString().slice(0, 10).replaceAll('-', '')
// `--dir=~/x`: the shell leaves a tilde after `=` alone, and a literal «~» folder would appear here.
const DIR = path.resolve(String(flags.dir ?? path.join(os.homedir(), `fillando-release-${today}`)).replace(/^~(?=\/|$)/, os.homedir()))
const STATE_FILE = path.join(DIR, 'release-state.json')
const LOG = path.join(DIR, 'release.log')
const PROBES = path.join(META, 'scripts/catalog-rehearsal')
const CHECK_URI = 'mongodb://127.0.0.1:27019' // backup-manifest reads the restore check only there
const STARTED = Date.now()

mkdirSync(DIR, { recursive: true })
// The journal takes an operation id once: unique per attempt, so a release repeated after a restore
// (same day, new --dir) or an attempt after a refused one never reuses an id the journal holds.
const newOp = () => `filament-v2-${today}-${new Date().toISOString().slice(11, 19).replaceAll(':', '')}`
const state = existsSync(STATE_FILE)
	? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
	: { date: today, op: newOp(), done: {} }
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 1))
const D = state.date
const CHECK_DB = `fillando_release_check_${D}`
const ARCHIVE = path.join(DIR, `fillando-prod-${D}.archive`)
const MANIFEST = `${ARCHIVE}.manifest.json`

// ---------------------------------------------------------------- output and prompts
const paint = (code, text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text)
const log = line => appendFileSync(LOG, `${line}\n`)
const say = (text = '') => {
	console.log(text)
	log(text)
}
const step = (n, title) => say(`\n${paint('1;36', `━━ ${n}. ${title}`)}`)
const ok = text => say(`${paint('32', '✔')} ${text}`)
const warn = text => say(`${paint('33', '!')} ${text}`)
/** `rerun: false` — the same command would stop here again (a wrong directory, another operation). */
function stop(text, next = [], { rerun = true } = {}) {
	// `process.exit` skips every `finally`: what a step would have cleaned up is cleaned here — the
	// running tool (never the migration: it is not interrupted) and mongodump's file with the URI.
	if (running && !critical) running.kill()
	rmSync(path.join(DIR, '.mongodump.yaml'), { force: true })
	say(`\n${paint('1;31', '✖ ЗУПИНКА:')} ${text}`)
	for (const line of next) say(`  → ${line}`)
	if (rerun)
		say(`\nСтан збережено (${STATE_FILE}); після виправлення запустіть ту саму команду${flags.dir ? ` (з тим самим --dir=${flags.dir})` : ''} — вона продовжить з цього кроку.`)
	if (state.remote)
		say(`${paint('33', '!')} У fillando-be/.env зараз production: не запускайте там \`yarn start:dev\`, а після релізу поверніть DATABASE_URL на локальну базу.`)
	process.exit(1)
}
// Ctrl-C. A prompt puts the terminal in raw mode, where readline gets the key instead of the process
// (and, with no listener, only closes itself — the script would run on, answering «ні» to every later
// question; audit 14.11.2026). Both routes end here. During the migration an interrupt would leave
// the catalogue closed (503 for shoppers), so it is refused; the child runs in its own process group.
let critical = null
let running = null
function interrupt() {
	if (critical) return say(`\n${paint('1;33', '!')} ${critical}: переривання лишить каталог закритим для покупців — дочекайтеся завершення.`)
	stop('Перервано оператором (Ctrl-C).')
}
process.on('SIGINT', interrupt)
// One line reader for every question: piped answers (rehearsals) arrive in one chunk, and a reader
// per question would drop the lines the previous one had already read.
let input = null
let muted = false
function reader() {
	if (!input) {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) })
		const write = rl._writeToOutput.bind(rl)
		rl._writeToOutput = text => {
			if (!muted) write(text)
		}
		rl.on('SIGINT', interrupt)
		input = { rl, lines: rl[Symbol.asyncIterator]() }
	}
	return input
}
async function readLine(text, { hidden = false } = {}) {
	const { lines } = reader()
	process.stdout.write(text)
	muted = hidden
	const { value = '' } = await lines.next()
	muted = false
	if (hidden && process.stdin.isTTY) process.stdout.write('\n')
	return value.trim()
}
async function ask(question) {
	if (flags['assume-yes']) {
		say(`${question} так (--assume-yes)`)
		return true
	}
	const answer = await readLine(`${question} [так/ні] `)
	if (!process.stdin.isTTY) console.log(answer)
	log(`${question} ${answer}`)
	return /^(так|т|yes|y)$/i.test(answer)
}
async function secret(name, description, { optional = false } = {}) {
	if (process.env[name]) return process.env[name]
	if (flags['assume-yes'] && optional) return ''
	if (!process.stdin.isTTY) {
		if (optional) return ''
		stop(`${name} не задано, а запитати немає де (не термінал).`)
	}
	const value = await readLine(`${name} — ${description}${optional ? ' (Enter — пропустити)' : ''}: `, { hidden: true })
	if (!value && !optional) stop(`${name} обов'язковий.`)
	return value
}

// ---------------------------------------------------------------- child processes
const baseEnv = () => {
	const env = { ...process.env }
	for (const key of ['DATABASE_URL', 'INTERNAL_API_TOKEN', 'PARTNER_TOKEN', 'ADMIN_COOKIE', 'REVALIDATE_SECRET'])
		delete env[key]
	return env
}
/** Runs a command, mirrors its output to the screen and the log, returns {code, stdout, stderr}. */
function run(command, args, { cwd = META, env = baseEnv(), quiet = false, detached = false } = {}) {
	log(`$ ${command} ${args.join(' ')}`)
	return new Promise(resolve => {
		const child = spawn(command, args, { cwd, env, detached, stdio: ['ignore', 'pipe', 'pipe'] })
		running = child
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', chunk => {
			stdout += chunk
			log(String(chunk).trimEnd())
			if (!quiet) process.stdout.write(chunk)
		})
		child.stderr.on('data', chunk => {
			stderr += chunk
			log(String(chunk).trimEnd())
			if (!quiet) process.stderr.write(chunk)
		})
		child.on('close', code => {
			if (running === child) running = null
			resolve({ code, stdout, stderr })
		})
		child.on('error', error => resolve({ code: 127, stdout, stderr: String(error.message) }))
	})
}
/** The last JSON document a CLI printed (they print one object, possibly pretty-printed). */
function lastJson(text) {
	const trimmed = text.trim()
	const starts = [0]
	for (let at = trimmed.indexOf('\n{'); at !== -1; at = trimmed.indexOf('\n{', at + 1)) starts.push(at + 1)
	for (const start of starts.reverse())
		try {
			return JSON.parse(trimmed.slice(start))
		} catch {
			// not a whole document from here; try an earlier line
		}
	return null
}

const secrets = {}
// The CLIs get the resolved DATABASE_URL explicitly; backup-manifest reads only the local restore check.
const migrate = (args, { quiet = false, detached = false } = {}) =>
	run('node', ['scripts/catalog-v2-migrate.cjs', ...args], {
		cwd: BE,
		quiet,
		detached,
		env: args[0] === 'backup-manifest' ? baseEnv() : { ...baseEnv(), DATABASE_URL: secrets.uri }
	})
const adminWrites = args =>
	run('node', ['scripts/catalog-admin-writes.cjs', ...args], {
		cwd: BE,
		quiet: true,
		env: { ...baseEnv(), DATABASE_URL: secrets.uri }
	})
const probe = (script, args) =>
	run('node', [path.join(PROBES, script), ...args], {
		env: {
			...baseEnv(),
			INTERNAL_API_TOKEN: secrets.internal,
			...(secrets.partner && { PARTNER_TOKEN: secrets.partner }),
			...(secrets.cookie && { ADMIN_COOKIE: secrets.cookie })
		}
	})
const status = async () => {
	const result = await adminWrites(['status', 'fillando-prod', '--production'])
	if (result.code !== 0) stop(`Не вдалося прочитати стан каталогу: ${result.stderr.trim()}`)
	return lastJson(result.stdout).before
}
const write = (command, extra = []) => [
	command,
	'fillando-prod',
	state.op,
	'--production',
	'--writers-stopped',
	`--confirm=${command}:fillando-prod:${state.op}`,
	`--backup-manifest=${MANIFEST}`,
	...extra
]
/** What the journal knows about this directory's operation: its status, or null when it never started. */
const ownOperation = async () => {
	const result = await migrate(['inspect', 'fillando-prod', state.op, '--production'], { quiet: true })
	return result.code === 0 ? (lastJson(result.stdout) ?? {}) : null
}
const driver = () => createRequire(path.join(BE, 'package.json'))('mongodb')
/** Median round trip to the database: the migration is ~4 of them per target, one after another. */
async function roundTrip() {
	const client = await new (driver().MongoClient)(secrets.uri, { serverSelectionTimeoutMS: 15000 }).connect()
	try {
		const times = []
		for (let i = 0; i < 12; i++) {
			const from = performance.now()
			await client.db('fillando-prod').command({ ping: 1 })
			times.push(performance.now() - from)
		}
		return times.sort((a, b) => a - b)[6]
	} finally {
		await client.close()
	}
}
/**
 * Seconds the catalogue stays closed: four requests per written target, the checks before and after
 * in batches. Measured 15.11.2026 on an idle machine — 360 targets at 40–45 ms took 72 s.
 */
const closedWindow = (targets, rtt) => {
	const low = Math.max(3, Math.round((targets * 4.2 * rtt) / 1000))
	return { low, high: low * 2 + 5 }
}
const duration = seconds => (seconds < 90 ? `${seconds} с` : `${Math.round(seconds / 6) / 10} хв`)
/** Shows where the running migration is (reads the journal's plan, nothing else) until stopped. */
async function watchMigration(targets) {
	const client = await new (driver().MongoClient)(secrets.uri, { serverSelectionTimeoutMS: 15000 }).connect().catch(() => null)
	if (!client) return async () => {}
	const started = Date.now()
	let shown = ''
	const timer = setInterval(async () => {
		const plan = await client.db('fillando-prod').collection('catalog_mutation_plans')
			.findOne({ _id: state.op }, { projection: { checkpoint: 1, phase: 1 } }).catch(() => null)
		const where = !plan ? 'перевірка плану' : plan.phase === 'applying' ? `записано ${plan.checkpoint} з ${targets}` : 'перевірка результату'
		const line = `  … ${where}, ${Math.round((Date.now() - started) / 1000)} с`
		if (process.stdout.isTTY) process.stdout.write(`\r${line}   `)
		else if (where !== shown) console.log(line)
		shown = where
	}, 2000)
	return async () => {
		clearInterval(timer)
		if (process.stdout.isTTY) process.stdout.write('\r\x1b[K')
		await client.close().catch(() => {})
	}
}
/** Seconds until the admin's access cookie (`<name>=<jwt>`) expires; null when it cannot be read. */
function cookieSecondsLeft(cookie) {
	try {
		const payload = JSON.parse(Buffer.from(cookie.split('=').slice(1).join('=').split('.')[1], 'base64url').toString())
		return typeof payload.exp === 'number' ? payload.exp - Date.now() / 1000 : null
	} catch {
		return null
	}
}
/** A snapshot takes a minute or two; a cookie that dies in the middle is a FAIL of the PDF check. */
async function freshCookie(before) {
	if (!secrets.cookie) return
	const left = cookieSecondsLeft(secrets.cookie)
	if (left === null || left > 180) return
	warn(`ADMIN_COOKIE ${left > 0 ? `спливає за ${Math.round(left)} с` : 'уже прострочений'} — для знімка «${before}» потрібен свіжий (DevTools → Application → Cookies)`)
	if (!process.stdin.isTTY || flags['assume-yes']) return
	const value = await readLine('ADMIN_COOKIE — свіжий <ACCSESS_TOKEN_NAME>=<jwt> (Enter — лишити як є): ', { hidden: true })
	if (value) secrets.cookie = value
}

async function purge() {
	for (const resource of ['categories', 'products', 'landings']) {
		let answer
		try {
			answer = await fetch(`${SITE}/api/revalidate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secrets.revalidate },
				body: JSON.stringify({ resource })
			})
		} catch (error) {
			return { resource, status: error.message }
		}
		if (answer.status !== 200) return { resource, status: answer.status }
		ok(`кеш вітрини «${resource}» очищено (200)`)
	}
	return null
}

/** fillando-be/.env as the backend reads it (dotenv) — for a local rehearsal only. */
function backendEnv() {
	const file = path.join(BE, '.env')
	return existsSync(file) ? createRequire(path.join(BE, 'package.json'))('dotenv').parse(readFileSync(file, 'utf8')) : {}
}
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/
const isLocalUrl = url => LOCAL_HOST.test(new URL(url).host)
/** fillando-prod as the backend's DATABASE_URL names it (catalog-cli-target.cjs, the CLIs' own rule). */
function resolveDatabase() {
	const target = createRequire(path.join(BE, 'package.json'))(path.join(BE, 'scripts/catalog-cli-target.cjs'))
	try {
		const where = target.resolveTarget({
			database: 'fillando-prod',
			production: true,
			env: process.env,
			envFiles: target.readEnvFiles(BE)
		})
		secrets.uri = where.uri
		return { hosts: where.hosts, local: where.hosts.every(host => LOCAL_HOST.test(host)) }
	} catch (error) {
		stop(error.message, ['fillando-be/.env: DATABASE_URL=…/fillando-prod — локальна копія для репетиції, production у день релізу'])
	}
}

async function done(key, value = true) {
	state.done[key] = value
	save()
}

// ---------------------------------------------------------------- the release
async function preflight() {
	step(0, 'Перевірка перед стартом')
	say(`API ${API} · вітрина ${SITE} · BE ${BE}`)
	say(`Тека релізу ${DIR} · операція ${state.op}`)
	for (const tool of ['mongodump', 'mongorestore'])
		if (spawnSync(tool, ['--version']).status !== 0)
			stop(`Немає ${tool}.`, ['brew install mongodb-database-tools'])
	if (!existsSync(path.join(BE, 'scripts/catalog-v2-migrate.cjs')) || !existsSync(path.join(BE, 'node_modules/mongodb')))
		stop(`Не знайдено fillando-be з node_modules у ${BE}.`, ['git clone / yarn install, або --be=<шлях>'])
	const head = spawnSync('git', ['-C', BE, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
	const remote = spawnSync('git', ['-C', BE, 'ls-remote', 'origin', 'refs/heads/production'], { encoding: 'utf8' })
		.stdout.split(/\s/)[0]
	if (remote && head === remote) ok(`fillando-be ${head.slice(0, 8)} = гілка production`)
	else if (!(await ask(`fillando-be тут на ${head.slice(0, 8)}, а production — ${remote?.slice(0, 8) || 'невідомо'}. Продовжити все одно?`)))
		stop('Ноутбук має бути на тому самому коміті, що задеплоєний (чек-лист А3).', ['git -C repos/fillando-be fetch && git checkout <коміт production> && yarn install'])
	const { MongoClient } = createRequire(path.join(BE, 'package.json'))('mongodb')
	try {
		const client = await new MongoClient(CHECK_URI, { serverSelectionTimeoutMS: 3000 }).connect()
		await client.close()
		ok('локальний MongoDB 27019 доступний (для перевірки бекапу)')
	} catch {
		stop('Локальний MongoDB 127.0.0.1:27019 недоступний — на ньому перевіряється відновлення бекапу.', ['cd repos/fillando-be && yarn db:up'])
	}

	const database = resolveDatabase()
	// The directory's state belongs to one database and one pair of API and storefront: a rehearsal
	// and the release of the same day share the default directory, and the release would skip the
	// backup, the «before» snapshot and the dry-run the rehearsal had done (audit 14.11.2026).
	const target = { hosts: database.hosts, api: API, site: SITE }
	if (state.target ? !isDeepStrictEqual(state.target, target) : Object.keys(state.done).length > 0)
		stop(
			`Тека ${DIR} — від іншого запуску${state.target ? ` (база ${state.target.hosts.join(', ')}, API ${state.target.api})` : ''}, а зараз база ${database.hosts.join(', ')}, API ${API}.`,
			[`Цей запуск — в окремій теці: додайте --dir=${DIR}-${database.local ? 'rehearsal' : 'prod'}`],
			{ rerun: false }
		)
	state.target = target
	state.remote = !database.local
	save()
	say(`База (DATABASE_URL ${process.env.DATABASE_URL ? 'з оточення' : 'з fillando-be/.env'}): ${database.hosts.join(', ')}/fillando-prod — ${database.local ? 'локальний сервер, репетиція' : paint('1;33', 'віддалений сервер — PRODUCTION')}`)
	// The CLIs run this checkout's working tree, not the commit: an uncommitted edit of the planner,
	// the journal or the mapping would migrate production with code that is deployed nowhere.
	if (!database.local && spawnSync('git', ['-C', BE, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).stdout.trim() &&
		!(await ask('У fillando-be є незакомічені зміни — міграцію виконає саме цей код, а не задеплоєний. Продовжити все одно?')))
		stop('Робоче дерево fillando-be має дорівнювати коміту production (чек-лист А3).', ['git -C repos/fillando-be status'])
	if (isLocalUrl(API) !== database.local || isLocalUrl(SITE) !== database.local)
		stop(`База ${database.local ? 'локальна' : 'віддалена'}, а API ${API} і вітрина ${SITE} — ні: перевіряли б не ту базу, яку мігруємо.`, [
			database.local
				? 'Репетиція: --api=http://localhost:9001 --site=http://localhost:9000 (бекенд і вітрина на цій базі)'
				: 'Реліз: без --api/--site (production за замовчуванням) і DATABASE_URL production у fillando-be/.env'
		])
	if (!(await ask(`Мігруємо саме цю базу (${database.hosts.join(', ')})?`))) stop('Ціль не підтверджено — перевірте DATABASE_URL у fillando-be/.env.')
	if (database.local) {
		// A local rehearsal uses the local setup's own values: fillando-be/.env, or none at all — the
		// storefront outside production accepts a purge without a secret, and the API without the token
		// only applies its ordinary limits.
		const file = backendEnv()
		secrets.internal = process.env.INTERNAL_API_TOKEN || file.INTERNAL_API_TOKEN || ''
		secrets.revalidate = process.env.REVALIDATE_SECRET || file.REVALIDATE_SECRET || ''
		say(`INTERNAL_API_TOKEN, REVALIDATE_SECRET — ${secrets.internal || secrets.revalidate ? 'з оточення або fillando-be/.env' : 'локально не задані, не потрібні'}`)
	} else {
		secrets.internal = await secret('INTERNAL_API_TOKEN', 'з Railway → fillando-be → Variables')
		secrets.revalidate = await secret('REVALIDATE_SECRET', 'з Railway → fillando-fe → Variables')
	}
	secrets.partner = await secret('PARTNER_TOKEN', 'тимчасовий partner-токен (чек-лист А4)', { optional: true })
	secrets.cookie = await secret('ADMIN_COOKIE', '<ACCSESS_TOKEN_NAME>=<jwt> адміна, для PDF', { optional: true })
	if (!secrets.partner) warn('без PARTNER_TOKEN перевірки partner API буде пропущено (SKIP)')
	if (!secrets.cookie) warn('без ADMIN_COOKIE перевірку PDF прайс-листа буде пропущено (SKIP)')

	// The database first: while an operation holds the catalogue, the API answers 503 on every
	// catalogue route, and «новий BE ще не задеплоєно» would send the operator the wrong way.
	const control = await status()
	const held = control.control_present && control.phase !== 'idle'
	if (held && control.operation_id !== state.op)
		stop(
			`Каталог закритий операцією «${control.operation_id}» (phase ${control.phase}) — покупці бачать 503. Це не міграція цієї теки релізу.`,
			[
				'Міграція з іншої теки релізу — запустіть ту саму команду з --dir=<та тека>: вона продовжить її',
				'Перерване збереження адмінки — рунбук §5 «Перервана операція нової адмінки» (catalog-recover.cjs inspect)'
			],
			{ rerun: false }
		)
	if (held) warn(`міграцію ${state.op} перервано (phase ${control.phase}): каталог закритий, покупці бачать 503 — крок 4 продовжить її`)
	else {
		const reach = await fetch(`${API}/categories/options?limit=1`, { headers: { 'X-Internal-Token': secrets.internal } }).catch(e => ({ status: e.message }))
		if (reach.status !== 200)
			stop(`${API}/categories/options відповідає ${reach.status} — новий BE ще не задеплоєно або API недоступний.`, ['Крок 1 PDF: merge dev → production у fillando-be і дочекатися деплою'])
		ok('API відповідає, новий BE задеплоєно')
		// Only the new storefront has this route; the old one would read the migrated catalogue through
		// the legacy listing (409) — and nothing before the SEO check, after the admin is opened, shows it.
		const front = await fetch(`${SITE}/api/catalog-nav/trail?slug=filament`).then(async r => ({ status: r.status, hrefs: (await r.json().catch(() => null))?.hrefs })).catch(e => ({ status: e.message }))
		if (front.status !== 200 || !Array.isArray(front.hrefs))
			stop(`${SITE}/api/catalog-nav/trail відповідає ${front.status} — нову вітрину ще не задеплоєно.`, ['Крок 2 PDF: merge dev → production у fillando-fe і дочекатися деплою'])
		ok('вітрина відповідає, новий FE задеплоєно')
	}
	if (!state.done.apply && !held && control.control_present && control.v2_categories > 0) {
		// A run that died right after the migration finished never recorded it: the journal did.
		if ((await ownOperation())?.status !== 'completed')
			stop('Каталог уже переведено на v2, а цей реліз його не мігрував (інша тека релізу?).', [`Тека з попереднім запуском: ~/fillando-release-<дата>; або --dir=<та тека>`], { rerun: false })
		warn(`міграцію ${state.op} завершено попереднім запуском, який обірвався одразу після неї — продовжую з перевірки`)
		await done('apply', { revision: control.revision })
	}
	if (state.done.apply && !control.v2_categories)
		stop('Ця тека релізу вже мігрувала каталог, а зараз він не мігрований — його відновлено з бекапу (рунбук §5).', ['Новий реліз — новою текою: --dir=<нова тека> або наступного дня'], { rerun: false })
	ok(`стан каталогу: ${control.control_present ? `phase ${control.phase}, v2-категорій ${control.v2_categories}` : 'ще не мігровано'}`)
	state.rtt = Math.round((await roundTrip()) * 10) / 10
	save()
	say(`  до бази ${state.rtt} мс на запит (медіана з 12)`)
	if (!state.done.backup && !(await ask('Cron вимкнено (Railway: RUN_CRON=false + redeploy BE), ручного Prom sync немає, адмінів попереджено?')))
		stop('Спершу зупиніть writers.', ['Railway → fillando-be → Variables: RUN_CRON=false → Redeploy', 'Адмінам: не редагувати каталог до кінця релізу'])
}

async function backup() {
	step(1, 'Бекап production і перевірка, що він відновлюється')
	if (state.done.backup) return ok(`уже зроблено: ${MANIFEST}`)
	// A previous attempt of this step may have left its own partial artifacts — never anything else.
	for (const file of [ARCHIVE, MANIFEST]) if (existsSync(file)) rmSync(file)
	const { MongoClient } = createRequire(path.join(BE, 'package.json'))('mongodb')
	const local = await new MongoClient(CHECK_URI, { serverSelectionTimeoutMS: 3000 }).connect()
	if ((await local.db(CHECK_DB).listCollections().toArray()).length) {
		warn(`прибираю незавершену перевірку попередньої спроби: база ${CHECK_DB} на 27019`)
		await local.db(CHECK_DB).dropDatabase()
	}
	await local.close()

	// The URI goes to mongodump in a config file (0600, removed at once), not in its arguments,
	// where any process listing would show it.
	const config = path.join(DIR, '.mongodump.yaml')
	writeFileSync(config, `uri: '${secrets.uri.replaceAll("'", "''")}'\n`, { mode: 0o600 })
	let dump
	try {
		dump = await run('mongodump', [`--config=${config}`, '--db=fillando-prod', `--archive=${ARCHIVE}`, '--gzip'], { quiet: true })
	} finally {
		rmSync(config, { force: true })
	}
	if (dump.code !== 0) stop(`mongodump не вдався: ${dump.stderr.trim().split('\n').slice(-3).join(' ')}`)
	ok(`дамп: ${ARCHIVE}`)
	const restore = await run('mongorestore', ['--uri', CHECK_URI, `--archive=${ARCHIVE}`, '--gzip', "--nsFrom=fillando-prod.*", `--nsTo=${CHECK_DB}.*`], { quiet: true })
	if (restore.code !== 0) stop(`mongorestore у ${CHECK_DB} не вдався: ${restore.stderr.trim().split('\n').slice(-3).join(' ')}`)
	ok(`відновлено в локальну базу ${CHECK_DB}`)
	const manifest = await migrate(['backup-manifest', CHECK_DB, `--archive=${ARCHIVE}`], { quiet: true })
	const report = lastJson(manifest.stdout)
	if (manifest.code !== 0 || !report) stop(`backup-manifest: ${manifest.stderr.trim()}`)
	say(`  каталог: ${Object.entries(report.catalog).map(([k, v]) => `${k} ${v}`).join(', ')}; документів ${report.documents}`)
	ok('маніфест перевіреного бекапу записано — збережіть архів ще й поза ноутбуком (зашифровано)')
	await done('backup', report.catalog)
}

async function capture(side, contract) {
	const dir = path.join(DIR, side)
	mkdirSync(dir, { recursive: true })
	for (const [script, args] of [
		['capture.mjs', [API, path.join(dir, 'capture.json')]],
		['facets.mjs', [API, contract, path.join(dir, 'facets.json')]],
		['release-verify.mjs', [API, path.join(dir, 'verify.json')]]
	]) {
		const result = await probe(script, args)
		if (result.code !== 0) stop(`${script} (${side}) завершився з помилкою.`, ['Подивіться вивід вище; API має відповідати 200'])
	}
}

async function baseline() {
	step(2, 'Знімок «до» (новий BE, старі дані)')
	if (state.done.baseline) return ok('уже зроблено')
	await freshCookie('до')
	await capture('before', 'legacy')
	const verify = JSON.parse(readFileSync(path.join(DIR, 'before/verify.json'), 'utf8'))
	if (verify.legacy_catalog.status !== 200) stop(`старий лістинг відповідає ${verify.legacy_catalog.status}, а має 200 до міграції.`)
	// What release-check fails on (audit, 2026-11-07), caught here, before anything is written —
	// not after the migration, where a FAIL means the rollback. Only a missing token is a SKIP.
	const answers = JSON.parse(readFileSync(path.join(DIR, 'before/capture.json'), 'utf8'))
	const facets = JSON.parse(readFileSync(path.join(DIR, 'before/facets.json'), 'utf8'))
	const refused = [
		...answers.partner_errors.filter(e => answers.partner_token || e.status !== 401).map(e => `partner ${e.path} ${e.status}`),
		...(answers.price_sheet_error ? [`price-sheet ${answers.price_sheet_error.status}`] : []),
		...(answers.admin_cookie && answers.pdf_status !== 201 ? [`PDF ${answers.pdf_status}`] : []),
		// The rest of what the comparison reads from the «before» side (audit 14.11.2026).
		...(answers.feed_status !== 200 ? [`фід ${answers.feed_status}`] : []),
		...(verify.sitemap_status !== 200 ? [`sitemap ${verify.sitemap_status}`] : []),
		...(verify.strip?.status !== 200 || !verify.strip.items ? [`стрічка товарів ${verify.strip?.status}`] : []),
		...(verify.landings.length ? [] : ['жодного лендінгу']),
		...(facets.every(row => Number.isInteger(row.total)) ? [] : ['лістинг із фільтрами без total'])
	]
	if (refused.length)
		stop(`знімок «до»: ${refused.slice(0, 3).join(', ')} — release-check дав би FAIL уже після міграції.`, ['401 — PARTNER_TOKEN (А4) чи ADMIN_COOKIE відхилено: взяти дійсний; інший статус — API не відповідає 200', 'Нічого не записано: виправити й запустити ту саму команду'])
	ok('знімок «до» записано')
	await done('baseline')
}

async function dryRun() {
	step(3, 'Пробний прогін міграції (нічого не пише)')
	if (state.done.dryrun) return ok(`уже погоджено: ${state.done.dryrun.targets} цілей`)
	const result = await migrate(['dry-run', 'fillando-prod', state.op, '--production'], { quiet: true })
	const plan = lastJson(result.stdout)
	if (result.code !== 0 || !plan) stop(`dry-run відмовив: ${result.stderr.trim().split('\n').pop()}`, ['Реліз переноситься (stop-критерій): mapping виправляється, репетиція В повторюється'])
	writeFileSync(path.join(DIR, 'dry-run.json'), JSON.stringify(plan, null, 1))
	const r = plan.report
	say(`  ${r.category}: товарів ${r.products} (${r.products_with_axis} з віссю кольору, ${r.products_without_axis} без), SKU ${r.variants}, лендінгів ${r.landings}`)
	say(`  характеристик ${r.definitions?.length}; прибрано з товарів ${JSON.stringify(r.dropped_product_attributes)}; не перенесено ${JSON.stringify(r.removed_attributes ?? {})}; брендів ${JSON.stringify(r.brands)}`)
	say(`  цілей ${plan.targets}; брендів створити ${plan.brands_to_create.length} (повний звіт — ${path.join(DIR, 'dry-run.json')})`)
	// The journal writes one target at a time, ~4 requests each: seconds beside the database, minutes
	// from a laptop. The operator has to know before the catalogue closes, not while it is closed.
	const closed = closedWindow(plan.targets, state.rtt ?? 1)
	say(`  на час міграції каталог і checkout відповідатимуть 503: приблизно ${duration(closed.low)}–${duration(closed.high)} (≈ ${plan.targets * 4} запитів до бази × ${state.rtt ?? '?'} мс)`)
	if (flags.expect) {
		const expected = JSON.parse(readFileSync(String(flags.expect), 'utf8'))
		if (expected.targets !== plan.targets || !isDeepStrictEqual(expected.report, plan.report))
			stop('dry-run відрізняється від репетиції В.', [`Порівняйте ${path.join(DIR, 'dry-run.json')} і ${flags.expect}`, 'Реліз переноситься (stop-критерій)'])
		ok('dry-run = репетиція В')
	} else if (!(await ask('Кількості збігаються з репетицією В (і немає невідомих атрибутів чи ключів лендінгів)?')))
		stop('Кількості не погоджено.', ['Реліз переноситься (stop-критерій): порівняйте з dry-run репетиції В'])
	await done('dryrun', { targets: plan.targets, plan_hash: plan.plan_hash })
}

async function apply() {
	const targets = state.done.dryrun?.targets ?? 0
	const closed = closedWindow(targets, state.rtt ?? 1)
	step(4, `Міграція: каталог і checkout відповідають 503 приблизно ${duration(closed.low)}–${duration(closed.high)} — не переривати`)
	if (state.done.apply) return ok(`уже виконано: revision ${state.done.apply.revision}`)
	// An interrupted run of this operation is continued; an attempt that was refused before writing
	// (or rolled back) left its record, and the journal takes an id once — a new one then.
	const held = await status()
	const resume = held.control_present && held.phase !== 'idle' && held.operation_id === state.op
	if (resume) warn('продовжую перервану міграцію (resume)')
	else if (await ownOperation()) {
		state.op = newOp()
		save()
		say(`  попередня спроба не дійшла до запису або її відкочено — нова операція ${state.op}`)
	}
	critical = 'Міграція триває'
	const unwatch = await watchMigration(targets)
	const result = await migrate(write(resume ? 'resume' : 'apply'), { quiet: true, detached: true })
	await unwatch()
	critical = null
	const answer = lastJson(result.stdout)
	if (result.code !== 0 || answer?.status !== 'completed' || (!resume && answer.legacy_fingerprint_unchanged !== true)) {
		// The CLI's first stderr line names the target; a killed process leaves only that one.
		const message = result.stderr.trim().split('\n').filter(line => line && !line.startsWith('{"target"')).pop()
			?? `процес міграції обірвався (${result.code === null ? 'сигнал' : `код ${result.code}`})`
		const inspect = await migrate(['inspect', 'fillando-prod', state.op, '--production'], { quiet: true })
		writeFileSync(path.join(DIR, 'apply-failure.json'), inspect.stdout || inspect.stderr)
		// The backup no longer describes the live catalogue (a writer ran after it) or its restore check
		// is over 24 h old: nothing was written; the next run takes a new backup and baseline.
		if (/BACKUP_DOES_NOT_MATCH_CATALOG|older than \d+ h/.test(message)) {
			for (const key of ['backup', 'baseline', 'dryrun']) delete state.done[key]
			save()
			stop(`apply відмовив до запису: ${message}`, [
				/BACKUP_DOES_NOT_MATCH/.test(message)
					? 'Хтось писав у каталог після бекапу (cron? адмінка? Prom sync?): переконайтеся, що writers зупинено'
					: 'Перевірці бекапу понад 24 год',
				'Нічого не змінено. Запустіть ту саму команду — бекап і знімок «до» буде зроблено заново'
			])
		}
		if (/nothing was written and the catalogue gate is released/.test(message))
			stop(`apply відмовив до запису: ${message}`, ['Каталог лишився відкритим, нічого не змінено. Причина — у повідомленні вище'])
		const left = await status()
		if (left.control_present && left.phase !== 'idle')
			stop(`міграцію перервано (${message}): каталог закритий, покупці бачать 503.`, [
				'Запустіть ту саму команду ще раз — вона продовжить міграцію з місця зупинки (resume); записане не втрачено й не дублюється',
				`Стан операції — ${path.join(DIR, 'apply-failure.json')}`,
				'Не правити catalog_control вручну; якщо resume відмовляє — catalog-v2-migrate.cjs rollback (рунбук §3.6) або відновлення каталогу з бекапу (рунбук §5)'
			])
		stop(`${resume ? 'resume' : 'apply'} не завершився: ${message}`, [
			`Стан операції — ${path.join(DIR, 'apply-failure.json')}`,
			'Каталог відкритий (phase idle). Причина — у повідомленні вище; після виправлення запустіть ту саму команду'
		])
	}
	const after = await status()
	ok(`міграцію завершено: ${answer.targets ?? targets} цілей, revision ${after.revision}, старі поля не змінено`)
	await done('apply', { revision: after.revision })
	// The storefront still holds the v1 category in its cache and renders it against v2 data (a 500 on
	// the stand): dropped at once, not after the minute of checks. Step 6 repeats it and is the one
	// that stops on a refusal.
	const failed = await purge()
	if (failed) warn(`кеш вітрини ще не очищено («${failed.resource}»: ${failed.status}) — крок 6 повторить і зупинить, якщо не вдасться`)
}

async function verify() {
	step(5, 'Перевірка «після»: покупець має бачити те саме')
	if (state.done.verify) return ok('уже перевірено')
	await freshCookie('після')
	await capture('after', 'v2')
	const check = await run('node', [path.join(PROBES, 'release-check.cjs'), path.join(DIR, 'before'), path.join(DIR, 'after'), path.join(BE, 'scripts/catalog-v2-migration.filament.json'), path.join(DIR, 'dry-run.json')], { quiet: true })
	for (const line of check.stdout.split('\n').filter(line => /^(FAIL|SKIP)/.test(line))) say(`  ${line}`)
	say(`  ${check.stdout.trim().split('\n').pop()} (повний вивід — ${LOG})`)
	const control = await status()
	if (check.code !== 0 || control.phase !== 'idle')
		stop('release-check показав FAIL або каталог не в phase idle. Записи адмінки ще закриті.', [
			'Єдиний FAIL «pdf generated — 201 / 401» — прострочений ADMIN_COOKIE, не дефект міграції: запустіть ту саму команду зі свіжим cookie',
			`Інакше відкат — відновити каталог з бекапу цього релізу (${ARCHIVE}), рунбук §5`
		])
	ok('ALL CHECKS PASSED, каталог у phase idle')
	await done('verify')
}

async function purgeStep() {
	step(6, 'Очищення кешів вітрини')
	if (state.done.purge) return ok('уже очищено')
	const failed = await purge()
	if (failed)
		stop(`очищення «${failed.resource}» відповіло ${failed.status}.`, [
			'401 — REVALIDATE_SECRET тут і на Railway fillando-fe різні: виправте й запустіть знову',
			'або Railway → fillando-fe → Redeploy (новий контейнер — порожній кеш), потім запустіть знову'
		])
	await done('purge')
}

async function enable() {
	step(7, 'Відкрити записи нової адмінки')
	if (state.done.enable) return ok('уже відкрито')
	const result = await adminWrites(['enable', 'fillando-prod', '--production', '--confirm=enable:fillando-prod'])
	const answer = lastJson(result.stdout)
	if (result.code !== 0 || !answer?.after?.new_admin_can_write) stop(`enable: ${result.stderr.trim() || JSON.stringify(answer?.after)}`)
	ok(`нова адмінка пише (${answer.result})`)
	await done('enable')
}

async function seo() {
	step(8, 'SEO-статуси вітрини (браузер і Googlebot)')
	const result = await run('node', [path.join(PROBES, 'seo-status.mjs'), SITE], { quiet: true })
	const failures = result.stdout.split('\n').filter(line => line.startsWith('FAIL'))
	if (result.code !== 0) {
		for (const line of failures) say(`  ${line}`)
		stop('seo-status має FAIL.', [
			`Відкат — відновити каталог з бекапу цього релізу (${ARCHIVE}), рунбук §5; правки адмінів після відкриття записів пропадуть`,
			'Або лишитися на новому каталозі й виправляти вперед — рішення за stop-критеріями (рунбук §4)'
		])
	}
	ok(result.stdout.trim().split('\n').pop())
	await done('seo')
}

async function finish() {
	say(`\n${paint('1;32', 'Автоматична частина релізу пройшла')} (цей запуск — ${Math.round((Date.now() - STARTED) / 1000)} с). Лишилось руками:`)
	for (const line of [
		'Railway → fillando-be: RUN_CRON=true (один інстанс) → Redeploy; адмінка → перший Prom sync → дочекатися «done»',
		'Шлях покупця: головна → «Каталог» → «Філамент» → «Чорний» + PLA → лендінг → товар → кошик → checkout',
		'Нова адмінка: змінити характеристику товару — видно на сторінці, повернути; у логах fillando-be «cache purged» і «after echo»',
		'Ліміти: з двох мереж POST /discount-coupons/validate → X-RateLimit-Remaining 19/18/17 і знову 19 (PDF, крок 6)',
		'Адміни можуть редагувати; тимчасовий partner-токен — відкликати'
	])
		say(`  □ ${line}`)
	if (await ask(`Видалити локальну перевірочну базу ${CHECK_DB} (персональні дані; архів лишається)?`)) {
		const { MongoClient } = createRequire(path.join(BE, 'package.json'))('mongodb')
		const local = await new MongoClient(CHECK_URI, { serverSelectionTimeoutMS: 3000 }).connect()
		await local.db(CHECK_DB).dropDatabase()
		await local.close()
		ok(`${CHECK_DB} видалено`)
	}
	say(`Архів ${ARCHIVE} — перенести в захищене сховище. Журнал запуску: ${LOG}`)
	if (state.remote)
		warn('Поверніть DATABASE_URL у fillando-be/.env на локальну базу: поки там production, `yarn start:dev` на ноутбуці працює з production.')
}

say(`\n${paint('1', 'Реліз каталогу v2')} · ${new Date().toISOString()}`)
await preflight()
await backup()
await baseline()
await dryRun()
await apply()
await verify()
await purgeStep()
await enable()
await seo()
await finish()
input?.rl.close()
