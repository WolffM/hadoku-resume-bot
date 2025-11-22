# Resume Bot - Project Overview

## Project Specifications

**URL**: `hadoku.me/resume`
**Package**: `@wolffm/resume-bot`
**Access**: Public (no authentication required)
**Purpose**: Conversational AI assistant to showcase resume content interactively

---

## Development Phases

### Phase 1: Core Functionality

**Goal**: Build working chat interface with LLM integration and markdown viewer

**LLM Provider**: Groq (openai/gpt-oss-120b model)

**Architecture**:

- Frontend: Chat UI component with markdown viewer
- Backend: API server to handle Groq requests and serve resume content

**Deliverables**:

1. **Backend Setup**
   - Express/Node.js server with API endpoints
   - Groq API integration (OpenAI SDK compatible)
   - Environment variables for API key and system prompt
   - `/api/chat` endpoint for LLM requests
   - `/api/resume` endpoint to serve markdown content
   - CORS configuration for frontend

2. **Frontend Components**
   - Chat UI component
   - Markdown viewer for resume content
   - API client to communicate with backend
   - Mount/unmount pattern following template

3. **Configuration**
   - `.env` file with `GROQ_API_KEY` and `SYSTEM_PROMPT`
   - Future: Migrate prompt to key vault/secrets manager

**Success Criteria**:

- User can chat with bot at `hadoku.me/resume`
- Backend successfully proxies requests to Groq API
- Bot answers questions about resume accurately using system prompt
- Markdown content displays correctly
- API key secured in environment variables

**Implementation Steps**:

1. Set up backend server with Groq integration
2. Create API endpoints for chat and resume content
3. Build frontend chat UI component
4. Integrate markdown viewer
5. Connect frontend to backend APIs
6. Test end-to-end chat flow

**Notes**:

- Can use hardcoded colors/styling for MVP
- Basic rate limiting acceptable (localStorage counter or simple backend throttling)
- Focus on functionality over polish
- System prompt stored in `.env` for now, will migrate to key vault in future phase

---

### Phase 2: Calendar Integration

**Goal**: Add link to schedule meetings via `hadoku.me/appointment`

**Deliverables**:

- Intent detection in chat (detect scheduling requests)
- Suggest calendar link in bot responses
- Pass chat context to calendar app (topic, summary)

**Success Criteria**:

- Bot detects scheduling intent
- Calendar link works with context
- Context received by appointment app

**Context Passing Options**:

- URL query params (simple, limited data)
- LocalStorage (more data, expiry required)

**Notes**:

- Calendar/appointment app doesn't exist yet
- Keep context simple and expire after 5-10 minutes
- Coordinate with team on calendar app implementation

---

## Technical Setup

### Template Usage

1. Follow template guide in [template/TEMPLATE.md](template/TEMPLATE.md)


### Additional Dependencies

Beyond what's in the template, you'll need:

- LLM SDK: `openai`, `@anthropic-ai/sdk`, or similar
- Markdown: `react-markdown`, `marked`, or similar

### Props Interface

```typescript
interface ResumeAppProps {
  theme?: string // Phase 2: 'default', 'ocean', etc.
  environment?: 'development' | 'production'
  serverOrigin?: string // API endpoint if needed
  sessionId?: string // Session identifier
}
```
