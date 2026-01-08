# Resume Bot - API Specification

**Version**: Phase 1
**Last Updated**: 2025-11-22

This document specifies the exact API contract that the frontend expects from the backend. When reimplementing the backend elsewhere, ensure all endpoints match these specifications exactly.

---

## Base URL

**Development**: `http://localhost:3001`
**Production**: Set via `VITE_API_BASE_URL` environment variable

---

## API Endpoints

### 1. POST /api/chat

Send chat messages to the LLM and receive responses.

#### Rate Limiting

- **Limit**: 10 requests per minute per IP address
- **Window**: 60 seconds (rolling)
- **Storage**: In-memory (resets on server restart)

#### Request

**Method**: `POST`
**Content-Type**: `application/json`

**Body**:

```json
{
  "messages": [
    {
      "role": "system" | "user" | "assistant",
      "content": "string"
    }
  ]
}
```

**Validation**:

- `messages` field is required
- `messages` must be an array
- Each message must have `role` and `content` fields
- Valid roles: `"system"`, `"user"`, `"assistant"`

**Example**:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant..."
    },
    {
      "role": "user",
      "content": "What experience do you have with React?"
    }
  ]
}
```

#### Success Response

**Status**: `200 OK`
**Content-Type**: `application/json`

**Body**:

```json
{
  "message": "string",
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

**Fields**:

- `message` (string, required): The LLM's response text
- `usage` (object, optional): Token usage statistics
  - `prompt_tokens` (number): Number of tokens in the prompt
  - `completion_tokens` (number): Number of tokens in the completion
  - `total_tokens` (number): Total tokens used

**Example**:

```json
{
  "message": "Based on the resume, I have 5 years of experience with React...",
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 75,
    "total_tokens": 225
  }
}
```

#### Error Responses

**400 Bad Request** - Invalid request format

```json
{
  "error": "Invalid request: messages array required"
}
```

**429 Too Many Requests** - Rate limit exceeded

```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "retryAfter": 45
}
```

**500 Internal Server Error** - Server or LLM API error

```json
{
  "error": "Failed to process chat request",
  "message": "Additional error details"
}
```

---

### 2. GET /api/resume

Fetch the resume content in markdown format.

#### Resume Request

**Method**: `GET`
**Parameters**: None

#### Resume Success Response

**Status**: `200 OK`
**Content-Type**: `application/json`

**Body**:

```json
{
  "content": "string"
}
```

**Fields**:

- `content` (string, required): Full resume content in markdown format

**Example**:

```json
{
  "content": "# Matthaeus Wolff\n\n## Experience\n\n### Senior Developer\n..."
}
```

#### Resume Error Responses

**404 Not Found** - Resume file not found

```json
{
  "error": "Resume file not found"
}
```

**500 Internal Server Error** - File read error

```json
{
  "error": "Failed to read resume file"
}
```

---

### 3. GET /api/system-prompt

Fetch the complete system prompt including resume content.

**Note**: This endpoint is used by the frontend to retrieve the initial system prompt that includes the resume content. The system prompt is constructed by combining the base prompt from environment variables with the resume markdown content.

#### System Prompt Request

**Method**: `GET`
**Parameters**: None

#### System Prompt Success Response

**Status**: `200 OK`
**Content-Type**: `application/json`

**Body**:

```json
{
  "systemPrompt": "string"
}
```

**Fields**:

- `systemPrompt` (string, required): Complete system prompt including base instructions and resume content

**Format**:
The system prompt follows this structure:

```
{BASE_PROMPT from SYSTEM_PROMPT env var}

## Resume Content

Here is Matthaeus Wolff's complete resume. Use this information to answer questions accurately:

{RESUME_CONTENT from resume.md file}

Remember: Only provide information that is explicitly stated in the resume above. Do not invent or speculate about information not present in the resume.
```

**Example**:

```json
{
  "systemPrompt": "You are a helpful assistant...\n\n## Resume Content\n\nHere is Matthaeus Wolff's complete resume..."
}
```

#### System Prompt Error Responses

**404 Not Found** - Resume file not found

```json
{
  "error": "Resume file not found"
}
```

**500 Internal Server Error** - File read error

```json
{
  "error": "Failed to read system prompt"
}
```

---

## CORS Configuration

The backend must enable CORS to allow requests from the frontend origin.

**Development**: Allow `http://localhost:5173` (Vite dev server)
**Production**: Configure allowed origins based on deployment

**Required Headers**:

- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`

---

## Environment Variables

The backend requires the following environment variables:

### Required

**`GROQ_API_KEY`**

- Type: String
- Description: API key for Groq LLM service
- Example: `gsk_...`

### Optional

**`SYSTEM_PROMPT`**

- Type: String
- Description: Base system prompt for the chatbot (resume content is appended automatically)
- Default: `"You are a helpful assistant."`
- Example: `"You are an AI assistant helping visitors learn about Matthaeus Wolff's professional background."`

**`PORT`**

- Type: Number
- Description: Port for the backend server
- Default: `3001`

**`NODE_ENV`**

- Type: String
- Description: Environment mode
- Values: `"development"` | `"production"`
- Default: `"development"`

---

## LLM Configuration

### Provider

**Groq** via OpenAI-compatible SDK

### Model

**`openai/gpt-oss-120b`**

### API Base URL

`https://api.groq.com/openai/v1`

### Parameters

```typescript
{
  model: 'openai/gpt-oss-120b',
  messages: [...],  // From request body
  temperature: 0.7,
  max_tokens: 1024
}
```

---

## File Structure Requirements

The backend expects the following file in the project root:

**`resume.md`**

- Location: Project root directory
- Format: Markdown
- Encoding: UTF-8
- Purpose: Contains the resume content to be served via `/api/resume` and included in system prompts

---

## Error Handling Guidelines

### Client Errors (4xx)

- **400**: Request validation failures (missing required fields, invalid types)
- **404**: Resource not found (resume file missing)
- **429**: Rate limit exceeded

### Server Errors (5xx)

- **500**: Internal server errors, LLM API failures, file read errors

### Error Response Format

All errors return JSON with at least an `error` field:

```typescript
{
  error: string         // Brief error identifier
  message?: string      // Human-readable error description
  retryAfter?: number   // Seconds to wait (for 429 responses)
}
```

---

## TypeScript Interfaces

Reference implementations from [src/services/api.ts](src/services/api.ts):

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  message: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ResumeResponse {
  content: string
}

export interface SystemPromptResponse {
  systemPrompt: string
}

export interface ApiError {
  error: string
  message?: string
  retryAfter?: number
}
```

---

## Testing Checklist

When implementing the backend elsewhere, verify:

- [ ] `/api/chat` accepts message array and returns response
- [ ] Rate limiting works (10 req/min per IP)
- [ ] Rate limit returns 429 with `retryAfter` field
- [ ] `/api/resume` returns markdown content
- [ ] `/api/system-prompt` returns combined prompt with resume
- [ ] CORS headers allow frontend origin
- [ ] 400 errors for invalid request bodies
- [ ] 404 errors when resume.md is missing
- [ ] 500 errors handled gracefully with error messages
- [ ] LLM integration uses correct model and parameters
- [ ] Environment variables loaded correctly
- [ ] Server starts on correct port

---

## Migration Notes

### From Current Express Server

The current implementation uses:

- **Runtime**: Node.js with ES modules
- **Framework**: Express.js
- **LLM SDK**: OpenAI SDK (configured for Groq)
- **Rate Limiting**: In-memory Map (simple implementation)
- **File Reading**: `fs/promises` for resume.md

When migrating to a different stack (e.g., Python/FastAPI, Go, etc.), ensure:

1. All endpoint paths and methods match exactly
2. Request/response JSON structures are identical
3. Error status codes and formats match
4. Rate limiting behavior is equivalent
5. CORS configuration allows the frontend origin
6. Environment variable names are unchanged (for consistency)

---

## Support

For questions about this API specification, refer to:

- [DEVELOPMENT.md](DEVELOPMENT.md) - Development setup guide
- [RESUME_BOT_PROJECT.md](RESUME_BOT_PROJECT.md) - Project overview and phases
- [src/services/api.ts](src/services/api.ts) - Frontend API client implementation
