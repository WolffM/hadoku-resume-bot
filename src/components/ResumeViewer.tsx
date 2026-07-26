import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { logger } from '@wolffm/logger/client'
import { fetchResume, type ResumePacket } from '../services/api'

interface ResumeViewerProps {
  onAskAbout: (text: string) => void
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
      // A shared link like /resume?v={slug} serves that link's tailored variant
      const variant = new URLSearchParams(window.location.search).get('v') ?? undefined
      setPacket(await fetchResume(variant))
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

  const downloadBlob = (data: string, mimeType: string, filename: string) => {
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

  // Print stylesheet isolates the resume panel; the browser's print dialog
  // handles the actual PDF rendering. The print-only block below renders the
  // full packet (résumé + cover letter) regardless of the on-screen toggle.
  const handleDownloadPdf = () => window.print()

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
            <button className="resume-viewer__download-button" onClick={handleDownloadPdf}>
              PDF
            </button>
            <button className="resume-viewer__download-button" onClick={handleDownloadMd}>
              {hasCover ? 'Packet .md' : '.md'}
            </button>
            <button className="resume-viewer__download-button" onClick={handleDownloadJson}>
              .json
            </button>
          </div>
        </div>

        {/* On screen: the toggle-selected document. */}
        <div className="resume-viewer__screen">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeContent}</ReactMarkdown>
        </div>

        {/* On print / PDF: the full packet — résumé, then cover letter. */}
        <div className="resume-viewer__print">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{resumeContent}</ReactMarkdown>
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
