# AI Spec Generator

Web app that helps non-tech founders and developers create production-ready .md spec files for AI coding tools (Claude Code, Lovable, Bolt, Cursor, Replit Agent).

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL + Prisma ORM
- **AI**: OpenAI API (GPT-4o-mini free tier, GPT-4o pro tier)
- **Auth**: JWT + bcryptjs
- **Payments**: Razorpay
- **Frontend**: Vanilla JS + Custom CSS (dark theme)
- **Deployment**: Vercel

## Commands

- `npm run dev`: Start dev server with nodemon
- `npm run build`: Verify env + prisma generate
- `npm run vercel-build`: prisma generate + db push + npm install
- `npx prisma studio`: Open database GUI
- `npx prisma db push`: Push schema changes to DB

## Architecture

```
/public          - Static frontend (HTML, CSS, JS)
/routes          - Express route handlers (user, payment, spec)
/middleware       - Auth (JWT) and rate limiting
/utils           - Razorpay init, email, AI generation helpers
/prisma          - Schema and migrations
server.js        - Main Express app entry point
```

## Important Notes

- Free specs use GPT-4o-mini ($0.003/call), Pro specs use GPT-4o ($0.13/call)
- Razorpay key_id is public (sent to frontend), key_secret is private (never exposed)
- HMAC-SHA256 for payment signature verification
- All AI responses must be validated for required fields before returning to client
- .env contains secrets — never commit
