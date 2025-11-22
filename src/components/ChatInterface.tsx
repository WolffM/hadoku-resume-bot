import React, { useState, useRef, useEffect } from 'react'
import { sendChatMessage, type ChatMessage } from '../services/api'

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()

    if (!inputValue.trim() || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputValue.trim()
    }

    // Add user message to chat
    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setError(null)
    setIsLoading(true)

    try {
      // Send all messages to backend
      const response = await sendChatMessage([...messages, userMessage])

      // Add assistant response to chat
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.message
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message'
      setError(errorMessage)

      // Remove the failed user message
      setMessages((prev) => prev.slice(0, -1))
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
        <h2>Chat with Resume Bot</h2>
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
            <div className="chat-message__content">{message.content}</div>
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
        onSubmit={(e) => {
          handleSendMessage(e).catch((err) => console.error('Error sending message:', err))
        }}
        className="chat-interface__input-form"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask me about the resume..."
          disabled={isLoading}
          className="chat-interface__input"
        />
        <button type="submit" disabled={isLoading || !inputValue.trim()} className="chat-interface__send-button">
          Send
        </button>
      </form>
    </div>
  )
}
