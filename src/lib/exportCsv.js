// CSV export for a list of tasks. Triggers a download in the browser
// with a sensible filename. No dependency on any CSV library — the
// task schema is small and well-defined.

const FIELDS = [
  { key: 'task_number', label: 'Number' },
  { key: 'title', label: 'Title' },
  { key: 'pic', label: 'PIC', resolve: (t) => t.pic?.name ?? '' },
  { key: 'department_id', label: 'Department', resolve: (t) => t._department_name ?? '' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'due_date', label: 'Due date' },
  { key: 'raised_date', label: 'Raised date' },
  { key: 'tags', label: 'Tags', resolve: (t) => (t.tags ?? []).join('; ') },
  { key: 'watchers', label: 'Watchers', resolve: (t) => (t.watchers ?? []).map((w) => w.name).join('; ') },
  { key: 'source', label: 'Source' },
  { key: 'created_at', label: 'Created' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'note_count', label: 'Notes' },
]

export function exportTasksToCsv(tasks, { filename = 'tickd-tasks.csv', departments = [] } = {}) {
  // Resolve department names from id (tasks carry department_id, not the name)
  const deptName = new Map(departments.map((d) => [d.id, d.name]))
  const enriched = tasks.map((t) => ({
    ...t,
    _department_name: t.department_id ? deptName.get(t.department_id) ?? '' : '',
  }))

  const header = FIELDS.map((f) => csvCell(f.label))
  const rows = enriched.map((t) =>
    FIELDS.map((f) => csvCell(f.resolve ? f.resolve(t) : t[f.key] ?? '')),
  )

  // BOM so Excel opens UTF-8 cleanly
  const csv = '﻿' + [header, ...rows].map((r) => r.join(',')).join('\r\n')
  download(filename, csv, 'text/csv;charset=utf-8')
}

function csvCell(value) {
  const s = value == null ? '' : String(value)
  // Quote if it contains a comma, quote, or newline; escape internal quotes
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
