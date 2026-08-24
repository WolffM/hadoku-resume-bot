import React, { useEffect, useState } from 'react'
import { logger } from '@wolffm/logger/client'
import { fetchResume, resumePdfUrl, type ResumePacket } from '../services/api'
import { ResumeDocument } from './ResumeDocument'

interface ResumeViewerProps {
  onAskAbout: (text: string) => void
  ownerName?: string
}

/** Download filename stem: "Matthaeus Wolff" → "matthaeus-wolff-resume". Must
 *  stay in sync with the worker's /resume.pdf Content-Disposition filename. */
export function resumeFilenameBase(ownerName?: string): string {
  const slug = (ownerName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `${slug}-resume` : 'resume'
}

export default function ResumeViewer({ onAskAbout, ownerName }: ResumeViewerProps) {
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

  // Two hardenings over the obvious version. The anchor is put IN the document,
  // because a detached one is the case where browsers are least consistent about
  // honouring `download` — and the fallback, navigating to the blob: URL, is
  // blocked by hadoku.me's CSP (`frame-src 'self'`), which is what a report of
  // silent download failures there looked like. And the object URL is revoked a
  // tick later rather than synchronously: at click time the browser has not
  // finished reading the blob, so revoking immediately is a live race.
  const downloadBlob = (data: BlobPart, mimeType: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([data], { type: mimeType }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(url)
    }, 0)
  }

  const resumeContent = packet?.content ?? ''
  const coverLetter = packet?.coverLetter ?? null
  const hasCover = coverLetter !== null && coverLetter.length > 0
  const activeContent = view === 'cover' && hasCover ? coverLetter : resumeContent

  const variantSlug = packet?.variant ?? new URLSearchParams(window.location.search).get('v')
  // Deliberately no variant slug or packet suffix: a recruiter sees one clean
  // "<owner>-resume.pdf" no matter which tailored variant they were linked.
  const baseFilename = resumeFilenameBase(ownerName)

  // The full packet as one markdown doc — résumé, then a page break, then the
  // cover letter under a heading.
  const packetMarkdown = hasCover
    ? `${resumeContent}\n\n---\n\n# Cover Letter\n\n${coverLetter}`
    : resumeContent

  const handleDownloadMd = () =>
    downloadBlob(hasCover ? packetMarkdown : resumeContent, 'text/markdown', `${baseFilename}.md`)

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
  // when the variant carries one, mirroring the packet .md download. It is a
  // plain link, not a fetch-into-a-Blob: the response already carries
  // `Content-Disposition: attachment` with the owner's filename, and an
  // attachment is saved rather than handed to whatever the browser has
  // registered for application/pdf.
  const pdfHref = resumePdfUrl(variantSlug ?? undefined)

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
            <a className="resume-viewer__download-button" href={pdfHref} download>
              .pdf
            </a>
            <button className="resume-viewer__download-button" onClick={handleDownloadMd}>
              .md
            </button>
            <button className="resume-viewer__download-button" onClick={handleDownloadJson}>
              .json
            </button>
          </div>
        </div>

        {/* Only this scrolls, so the toolbar stays put and keeps its own
            padding out of the document's leading whitespace. */}
        <div className="resume-viewer__scroll">
          {/* On screen: the toggle-selected document. */}
          <div className="resume-viewer__screen">
            <ResumeDocument
              content={activeContent}
              variant={view === 'cover' && hasCover ? 'letter' : 'resume'}
            />
          </div>

          {/* On print / PDF: the full packet — résumé, then cover letter. */}
          <div className="resume-viewer__print">
            <ResumeDocument content={resumeContent} />
            {hasCover && (
              <>
                <div className="resume-viewer__pagebreak" />
                <ResumeDocument content={coverLetter} variant="letter" />
              </>
            )}
          </div>
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
