const OpenAI = require('openai');

function getClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 120000,
    maxRetries: 2
  });
}

// Build context string from user inputs
function buildContext(input) {
  const parts = [];
  parts.push(`App Name: ${input.appName || 'Untitled App'}`);
  parts.push(`Description: ${input.appDescription}`);
  if (input.problemSolved) parts.push(`Problem it solves: ${input.problemSolved}`);
  if (input.targetUsers) parts.push(`Target users: ${input.targetUsers}`);
  parts.push(`Platform: ${input.platform || 'web'}`);
  parts.push(`AI Tool: ${input.aiTool || 'claude-code'}`);

  if (input.features && input.features.length > 0) {
    parts.push(`Core Features:\n${input.features.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
  }
  if (input.userRoles && input.userRoles.length > 0) {
    parts.push(`User Roles: ${input.userRoles.join(', ')}`);
  }
  if (input.authType) parts.push(`Authentication: ${input.authType}`);
  if (input.techStack && input.techStack !== 'auto') parts.push(`Preferred Tech Stack: ${input.techStack}`);
  if (input.database && input.database !== 'auto') parts.push(`Preferred Database: ${input.database}`);
  if (input.designStyle) parts.push(`Design Style: ${input.designStyle}`);
  if (input.colorScheme) parts.push(`Color Scheme: ${input.colorScheme}`);
  if (input.referenceUrl) parts.push(`Reference Website: ${input.referenceUrl}`);
  if (input.needsPayments) parts.push('Needs: Payment processing');
  if (input.needsUploads) parts.push('Needs: File uploads');
  if (input.needsRealtime) parts.push('Needs: Real-time features (chat, notifications, live updates)');
  if (input.darkMode) parts.push('Needs: Dark mode support');

  return parts.join('\n');
}

// Tool-specific formatting instructions
function getToolInstructions(aiTool) {
  const instructions = {
    'claude-code': `Format this as a CLAUDE.md-style specification that Claude Code can follow precisely. Use clear headers, bullet points, and be explicit about file structure, commands, and implementation steps. Claude Code works best with detailed, instruction-style specs that describe the exact file tree and implementation order.`,
    'lovable': `Format this for Lovable (GPT Engineer). Focus heavily on UI/UX descriptions, component layouts, and user flows. Lovable excels at frontend-first development, so describe visual elements in detail — colors, spacing, component hierarchy, responsive behavior.`,
    'bolt': `Format this for Bolt.new. Be concise and action-oriented. Bolt works best with clear, single-page specs that describe the full app in one shot. Focus on the core functionality and keep it under 2000 words for optimal results.`,
    'cursor': `Format this for Cursor IDE. Include detailed file structure, code patterns, and technical implementation details. Cursor developers are typically more technical, so include API contracts, type definitions, and architectural patterns.`,
    'replit': `Format this for Replit Agent. Use step-by-step instructions with clear milestones. Replit Agent works well with sequential tasks, so break the project into phases. Include deployment configuration for Replit hosting.`,
    'other': `Format this as a universal project specification that works with any AI coding tool. Use clear markdown structure with headers, bullet points, and code blocks.`
  };
  return instructions[aiTool] || instructions['other'];
}

// Generate FREE tier spec (single .md file using GPT-4o-mini)
async function generateFreeSpec(input) {
  const openai = getClient();
  const context = buildContext(input);
  const toolInstructions = getToolInstructions(input.aiTool);

  const prompt = `You are an expert software architect. A user wants to build an application and needs a production-ready specification file that they can paste into an AI coding tool to get a working app.

${toolInstructions}

Here is what the user wants to build:
${context}

Generate a clean, well-structured markdown specification file that includes:

1. **Project Overview** - What the app does, who it's for
2. **Tech Stack** - Recommended technologies with brief justification
3. **Core Features** - Detailed feature descriptions with acceptance criteria
4. **Pages/Screens** - List every page with its purpose and key UI elements
5. **Data Model** - Database tables/collections with fields and relationships
6. **User Flow** - Step-by-step user journey through the app
7. **File Structure** - Recommended project directory layout

IMPORTANT RULES:
- Be SPECIFIC, not vague. Instead of "nice UI", describe exact layout, colors, components.
- Include actual field names, data types, and relationships in the data model.
- For each page, describe what the user sees and can do.
- The spec should be detailed enough that an AI coding tool can build a working v1 with minimal questions.
- Output ONLY the markdown content. No explanations before or after.
- Start with: # ${input.appName || 'App'} - Project Specification`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 4000
  });

  return completion.choices[0].message.content;
}

// Generate PRO tier spec pack (6 files using GPT-4o)
async function generateProSpec(input) {
  const openai = getClient();
  const context = buildContext(input);
  const toolInstructions = getToolInstructions(input.aiTool);

  // Call 1: PRD + Technical Architecture
  const call1 = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: 'You are a senior software architect who creates detailed, production-ready specifications. Output ONLY valid markdown. No explanations outside the document.'
    }, {
      role: 'user',
      content: `Create TWO specification documents for this project. Separate them with exactly "---SPLIT---" on its own line.

${toolInstructions}

PROJECT DETAILS:
${context}

DOCUMENT 1: PRD.md (Product Requirements Document)
Include:
- Executive Summary (2-3 sentences)
- Problem Statement
- Target Users & Personas (with names, goals, pain points)
- Feature Specifications (detailed — for each feature: description, user story, acceptance criteria, edge cases)
- User Stories in format: "As a [role], I want to [action], so that [benefit]"
- Success Metrics (measurable KPIs)
- Out of Scope (what this v1 does NOT include)

DOCUMENT 2: TECHNICAL.md (Technical Architecture)
Include:
- Recommended Tech Stack (with justification for each choice)
- Project File Structure (complete directory tree with explanations)
- Architecture Overview (how components connect)
- Third-Party Services & APIs needed
- Environment Variables needed (list all with descriptions)
- Error Handling Strategy
- Security Considerations
- Performance Considerations`
    }],
    temperature: 0.7,
    max_tokens: 6000
  });

  const [prd, technical] = call1.choices[0].message.content.split('---SPLIT---').map(s => s.trim());

  // Call 2: Database + API
  const call2 = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: 'You are a senior backend architect. Output ONLY valid markdown. No explanations outside the document.'
    }, {
      role: 'user',
      content: `Based on this project, create TWO documents. Separate them with exactly "---SPLIT---" on its own line.

PROJECT: ${input.appName || 'App'}
DESCRIPTION: ${input.appDescription}
FEATURES: ${(input.features || []).join(', ')}
DATABASE PREFERENCE: ${input.database || 'auto'}
AUTH TYPE: ${input.authType || 'email-password'}
NEEDS PAYMENTS: ${input.needsPayments ? 'Yes' : 'No'}
NEEDS FILE UPLOADS: ${input.needsUploads ? 'Yes' : 'No'}
NEEDS REALTIME: ${input.needsRealtime ? 'Yes' : 'No'}

DOCUMENT 1: DATABASE.md
Include:
- Complete schema with ALL tables/collections
- For each table: field name, data type, constraints (required, unique, default), description
- Relationships (one-to-many, many-to-many) with foreign keys
- Indexes for common queries
- Seed data examples (3-5 rows per table in a code block)
- Migration strategy notes

DOCUMENT 2: API.md
Include:
- Base URL structure
- Authentication endpoints (signup, login, logout, refresh)
- CRUD endpoints for every resource
- For each endpoint: Method, URL, Headers, Request Body (with example JSON), Response (with example JSON), Error responses
- Rate limiting rules
- Pagination format
- Webhook endpoints (if applicable)`
    }],
    temperature: 0.7,
    max_tokens: 6000
  });

  const [database, api] = call2.choices[0].message.content.split('---SPLIT---').map(s => s.trim());

  // Call 3: UI + Setup
  const call3 = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: 'You are a senior frontend architect and DevOps engineer. Output ONLY valid markdown. No explanations outside the document.'
    }, {
      role: 'user',
      content: `Based on this project, create TWO documents. Separate them with exactly "---SPLIT---" on its own line.

PROJECT: ${input.appName || 'App'}
DESCRIPTION: ${input.appDescription}
PLATFORM: ${input.platform || 'web'}
DESIGN STYLE: ${input.designStyle || 'minimal'}
COLOR SCHEME: ${input.colorScheme || 'auto'}
DARK MODE: ${input.darkMode ? 'Yes' : 'No'}
REFERENCE URL: ${input.referenceUrl || 'none'}
FEATURES: ${(input.features || []).join(', ')}
USER ROLES: ${(input.userRoles || ['user', 'admin']).join(', ')}

DOCUMENT 1: UI.md (Frontend Specification)
Include:
- Design System: colors (exact hex codes), typography (font families, sizes), spacing scale, border radius, shadows
- Component Library: list every reusable component with its props/variants
- Page Layouts: for each page describe the exact layout (header, sidebar, main content, footer arrangement)
- Responsive Breakpoints: mobile, tablet, desktop behavior
- Navigation: menu structure, breadcrumbs, routing
- Forms: every form with its fields, validation rules, error states
- State Management: what global state is needed, recommended approach
- Loading States: skeleton screens, spinners, error boundaries

DOCUMENT 2: SETUP.md (Getting Started Guide)
Include:
- Prerequisites (Node version, package manager, etc.)
- Step-by-step installation (clone, install, configure)
- Environment variables setup (with .env.example content)
- Database setup (create, migrate, seed)
- Running development server
- Running tests
- Building for production
- Deployment guide (Vercel/Railway/Render — step by step)
- Common issues & troubleshooting`
    }],
    temperature: 0.7,
    max_tokens: 6000
  });

  const [ui, setup] = call3.choices[0].message.content.split('---SPLIT---').map(s => s.trim());

  return {
    'PRD.md': prd || '# PRD\n\nGeneration error — please regenerate.',
    'TECHNICAL.md': technical || '# Technical\n\nGeneration error — please regenerate.',
    'DATABASE.md': database || '# Database\n\nGeneration error — please regenerate.',
    'API.md': api || '# API\n\nGeneration error — please regenerate.',
    'UI.md': ui || '# UI\n\nGeneration error — please regenerate.',
    'SETUP.md': setup || '# Setup\n\nGeneration error — please regenerate.'
  };
}

module.exports = { generateFreeSpec, generateProSpec };
