import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { sendChatMessage, fetchSystemPrompt, type ChatMessage } from '../services/api'

export interface ChatInterfaceRef {
  askAbout: (text: string) => void
}

const ChatInterface = forwardRef<ChatInterfaceRef>((props, ref) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch system prompt on mount
  useEffect(() => {
    fetchSystemPrompt()
      .then(prompt => setSystemPrompt(prompt))
      .catch(err => console.error('Error fetching system prompt:', err))
  }, [])

  // Scroll to bottom when messages change (but not on initial render)
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Re-focus input after loading completes
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus()
    }
  }, [isLoading])

  // Expose method to parent component
  useImperativeHandle(ref, () => ({
    askAbout: (text: string) => {
      // Create the message content
      const messageContent = `Tell me about: ${text}`

      // Create user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: messageContent
      }

      // Add user message to chat
      setMessages(prev => [...prev, userMessage])
      setError(null)
      setIsLoading(true)

      // Send the message automatically
      const sendMessage = async () => {
        try {
          const messagesToSend: ChatMessage[] = []

          if (systemPrompt) {
            messagesToSend.push({
              role: 'system',
              content: systemPrompt
            })
          }

          messagesToSend.push(...messages, userMessage)

          const response = await sendChatMessage(messagesToSend)

          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: response.message
          }

          setMessages(prev => [...prev, assistantMessage])
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to send message'
          setError(errorMessage)
          setMessages(prev => prev.slice(0, -1))
        } finally {
          setIsLoading(false)
        }
      }

      sendMessage().catch(err => console.error('Error sending message:', err))
    }
  }))

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()

    if (!inputValue.trim() || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputValue.trim()
    }

    // Add user message to chat
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setError(null)
    setIsLoading(true)

    try {
      // Prepare messages to send to backend
      const messagesToSend: ChatMessage[] = []

      // Include system prompt if available
      if (systemPrompt) {
        messagesToSend.push({
          role: 'system',
          content: systemPrompt
        })
      }

      // Add conversation history and current user message
      messagesToSend.push(...messages, userMessage)

      // Send all messages to backend
      const response = await sendChatMessage(messagesToSend)

      // Add assistant response to chat
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.message
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message'
      setError(errorMessage)

      // Remove the failed user message
      setMessages(prev => prev.slice(0, -1))
      // Restore the input
      setInputValue(userMessage.content)
    } finally {
      setIsLoading(false)
    }
  }

  function handleClearChat() {
    setMessages([])
    setError(null)
  }

  return (
    <div className="chat-interface">
      <div className="chat-interface__header">
        <h3>Chat with Resume Bot</h3>
        {messages.length > 0 && (
          <button onClick={handleClearChat} className="chat-interface__clear-button">
            Clear Chat
          </button>
        )}
      </div>

      <div className="chat-interface__messages">
        {messages.length === 0 && (
          <div className="chat-interface__welcome">
            <p>
              Hi! I can answer questions about Matthaeus's resume. Try asking about their
              experience, skills, or projects!
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`chat-message chat-message--${message.role}`}>
            <div className="chat-message__role">
              {message.role === 'user' ? 'You' : 'Resume Bot'}
            </div>
            <div className="chat-message__content">
              {message.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {message.content}
                </ReactMarkdown>
              ) : (
                message.content
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-message chat-message--assistant chat-message--loading">
            <div className="chat-message__role">Resume Bot</div>
            <div className="chat-message__content">Thinking...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="chat-interface__error">
          <p>{error}</p>
        </div>
      )}

      <form
        onSubmit={e => {
          handleSendMessage(e).catch(err => console.error('Error sending message:', err))
        }}
        className="chat-interface__input-form"
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Ask me about the resume..."
          disabled={isLoading}
          className="chat-interface__input"
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className="chat-interface__send-button"
        >
          Send
        </button>
      </form>
    </div>
  )
})

ChatInterface.displayName = 'ChatInterface'

export default ChatInterface
