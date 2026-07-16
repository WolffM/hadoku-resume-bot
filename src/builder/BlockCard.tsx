import { useEffect, useRef, useState } from 'react'
import { facetOf } from './BuilderApp'
import type { BlockType, FeedbackEntry, ResumeBlock } from './api'

const BLOCK_TYPES: BlockType[] = [
  'experience',
  'project',
  'skills',
  'education',
  'summary',
  'header'
]

interface Props {
  block: ResumeBlock
  feedback: FeedbackEntry | undefined
  existingIds: string[]
  isNew?: boolean
  onSave: (block: ResumeBlock) => Promise<void>
  onDelete?: () => Promise<void>
  onCancel?: () => void
  onFeedback: (id: string, text: string) => Promise<void>
  onTagClick: (tag: string) => void
}

export function BlockCard({
  block,
  feedback,
  existingIds,
  isNew = false,
  onSave,
  onDelete,
  onCancel,
  onFeedback,
  onTagClick
}: Props) {
  const [draft, setDraft] = useState<ResumeBlock>(block)
  const [tagsText, setTagsText] = useState(block.tags.join(' '))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fbText, setFbText] = useState(feedback?.text ?? '')
  const [fbStatus, setFbStatus] = useState('')
  const fbTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Keep the draft in sync if the saved block changes underneath us (e.g. after
  // a successful save re-normalises it), but not while the user is mid-edit.
  useEffect(() => {
    if (!isNew) {
      setDraft(block)
      setTagsText(block.tags.join(' '))
    }
  }, [block, isNew])

  const dirty =
    isNew || JSON.stringify({ ...draft, tags: parseTags(tagsText) }) !== JSON.stringify(block)

  function parseTags(text: string): string[] {
    return [...new Set(text.split(/[\s,]+/).filter(Boolean))]
  }

  const idInvalid =
    isNew && (!/^[a-z0-9][a-z0-9-]*$/.test(draft.id) || existingIds.includes(draft.id))

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({ ...draft, tags: parseTags(tagsText) })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    if (!confirm(`Delete block "${block.id}"? This removes it from the live resume.`)) return
    setSaving(true)
    try {
      await onDelete()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Delete failed')
      setSaving(false)
    }
  }

  function onFbChange(text: string) {
    setFbText(text)
    setFbStatus('typing…')
    clearTimeout(fbTimer.current)
    fbTimer.current = setTimeout(() => {
      onFeedback(block.id, text)
        .then(() => setFbStatus(text.trim() ? 'saved ✓' : ''))
        .catch(() => setFbStatus('save failed'))
    }, 600)
  }

  return (
    <div
      className={`rb-block${feedback ? ' rb-block--has-feedback' : ''}${dirty ? ' rb-block--dirty' : ''}`}
    >
      <div className="rb-block__row">
        {isNew ? (
          <input
            className="rb-block__id-input"
            placeholder="block-id (kebab-case)"
            value={draft.id}
            onChange={e => setDraft({ ...draft, id: e.target.value })}
          />
        ) : (
          <span className="rb-block__id">{draft.id}</span>
        )}
        <select
          className="rb-block__type"
          value={draft.type}
          onChange={e => setDraft({ ...draft, type: e.target.value as BlockType })}
        >
          {BLOCK_TYPES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label
          className="rb-block__prio"
          title="Priority — how strongly you want this block in a tailored resume. Higher sorts first; a ranking hint, not a hard rule."
        >
          prio
          <input
            type="number"
            min={0}
            max={10}
            value={draft.priority}
            onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })}
          />
        </label>
      </div>

      <input
        className="rb-block__title"
        placeholder="title (review label — not rendered into the resume)"
        value={draft.title}
        onChange={e => setDraft({ ...draft, title: e.target.value })}
      />

      <div className="rb-block__chips">
        {parseTags(tagsText).map(t => (
          <button
            type="button"
            key={t}
            className={`rb-tag rb-tag--${facetOf(t)}`}
            onClick={() => onTagClick(t)}
            title="filter by this tag"
          >
            {t}
          </button>
        ))}
      </div>
      <input
        className="rb-block__tags-input"
        placeholder="tags (space or comma separated, e.g. tech:python story:scale)"
        value={tagsText}
        onChange={e => setTagsText(e.target.value)}
      />

      <textarea
        className="rb-block__content"
        rows={8}
        placeholder="content (markdown)"
        value={draft.content}
        onChange={e => setDraft({ ...draft, content: e.target.value })}
      />

      <div className="rb-block__actions">
        <button
          type="button"
          className="rb-builder__btn rb-builder__btn--primary"
          onClick={() => {
            void handleSave()
          }}
          disabled={saving || !dirty || idInvalid}
        >
          {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
        </button>
        {isNew ? (
          <button type="button" className="rb-builder__btn" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="rb-builder__btn rb-builder__btn--danger"
            onClick={() => {
              void handleDelete()
            }}
            disabled={saving}
          >
            Delete
          </button>
        )}
        {idInvalid && <span className="rb-block__hint">id must be unique kebab-case</span>}
        {saveError && <span className="rb-block__hint rb-block__hint--error">{saveError}</span>}
      </div>

      {!isNew && (
        <div className="rb-block__feedback">
          <textarea
            rows={2}
            placeholder="review note (autosaves)…"
            value={fbText}
            onChange={e => onFbChange(e.target.value)}
          />
          <span className="rb-block__fb-status">{fbStatus}</span>
        </div>
      )}
    </div>
  )
}
