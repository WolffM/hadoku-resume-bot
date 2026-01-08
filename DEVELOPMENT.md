# Resume Bot - Development & Local Testing Guide

## Getting Started

This project consists of a frontend React app and a backend Express server.

### Prerequisites

- Node.js 18+
- pnpm

### Installation

```bash
# Install frontend dependencies
pnpm install

# Install backend dependencies
cd server
pnpm install
cd ..
```

### Environment Variables

**Backend (.env file in root directory):**

- `GROQ_API_KEY` - Your Groq API key for LLM access
- `SYSTEM_PROMPT` - The system prompt for the chatbot

**Frontend (passed as props on mount):**

- `apiBaseUrl` - Backend API path or URL (e.g., 'http://localhost:3001' for development)

### Running the Application

You need to run both the frontend and backend in separate terminals:

**Terminal 1 - Backend:**

```bash
cd server
pnpm dev
```

The backend will start on http://localhost:3001

**Terminal 2 - Frontend:**

```bash
pnpm dev
```

The frontend will start on http://localhost:5173

### API Endpoints

**Backend (http://localhost:3001):**

- `POST /api/chat` - Send chat messages (rate limited: 10 requests/minute per IP)
- `GET /api/resume` - Fetch resume markdown content
- `GET /api/system-prompt` - Fetch the system prompt

### Project Structure

```text
.
├── src/                    # Frontend React application
│   ├── components/         # React components
│   │   ├── ChatInterface.tsx
│   │   └── ResumeViewer.tsx
│   ├── services/          # API client services
│   │   └── api.ts
│   ├── styles/            # CSS styling (theme variables)
│   │   └── index.css
│   ├── App.tsx            # Main app component
│   └── entry.tsx          # Entry point (mount/unmount)
│
├── server/                # Backend Express server
│   └── src/
│       └── index.ts       # Express server with Groq integration
│
├── .env                   # Environment variables (gitignored)
└── resume.md             # Resume content (gitignored)
```

### Features

- **Chat Interface**: Interactive chat with Groq-powered LLM (openai/gpt-oss-120b model)
- **Resume Viewer**: Markdown-rendered resume display
- **Theme Support**: Full integration with @wolffm/themes package
- **Responsive Design**: Theme-aware CSS using CSS variables

### Development Notes

- The frontend uses CSS variables from `@wolffm/themes` - no hardcoded colors
- Resume content is loaded from `resume.md` file (gitignored)

### Troubleshooting

**Backend not connecting:**

- Check that `.env` file exists with `GROQ_API_KEY`
- Verify the backend is running on port 3001
- Check console for error messages

**Frontend API errors:**

- Ensure the `apiBaseUrl` prop passed to `mount()` points to the correct backend URL
- Verify CORS is enabled on the backend
- Check browser console for CORS or network errors

**Resume not loading:**

- Ensure `resume.md` exists in the project root
- Check that the file is readable by the backend process
