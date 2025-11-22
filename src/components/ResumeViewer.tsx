import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchResume } from '../services/api'

export default function ResumeViewer() {
  const [resumeContent, setResumeContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    <div className="resume-viewer">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{resumeContent}</ReactMarkdown>
    </div>
  )
}
