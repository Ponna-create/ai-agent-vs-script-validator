# AI Agent vs Script Validator

A web application that helps developers decide whether they need an AI agent or a simple script for their project. This tool analyzes project requirements and provides intelligent recommendations based on complexity, scope, and specific needs.

## Features

- Project description analysis (450+ word requirement)
- AI-powered decision making
- Confidence score calculation
- Detailed recommendations and cost estimates
- Code template generation
- Markdown file download/upload functionality
- Session management with 2 re-uploads per payment
- Modern dark theme UI

## Tech Stack

- Backend: Node.js/Express
- Frontend: HTML, CSS, JavaScript (Vanilla)
- AI Integration: OpenAI GPT-4
- Security: Helmet, CORS
- File Handling: Multer

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open http://localhost:3000 in your browser

## Development

- `npm run dev`: Start development server with hot reload
- `npm start`: Start production server

## Security Features

- CSP (Content Security Policy) implementation
- CORS protection
- File upload validation
- Session management
- Secure payment handling

## License

ISC 