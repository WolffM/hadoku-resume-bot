import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') })

const app = express()
const PORT = process.env.PORT || 3001

// Initialize Groq client using OpenAI SDK
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
})

// Middleware
app.use(cors())
app.use(express.json())

// Rate limiting store (in-memory)
interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10

// Rate limiting middleware
function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()

  const entry = rateLimitStore.get(ip)

  if (!entry || now > entry.resetTime) {
    // New window or expired window
    rateLimitStore.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    })
    return next()
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const resetIn = Math.ceil((entry.resetTime - now) / 1000)
    return res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${resetIn} seconds.`,
      retryAfter: resetIn
    })
  }

  entry.count++
  next()
}

// Clean up expired rate limit entries every 5 minutes
setInterval(
  () => {
    const now = Date.now()
    for (const [ip, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(ip)
      }
    }
  },
  5 * 60 * 1000
)

// System prompt endpoint
app.get('/api/system-prompt', async (req, res) => {
  try {
    // Load resume content
    const resumePath = join(dirname(fileURLToPath(import.meta.url)), '../../resume.md')
    const resumeContent = await readFile(resumePath, 'utf-8')

    // Prepare system prompt with resume content
    const basePrompt = process.env.SYSTEM_PROMPT || 'You are a helpful assistant.'
    const systemPrompt = `${basePrompt}

## Resume Content

Here is Matthaeus Wolff's complete resume. Use this information to answer questions accurately:

${resumeContent}

Remember: Only provide information that is explicitly stated in the resume above. Do not invent or speculate about information not present in the resume.`

    res.json({
      systemPrompt
    })
  } catch (error) {
    console.error('Error reading system prompt:', error)

    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      res.status(404).json({
        error: 'Resume file not found'
      })
    } else {
      res.status(500).json({
        error: 'Failed to read system prompt'
      })
    }
  }
})

// Chat endpoint
app.post('/api/chat', rateLimiter, async (req, res) => {
  try {
    const { messages } = req.body as { messages?: unknown }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request: messages array required' })
    }

    // Call Groq API with the messages (system prompt should be included from frontend)
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: 0.7,
      max_tokens: 1024
    })

    const responseMessage = completion.choices[0]?.message?.content || 'No response generated'

    res.json({
      message: responseMessage,
      usage: completion.usage
    })
  } catch (error) {
    console.error('Error calling Groq API:', error)

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Failed to process chat request',
        message: error.message
      })
    } else {
      res.status(500).json({
        error: 'Failed to process chat request'
      })
    }
  }
})

// Resume endpoint
app.get('/api/resume', async (req, res) => {
  try {
    // Read resume.md from project root
    const resumePath = join(dirname(fileURLToPath(import.meta.url)), '../../resume.md')
    const resumeContent = await readFile(resumePath, 'utf-8')

    res.json({
      content: resumeContent
    })
  } catch (error) {
    console.error('Error reading resume file:', error)

    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      res.status(404).json({
        error: 'Resume file not found'
      })
    } else {
      res.status(500).json({
        error: 'Failed to read resume file'
      })
    }
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`Resume Bot backend running on http://localhost:${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})
