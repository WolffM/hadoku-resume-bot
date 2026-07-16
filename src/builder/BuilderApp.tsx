import { useEffect, useMemo, useState } from 'react'
import { logger } from '@wolffm/logger/client'
import {
  fetchBlocks,
  saveBlock,
  deleteBlock as apiDeleteBlock,
  saveFeedback,
  BuilderApiError,
  type ResumeBlock,
  type BlockType,
  type Feedback
} from './api'
import { BlockCard } from './BlockCard'

const BLOCK_TYPES: BlockType[] = [
  'experience',
  'project',
  'skills',
  'education',
  'summary',
  'header'
]

export function facetOf(tag: string): 'tech' | 'layer' | 'story' | 'plain' {
  if (tag.startsWith('tech:')) return 'tech'
  if (tag.startsWith('layer:')) return 'layer'
  if (tag.startsWith('story:')) return 'story'
  return 'plain'
}

type SortMode = 'order' | 'priority' | 'type' | 'feedback'

function emptyBlock(): ResumeBlock {
  return { id: '', type: 'experience', tags: [], title: '', content: '', priority: 5 }
}

export function BuilderApp() {
  const [blocks, setBlocks] = useState<ResumeBlock[]>([])
  const [feedback, setFeedback] = useState<Feedback>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | BlockType>('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [andMode, setAndMode] = useState(true)
  const [sort, setSort] = useState<SortMode>('order')

  const [creating, setCreating] = useState<ResumeBlock | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchBlocks()
      .then(res => {
        if (cancelled) return
        setBlocks(res.blocks)
        setFeedback(res.feedback)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg =
          err instanceof BuilderApiError && err.status === 403
            ? 'Admin access required — sign in with an admin key.'
            : err instanceof Error
              ? err.message
              : 'Failed to load blocks'
        setError(msg)
        logger.error('[builder] load failed', { error: msg })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of blocks) for (const t of b.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return counts
  }, [blocks])

  const sortedTags = useMemo(
    () =>
      [...tagCounts.keys()].sort(
        (a, b) => facetOf(a).localeCompare(facetOf(b)) || a.localeCompare(b)
      ),
    [tagCounts]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let v = blocks.filter(b => {
      if (typeFilter && b.type !== typeFilter) return false
      if (q && !(b.id + b.title + b.content).toLowerCase().includes(q)) return false
      if (activeTags.size) {
        const hits = [...activeTags].filter(t => b.tags.includes(t)).length
        if (andMode ? hits !== activeTags.size : hits === 0) return false
      }
      return true
    })
    if (sort === 'priority') v = [...v].sort((a, b) => b.priority - a.priority)
    else if (sort === 'type') v = [...v].sort((a, b) => a.type.localeCompare(b.type))
    else if (sort === 'feedback')
      v = [...v].sort((a, b) => (feedback[b.id] ? 1 : 0) - (feedback[a.id] ? 1 : 0))
    return v
  }, [blocks, search, typeFilter, activeTags, andMode, sort, feedback])

  function toggleTag(tag: string) {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  async function handleSave(block: ResumeBlock, isNew: boolean): Promise<void> {
    const { block: saved } = await saveBlock(block)
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === saved.id)
      if (idx === -1) return [...prev, saved]
      const copy = [...prev]
      copy[idx] = saved
      return copy
    })
    if (isNew) setCreating(null)
  }

  async function handleDelete(id: string): Promise<void> {
    await apiDeleteBlock(id)
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  async function handleFeedback(id: string, text: string): Promise<void> {
    const res = await saveFeedback(id, text)
    setFeedback(res.feedback)
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(blocks, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'blocks.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="rb-builder__status">Loading blocks…</p>
  if (error) return <p className="rb-builder__status rb-builder__status--error">{error}</p>

  return (
    <div className="rb-builder">
      <div className="rb-builder__toolbar">
        <header className="rb-builder__header">
          <h1>Resume Builder</h1>
          <div className="rb-builder__count">
            {visible.length} / {blocks.length} blocks
          </div>
          <div className="rb-builder__header-actions">
            <button type="button" onClick={exportJson} className="rb-builder__btn">
              Export blocks.json
            </button>
            <button
              type="button"
              onClick={() => setCreating(emptyBlock())}
              className="rb-builder__btn rb-builder__btn--primary"
              disabled={creating !== null}
            >
              + New block
            </button>
          </div>
        </header>

        <div className="rb-builder__controls">
          <input
            type="search"
            placeholder="Search id, title, content…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rb-builder__search"
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as '' | BlockType)}
            className="rb-builder__select"
          >
            <option value="">all types</option>
            {BLOCK_TYPES.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortMode)}
            className="rb-builder__select"
          >
            <option value="order">render order</option>
            <option value="priority">priority ↓</option>
            <option value="type">type</option>
            <option value="feedback">has feedback</option>
          </select>
          <label className="rb-builder__andmode">
            <input type="checkbox" checked={andMode} onChange={e => setAndMode(e.target.checked)} />
            match all tags
          </label>
        </div>

        <div className="rb-builder__legend">
          <span className="rb-builder__legend-item" style={{ color: 'var(--rb-tech)' }}>
            <span className="rb-builder__legend-dot" />
            tech:
          </span>
          <span className="rb-builder__legend-item" style={{ color: 'var(--rb-layer)' }}>
            <span className="rb-builder__legend-dot" />
            layer:
          </span>
          <span className="rb-builder__legend-item" style={{ color: 'var(--rb-story)' }}>
            <span className="rb-builder__legend-dot" />
            story:
          </span>
          <span className="rb-builder__legend-item" style={{ color: 'var(--rb-plain)' }}>
            <span className="rb-builder__legend-dot" />
            other / always
          </span>
          <span className="rb-builder__legend-item">
            <strong>prio</strong>&nbsp;= how strongly you want a block (sort/rank hint)
          </span>
        </div>

        <div className="rb-builder__tagbar">
          {sortedTags.map(t => (
            <button
              type="button"
              key={t}
              onClick={() => toggleTag(t)}
              className={`rb-tag rb-tag--${facetOf(t)}${activeTags.has(t) ? ' rb-tag--active' : ''}`}
            >
              {t}
              <span className="rb-tag__n">{tagCounts.get(t)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rb-builder__list">
        {creating && (
          <BlockCard
            key="__new__"
            block={creating}
            feedback={undefined}
            isNew
            existingIds={blocks.map(b => b.id)}
            onSave={b => handleSave(b, true)}
            onCancel={() => setCreating(null)}
            onFeedback={handleFeedback}
            onTagClick={toggleTag}
          />
        )}
        {visible.map(b => (
          <BlockCard
            key={b.id}
            block={b}
            feedback={feedback[b.id]}
            existingIds={blocks.map(x => x.id)}
            onSave={block => handleSave(block, false)}
            onDelete={() => handleDelete(b.id)}
            onFeedback={handleFeedback}
            onTagClick={toggleTag}
          />
        ))}
      </div>
    </div>
  )
}
