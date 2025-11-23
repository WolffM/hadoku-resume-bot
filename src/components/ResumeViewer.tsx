import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchResume } from '../services/api'

interface ResumeViewerProps {
  onAskAbout: (text: string) => void
}

export default function ResumeViewer({ onAskAbout }: ResumeViewerProps) {
  const [resumeContent, setResumeContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(
    null
  )

  useEffect(() => {
    loadResume().catch(err => console.error('Error loading resume:', err))
  }, [])

  async function loadResume() {
    try {
      setLoading(true)
      setError(null)
      const content = await fetchResume()
      setResumeContent(content)
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
            loadResume().catch(err => console.error('Error loading resume:', err))
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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{resumeContent}</ReactMarkdown>
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
