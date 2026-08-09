import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { logger } from '@wolffm/logger/client'
import { fetchResume, fetchResumePdf, type ResumePacket } from '../services/api'

interface ResumeViewerProps {
  onAskAbout: (text: string) => void
}

// Contract with the worker's assembler (worker/src/skeleton.ts): résumé markdown
// carries this sentinel between page groups. react-markdown drops the raw HTML
// comment, so we split on it and render each page as its own block with the
// print-only pagebreak element between them.
const PAGE_BREAK_MARKER = '<!-- page-break -->'

/** Render résumé markdown, honouring embedded page-break markers. */
function MarkdownPages({ content }: { content: string }): React.ReactElement {
  const pages = content.split(PAGE_BREAK_MARKER)
  return (
    <>
      {pages.map((page, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div className="resume-viewer__pagebreak" />}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{page}</ReactMarkdown>
        </React.Fragment>
      ))}
    </>
  )
}

export default function ResumeViewer({ onAskAbout }: ResumeViewerProps) {
  const [packet, setPacket] = useState<ResumePacket | null>(null)
  const [view, setView] = useState<'resume' | 'cover'>('resume')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(
    null
  )

  useEffect(() => {
    loadResume().catch(err =>
      logger.error('[ResumeViewer] Error loading resume', {
        error: (err as Error)?.message ?? String(err)
      })
    )
  }, [])

  async function loadResume() {
    try {
      setLoading(true)
      setError(null)
      // Only a URL ?v={slug} serves a tailored variant. A bare /resume always
      // serves the canonical résumé — the slug is never persisted, so nobody
      // (owner or recruiter) gets a stale point-in-time variant on a later visit.
      const slug = new URLSearchParams(window.location.search).get('v') ?? undefined

      const result = await fetchResume(slug)
      setPacket(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load resume')
    } finally {
      setLoading(false)
    }
  }

  // Close context menu when clicking anywhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim()

    if (selectedText && selectedText.length > 0) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        text: selectedText
      })
    }
  }

  const handleAskAboutClick = () => {
    if (contextMenu) {
      onAskAbout(contextMenu.text)
      setContextMenu(null)
    }
  }

  const downloadBlob = (data: BlobPart, mimeType: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([data], { type: mimeType }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const resumeContent = packet?.content ?? ''
  const coverLetter = packet?.coverLetter ?? null
  const hasCover = coverLetter !== null && coverLetter.length > 0
  const activeContent = view === 'cover' && hasCover ? coverLetter : resumeContent

  const variantSlug = packet?.variant ?? new URLSearchParams(window.location.search).get('v')
  const baseFilename = variantSlug ? `resume-${variantSlug}` : 'resume'

  // The full packet as one markdown doc — résumé, then a page break, then the
  // cover letter under a heading.
  const packetMarkdown = hasCover
    ? `${resumeContent}\n\n---\n\n# Cover Letter\n\n${coverLetter}`
    : resumeContent

  const handleDownloadMd = () =>
    hasCover
      ? downloadBlob(packetMarkdown, 'text/markdown', `${baseFilename}-packet.md`)
      : downloadBlob(resumeContent, 'text/markdown', `${baseFilename}.md`)

  const handleDownloadJson = () =>
    downloadBlob(
      JSON.stringify(
        {
          content: resumeContent,
          cover_letter: coverLetter ?? undefined,
          variant: variantSlug ?? undefined,
          label: packet?.label ?? undefined,
          company: packet?.company ?? undefined,
          job_title: packet?.jobTitle ?? undefined,
          format: 'markdown'
        },
        null,
        2
      ),
      'application/json',
      `${baseFilename}.json`
    )

  // The PDF is rendered server-side from the same canonical markdown and
  // downloaded as a file — no print dialog. The API includes the cover letter
  // when the variant carries one, mirroring the packet .md download.
  const handleDownloadPdf = () => {
    fetchResumePdf(variantSlug ?? undefined)
      .then(blob =>
        downloadBlob(
          blob,
          'application/pdf',
          hasCover ? `${baseFilename}-packet.pdf` : `${baseFilename}.pdf`
        )
      )
      .catch(err =>
        logger.error('[ResumeViewer] Error downloading resume PDF', {
          error: (err as Error)?.message ?? String(err)
        })
      )
  }

  if (loading) {
    return (
      <div className="resume-viewer resume-viewer--loading">
        <p>Loading resume...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="resume-viewer resume-viewer--error">
        <p className="resume-viewer__error-message">Error: {error}</p>
        <button
          onClick={() => {
            loadResume().catch(err =>
              logger.error('[ResumeViewer] Error loading resume', {
                error: (err as Error)?.message ?? String(err)
              })
            )
          }}
          className="resume-viewer__retry-button"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="resume-viewer" onContextMenu={handleContextMenu}>
        <div className="resume-viewer__toolbar">
          {hasCover && (
            <div className="resume-viewer__toggle" role="tablist" aria-label="Packet document">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'resume'}
                className={
                  view === 'resume'
                    ? 'resume-viewer__toggle-btn resume-viewer__toggle-btn--active'
                    : 'resume-viewer__toggle-btn'
                }
                onClick={() => setView('resume')}
              >
                Résumé
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'cover'}
                className={
                  view === 'cover'
                    ? 'resume-viewer__toggle-btn resume-viewer__toggle-btn--active'
                    : 'resume-viewer__toggle-btn'
                }
                onClick={() => setView('cover')}
              >
                Cover letter
              </button>
            </div>
          )}
          <div className="resume-viewer__downloads">
            <span className="resume-viewer__downloads-label">Download</span>
            <button className="resume-viewer__download-button" onClick={handleDownloadPdf}>
              .pdf
            </button>
            <button className="resume-viewer__download-button" onClick={handleDownloadMd}>
              .md
            </button>
            <button className="resume-viewer__download-button" onClick={handleDownloadJson}>
              .json
            </button>
          </div>
        </div>

        {/* On screen: the toggle-selected document. */}
        <div className="resume-viewer__screen">
          <MarkdownPages content={activeContent} />
        </div>

        {/* On print / PDF: the full packet — résumé, then cover letter. */}
        <div className="resume-viewer__print">
          <MarkdownPages content={resumeContent} />
          {hasCover && (
            <>
              <div className="resume-viewer__pagebreak" />
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{coverLetter}</ReactMarkdown>
            </>
          )}
        </div>
      </div>
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000
          }}
        >
          <button className="context-menu__item" onClick={handleAskAboutClick}>
            Ask about this
          </button>
        </div>
      )}
    </>
  )
}
