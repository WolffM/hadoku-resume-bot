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

**Deliverables**:
- Chat UI component
- LLM integration (OpenAI/Anthropic/local model)
- Markdown viewer for resume content
- LLM generates responses based on resume markdown
- Mount/unmount pattern following template

**Success Criteria**:
- User can chat with bot at `hadoku.me/resume`
- Bot answers questions about resume accurately
- Markdown content displays correctly

**Notes**:
- Can use hardcoded colors/styling for MVP
- Basic rate limiting acceptable (localStorage counter)
- Focus on functionality over polish

---

### Phase 2: Theme Integration
**Goal**: Integrate with parent's theming system

**Deliverables**:
- Import and use `@wolffm/themes` package (mandatory)
- Inherit theme from parent on mount via props
- Apply `data-theme` and `data-dark-theme` attributes
- Replace all hardcoded colors with CSS variables
- Auto-detect dark mode with `matchMedia`

**Success Criteria**:
- Theme changes in parent reflect in resume bot
- Dark mode toggles correctly
- No hardcoded colors remain

**Reference**: See [template/TEMPLATE.md](template/TEMPLATE.md) for theme integration details

---

### Phase 3: Calendar Integration
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

1. Copy `docs/child-apps/template/` to new repo
2. Follow setup in [template/TEMPLATE.md](template/TEMPLATE.md)
3. Replace `@wolffm/your-app` → `@wolffm/resume-bot`

### Additional Dependencies

Beyond what's in the template, you'll need:
- LLM SDK: `openai`, `@anthropic-ai/sdk`, or similar
- Markdown: `react-markdown`, `marked`, or similar

### Props Interface

```typescript
interface ResumeAppProps {
  theme?: string;              // Phase 2: 'default', 'ocean', etc.
  environment?: 'development' | 'production';
  serverOrigin?: string;       // API endpoint if needed
  sessionId?: string;          // Session identifier
}
```
