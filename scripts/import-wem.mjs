// One-shot import of Dyna's WEM CSV into the workspace.
//
// Usage:
//   node --env-file=.env.local scripts/import-wem.mjs            # dry-run
//   node --env-file=.env.local scripts/import-wem.mjs --apply    # actually inserts
//
// Required env (in .env.local):
//   VITE_SUPABASE_URL=<project url>
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase dashboard>
//
// The service role key bypasses RLS. Keep it out of git (it already is —
// .env.local is gitignored) and revoke + rotate after the import if you want.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const CSV_PATH = path.resolve('docs/wem-2026-service.csv')
const WORKSPACE_NAME = "Asbert's Workspace"
const APPLY = process.argv.includes('--apply')

// ---------- Mappings ----------

const STATUS_MAP = {
  'in progress':  'In progress',
  'pending':      'Open',
  'scheduled':    'Open',
  'not started':  'Open',
  'open':         'Open',
  'ongoing':      'Ongoing',
  'planning':     'In progress',
  'completed':    'Done',
  '':             'Open',
}

const PRIORITY_MAP = {
  'high':   'High',
  'medium': 'Medium',
  'low':    'Low',
  '':       'Medium',
}

// Maps an alias spelling found in the CSV to the canonical name in
// people.name. Lowercased keys.
const NAME_ALIASES = {
  'errol':       'Errol West',
  'errie':       'Errol West',
  'west':        'Errol West',
  'mr west':     'Errol West',
  'mr. west':    'Errol West',
  'clement':     'Clem Abbott',
  'clem':        'Clem Abbott',
  'sasha':       'Sasha Quashie',
  'cymone':      'Cymone Hughes',
  'richard':     "Richard D'Ornellas",
  'charlene':    'Charlene Dinard',
  'stephen':     'Stephen Barnes',
  'kieron':      'Kieron Leonard',
  'leslie':      'Leslie Barnes',
  'dyna':        'Dyna Harney-Barnes',
  'asbert':      'Asbert Baptiste',
  'shaquila':    'Shaquille',
  'shaquille':   'Shaquille',
  // Typos / mashed strings in the WEM CSV
  'service teamsasha': 'Sasha Quashie',
  'sasha-team':        'Sasha Quashie',
  'service team':      'Sasha Quashie',
  // "All Departments" tasks → workspace owner (Dyna runs the WEM)
  'all departments':   'Dyna Harney-Barnes',
}

// ---------- Helpers ----------

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else {
      field += c
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function normalize(s) {
  return String(s ?? '').toLowerCase().trim().replace(/[.,]+/g, ' ').replace(/\s+/g, ' ')
}

const MONTHS = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
}

function parseDate(s) {
  if (!s) return null
  const t = String(s).trim()
  if (!t) return null

  // ISO YYYY-MM-DD
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  // DD-MMM-YY (15-May-26)
  m = t.match(/^(\d{1,2})-([A-Za-z]+)-(\d{2,4})$/)
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)]
    if (!mon) return null
    const yr = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${yr}-${mon}-${m[1].padStart(2, '0')}`
  }

  // M/D/YY or MM/DD/YYYY (5/16/26)
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const yr = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }

  // "18th March 2026", "19 Feb. 2026", "6th Feb. 2026", "13 Feb.2026"
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z.]+)\s*(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().replace(/\./g, '').slice(0, 3)]
    if (!mon) return null
    return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`
  }

  return null
}

function splitNames(s) {
  return String(s ?? '')
    .split(/[\/,]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function findPerson(name, peopleByNorm) {
  if (!name) return null
  const norm = normalize(name)

  // Alias lookup first (single-word and full)
  const canonical = NAME_ALIASES[norm] ?? NAME_ALIASES[norm.split(' ')[0]]
  if (canonical) {
    const hit = peopleByNorm.get(normalize(canonical))
    if (hit) return hit
  }

  // Direct
  if (peopleByNorm.has(norm)) return peopleByNorm.get(norm)

  // First-name fuzzy
  const first = norm.split(' ')[0]
  for (const p of peopleByNorm.values()) {
    if (p.name.toLowerCase().split(' ')[0] === first) return p
  }
  return null
}

function splitDepartment(s) {
  const parts = String(s ?? '').split('/').map((p) => p.trim()).filter(Boolean)
  return { primary: parts[0] ?? null, extras: parts.slice(1) }
}

function mapStatus(s) {
  return STATUS_MAP[normalize(s)] ?? 'Open'
}

function mapPriority(s) {
  return PRIORITY_MAP[normalize(s)] ?? 'Medium'
}

// ---------- Main ----------

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    console.error('Set them in .env.local and run with: node --env-file=.env.local scripts/import-wem.mjs')
    process.exit(1)
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Workspace
  const { data: ws, error: wsErr } = await sb
    .from('workspaces').select('*').eq('name', WORKSPACE_NAME).single()
  if (wsErr || !ws) throw new Error(`Workspace "${WORKSPACE_NAME}" not found.`)

  // People
  const { data: people } = await sb
    .from('people').select('*').eq('workspace_id', ws.id).eq('is_active', true)
  const peopleByNorm = new Map(people.map((p) => [normalize(p.name), p]))

  // Departments
  const { data: departments } = await sb
    .from('departments').select('*').eq('workspace_id', ws.id)
  const deptByLower = new Map(departments.map((d) => [d.name.toLowerCase(), d]))

  // CSV
  const text = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parseCsv(text)

  const planned = []
  const warnings = []
  let skippedHeader = 0
  let skippedEmpty = 0

  for (const row of rows) {
    if (row.length < 9) { skippedEmpty++; continue }
    const [dept, pic, desc, raised, due, completed, status, prio, comments] = row.map((c) => (c ?? '').trim())

    if (!desc || normalize(dept) === 'department') { skippedHeader++; continue }
    if (!pic) { skippedEmpty++; continue }

    // PIC + watchers
    const names = splitNames(pic)
    if (names.length === 0) { warnings.push(`No PIC in row: ${desc}`); continue }
    const primaryPerson = findPerson(names[0], peopleByNorm)
    if (!primaryPerson) {
      warnings.push(`Unknown PIC "${names[0]}" for: ${desc}`)
      continue
    }
    const watcherPeople = names.slice(1)
      .map((n) => findPerson(n, peopleByNorm))
      .filter(Boolean)
      .filter((p) => p.id !== primaryPerson.id)
    const unmatchedWatchers = names.slice(1).filter((n) => !findPerson(n, peopleByNorm))
    for (const n of unmatchedWatchers) {
      warnings.push(`Unknown watcher "${n}" for: ${desc}`)
    }

    // Department + tag extras
    const { primary: deptName, extras: deptExtras } = splitDepartment(dept)
    let deptRow = null
    if (deptName) {
      deptRow = deptByLower.get(deptName.toLowerCase()) ?? null
      if (!deptRow) warnings.push(`Unknown department "${deptName}" for: ${desc}`)
    }

    // Status + priority
    const mappedStatus = (completed && parseDate(completed)) ? 'Done' : mapStatus(status)
    const mappedPriority = mapPriority(prio)

    // Dates
    const raisedDate = parseDate(raised)
    const dueDate = parseDate(due)

    // Tags: department extras + free-text from comments
    const tags = [...deptExtras]

    const task = {
      workspace_id: ws.id,
      title: desc,
      pic_id: primaryPerson.id,
      department_id: deptRow?.id ?? null,
      raised_date: raisedDate,
      due_date: dueDate,
      status: mappedStatus,
      priority: mappedPriority,
      tags,
      source: raisedDate ? `WEM ${raisedDate}` : 'WEM',
      notes: comments || null,
    }

    planned.push({
      task,
      watcher_ids: watcherPeople.map((p) => p.id),
      journal_note: comments?.trim() || null,
    })
  }

  // ---------- Report ----------
  console.log(`\n— Plan —`)
  console.log(`Tasks to insert: ${planned.length}`)
  console.log(`Header rows skipped: ${skippedHeader}`)
  console.log(`Empty rows skipped: ${skippedEmpty}`)
  console.log(`Warnings: ${warnings.length}`)
  if (warnings.length) {
    console.log('\nWarnings (first 30):')
    warnings.slice(0, 30).forEach((w) => console.log('  - ' + w))
  }
  console.log('\nSample of first 5 tasks:')
  planned.slice(0, 5).forEach((p, i) => {
    console.log(`\n[${i + 1}] ${p.task.title}`)
    console.log(`    PIC: ${people.find((x) => x.id === p.task.pic_id)?.name}`)
    if (p.watcher_ids.length) {
      console.log(`    Watchers: ${p.watcher_ids.map((id) => people.find((x) => x.id === id)?.name).join(', ')}`)
    }
    console.log(`    Status: ${p.task.status} · Priority: ${p.task.priority}`)
    console.log(`    Raised: ${p.task.raised_date ?? '—'} · Due: ${p.task.due_date ?? '—'}`)
    if (p.task.tags.length) console.log(`    Tags: [${p.task.tags.join(', ')}]`)
    if (p.task.notes) console.log(`    Comments: ${p.task.notes.slice(0, 80)}${p.task.notes.length > 80 ? '…' : ''}`)
  })

  if (!APPLY) {
    console.log('\nDry run only. Pass --apply to actually insert.')
    return
  }

  // ---------- Apply ----------
  console.log('\nApplying…')
  let ok = 0
  let failed = 0
  for (const p of planned) {
    const { data: inserted, error } = await sb
      .from('tasks').insert(p.task).select('id').single()
    if (error || !inserted) {
      console.error(`FAIL: ${p.task.title}\n  ${error?.message}`)
      failed++
      continue
    }
    // Watchers
    if (p.watcher_ids.length) {
      const watcherRows = p.watcher_ids.map((person_id) => ({
        task_id: inserted.id, person_id,
      }))
      const { error: wErr } = await sb.from('task_watchers').insert(watcherRows)
      if (wErr) console.warn(`  watcher insert warning for "${p.task.title}": ${wErr.message}`)
    }
    // Initial journal entry from Comments
    if (p.journal_note) {
      const { error: jErr } = await sb.from('journal_entries').insert({
        task_id: inserted.id,
        body: p.journal_note,
        entry_type: 'note',
      })
      if (jErr) console.warn(`  journal insert warning for "${p.task.title}": ${jErr.message}`)
    }
    ok++
  }
  console.log(`\nDone. Inserted ${ok}, failed ${failed}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
