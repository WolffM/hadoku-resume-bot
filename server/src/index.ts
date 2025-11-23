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

// System prompt endpoint
app.get('/api/system-prompt', async (req, res) => {
  try {
    // Load resume content
    const resumePath = join(dirname(fileURLToPath(import.meta.url)), '../../resume.md')
    const resumeContent = await readFile(resumePath, 'utf-8')

    // Prepare system prompt with resume content
    const basePrompt = process.env.SYSTEM_PROMPT
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
app.post('/api/chat', async (req, res) => {
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
      max_completion_tokens: 512
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
