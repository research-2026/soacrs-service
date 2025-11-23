# SOACRS Service

Self-Optimizing Agent Coordination & Response Service for the Agentic AI Middleware project.

## What this service does (high-level)

- Accepts structured tasks from the NL→Task translator.
- Builds Task Routing Plans (TRP) used by the Orchestrator to coordinate agents.
- Exposes telemetry endpoints to receive execution events and user feedback.
- Stores tools, metrics and plans in PostgreSQL and uses them to self-optimize routing decisions.

## Tech stack

- Node.js 18+
- TypeScript 5.x
- Express 5.x
- Jest 29 + ts-jest
- ESLint + Prettier
- Pino logging

## Commands

- `npm run dev` – start dev server with live reload
- `npm run build` – compile TypeScript to `dist`
- `npm start` – run compiled server
- `npm test` – run Jest tests
- `npm run lint` – run ESLint
