# QA Dataset Workbench

Local-first internal admin application for authoring QA datasets and generating standardized manual test cases from that knowledge base plus supporting product sources.

This project intentionally does **not** generate test automation, execute tests, parse repositories, or file bugs.

## Stack

- Frontend: Angular 21 + Angular Material + reactive forms
- Backend: Node.js + TypeScript + Fastify
- Database: PostgreSQL + Prisma ORM
- AI integration: OpenAI Node SDK from the backend only using the Responses API
- Validation: Zod for request payloads and structured AI outputs

## Folder Structure

```text
.
├── backend
│   ├── prisma
│   │   ├── migrations
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src
│       ├── config
│       ├── db
│       ├── lib
│       └── modules
├── frontend
│   └── src
│       └── app
│           ├── core
│           ├── features
│           └── shared
├── docker-compose.yml
└── README.md
```

## What Is Implemented

- CRUD flows for:
  - Component Catalogue
  - Rule Packs
  - Feature Types
  - Test Taxonomy
  - Scenario Templates
  - Priority Mappings
  - Severity Mappings
  - Synonyms / Aliases
- AI refinement workflow:
  - bulk refine
  - run history
  - pending draft queue
  - approve and reject actions
- Test case generation workflow:
  - Process Alpha for source-driven AI generation from stories, PRDs, screenshots, uploaded documents, and links
  - Process Beta for manual knowledge-base-driven generation
  - project-linked suite generation using `Project -> Module -> Page`
  - contributor ownership for run analytics
  - review, edit, delete, approve, reject, manual recovery, regenerate, and export flows
- Test generation dashboard:
  - workflow-first home page
  - KPI cards for suites, cases, approval rate, confidence, and coverage
  - project, contributor, mode, taxonomy, module, and page insights
  - recent activity, review load, and low-coverage page panels
- Approval and version tracking:
  - version snapshots
  - approval history
- Generated test case draft versioning for edit history
- Deterministic export:
  - CSV or Excel per entity type
  - full dataset as a multi-sheet Excel workbook
  - approved generated test case suite export as CSV or Excel
- Starter seed data for common components, rule packs, taxonomy, plus a few supporting entities
- Swagger UI at `/docs`
- Health endpoint at `/health`

## Prerequisites

- Node.js 22+
- npm 11+
- PostgreSQL 16+ locally or Docker Engine in WSL
- OpenAI API key for AI refinement and test generation

## Environment Setup

Create `backend/.env` from `backend/.env.example`.

Required backend variables:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `FIGMA_ACCESS_TOKEN` if you want backend Figma ingestion for mockup links

Common local default:

```env
PORT=3000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:4200
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qa_dataset_workbench?schema=public
OPENAI_MODEL=gpt-5.4-nano-2026-03-17
OPENAI_TIMEOUT_MS=120000
OPENAI_MAX_RETRIES=2
FIGMA_ACCESS_TOKEN=
FIGMA_API_BASE_URL=https://api.figma.com
FIGMA_NODE_DEPTH=3
FIGMA_IMAGE_SCALE=1
DEFAULT_ACTOR=local-admin
```

The frontend does not need a `.env` file for the current local setup. It targets `http://localhost:3000/api`.

If you are using Docker Compose, keep `backend/.env` for the non-database settings such as `OPENAI_API_KEY`. The Compose stack overrides `DATABASE_URL` automatically so the backend container talks to the `postgres` container instead of `localhost`.

## WSL Ubuntu Setup

For a full Windows + WSL Ubuntu + local PostgreSQL walkthrough with copy-paste commands, use [docs/WSL_SETUP.md](./docs/WSL_SETUP.md).

Recommended WSL flow:

1. Run the one-time bootstrap from the Windows-mounted repo:

```bash
cd /mnt/c/Users/Khyati/VS_Code_Projects/qa-assistant
bash scripts/wsl/move-to-wsl-and-bootstrap.sh
```

2. After that, use the WSL-native working copy only:

```bash
cd ~/projects/qa-assistant
```

Do not continue running the app from `/mnt/c/...` after bootstrap. The WSL-native copy avoids cross-platform `node_modules` issues with packages such as `esbuild` and `rollup`.

## Install

From the repository root:

```bash
npm install
```

## Docker Compose Run

If Docker is installed inside WSL, the full stack can be started with one command from the repository root:

```bash
sudo service docker start
docker compose up -d
```

This starts:

- PostgreSQL on `localhost:5433` by default
- Backend API on `localhost:3000`
- Angular frontend on `localhost:4200`

The backend container automatically:

- waits for PostgreSQL
- generates the Prisma client
- applies Prisma migrations
- runs the seed script
- starts the Fastify API

Useful follow-up commands:

```bash
docker info
docker compose logs -f postgres backend frontend
docker compose down
docker compose down -v
```

Notes:

- Run Compose from your WSL-native copy such as `~/projects/qa-assistant`, not `/mnt/c/...`
- If `docker compose` cannot connect to the daemon, start it first with `sudo service docker start`
- The compose stack publishes Postgres on `5433` by default so it does not clash with a local WSL PostgreSQL service on `5432`
- If you want a different host port, set `POSTGRES_HOST_PORT` before running Compose
- `docker compose down -v` also removes the Postgres data volume
- If you change backend or frontend dependencies, rebuild once with `docker compose up -d --build`

## Database Setup

### Option A: local PostgreSQL

Create a database named `qa_dataset_db` and ensure the credentials in `DATABASE_URL` are correct.

### Option B: Docker Compose

Use the full stack command:

```bash
docker compose up -d
```

## Prisma Commands

Run migrations:

```bash
npm run prisma:migrate
```

Seed starter data:

```bash
npm run prisma:seed
```

Prisma migrations for both dataset workbench and test generation are already included under `backend/prisma/migrations`.

## Run The App

### Recommended for Docker in WSL

From the WSL-native project copy:

```bash
cd ~/projects/qa-assistant
sudo service docker start
docker compose up -d
```

Tail logs when needed:

```bash
docker compose logs -f postgres backend frontend
```

### Recommended for WSL

After the initial bootstrap, restart everything from the WSL-native copy:

```bash
cd ~/projects/qa-assistant
sudo service postgresql start
npm run dev
```

### Generic local run

Start backend and frontend together:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev --workspace backend
npm run dev --workspace frontend
```

URLs:

- Frontend: `http://localhost:4200`
- Backend API: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`
- Health: `http://localhost:3000/health`

## Restarting Later

If you are using Docker in WSL, this is the normal restart flow every time:

```bash
cd ~/projects/qa-assistant
sudo service docker start
docker compose up -d
```

If you are using WSL Ubuntu without Docker, this is the normal restart flow every time:

```bash
cd ~/projects/qa-assistant
sudo service postgresql start
npm run dev
```

Notes:

- Run from `~/projects/qa-assistant`, not `/mnt/c/...`
- Stop Docker services with `docker compose down`
- Stop non-Docker frontend and backend with `Ctrl+C`
- If PostgreSQL is already running, `sudo service postgresql start` is safe to run again

## Build And Quality Commands

```bash
npm run build
npm run lint
npm run test
```

Notes:

- `lint` is currently a compile/typecheck pass for both apps.
- `test` is a placeholder script because no automated test suite has been added yet.

## Example AI Refinement Flow

1. Open `Component Catalogue` or `Rule Packs`.
2. Select one or more records.
3. Click `Refine selected`.
4. Choose a mode such as `normalize`, `expand`, or `strengthen`.
5. Review generated drafts in `AI Refinement Queue`.
6. Approve a draft to publish it into the canonical dataset and create a new version snapshot.
7. Export approved datasets from the `Export` page.

## Example Test Generation Flow

1. Open `Test Case Generator`.
2. Choose `Process Alpha` to drive generation from supporting sources, or `Process Beta` to drive generation from manual knowledge-base selections.
3. Select an existing contributor and choose or type the `Project -> Module -> Page` path for the suite.
4. Add stories, PRD text, screenshots, office documents, links, KT notes, or manual knowledge-base pins.
   For Figma mockup links, configure `FIGMA_ACCESS_TOKEN` so the backend can ingest node text and rendered images from the linked frame.
5. Configure coverage preferences such as smoke, usability, responsiveness, and compatibility.
6. Generate the suite.
7. Review the draft in `Test Case Review`.
8. Edit individual test cases, delete weak cases, or add manual cases.
9. Approve the draft to make it exportable, or reject it and use `Manual recovery` or `Regenerate`.
10. Export approved suites from `Generated Exports`.

## Main Architectural Decisions

- Canonical authored entities are stored in a single `DatasetItem` table with strict per-entity Zod schemas over JSON payloads.
- Audit-heavy entities are stored separately:
  - `RefinementRun`
  - `RefinementDraft`
  - `ApprovalHistory`
  - `DatasetVersion`
- Test generation is stored separately from canonical dataset items:
  - `TestGenerationRun`
  - `TestCaseDraft`
  - `TestCaseDraftVersion`
- Test generation runs now also attach to:
  - `Contributor`
  - `Project`
  - `ProjectModule`
  - `ProjectPage`
- Dashboard analytics aggregate real generated suite data instead of relying on static mock summaries.
- OpenAI is called from the backend only.
- Responses API structured parsing is used for refinement runs, then validated again with Zod before drafts are persisted.
- Responses API structured parsing is also used for test generation, combining supplied source material with approved dataset knowledge.
- AI suggestions never become active automatically. Approval is mandatory.
- Export output is deterministic and limited to approved dataset records.

## Seed Coverage

Starter data includes:

- Components:
  - dropdown
  - multiselect
  - date picker
  - date range picker
  - table
  - chart
  - modal
  - file upload
  - text input
  - textarea
  - tabs
  - pagination
  - login form
- Rule packs:
  - form validation
  - authentication
  - dashboard
  - API validation
  - file upload
  - date / time
  - table / grid
- Taxonomy:
  - smoke
  - functional
  - integration
  - API
  - regression
  - E2E
  - performance
  - security
  - accessibility
  - usability
  - compatibility
  - data integrity
  - recovery
- Contributors:
  - Akshaya Kumar Vijayaganeshvara Moorthi
  - Khyati Dhawan
  - Naren Vishwa Swaminathan
  - Ruban Chakravarthy V
  - Sakthivel M
  - Sowndarya Saravanan
  - Vaishnavi M
- Project hierarchy:
  - Safety Assistant -> Dashboard / Observations / Actions & Reports
  - QA Dataset Workbench -> Knowledge Base / Generation

## Manual Steps You Still Need To Perform

- Add `OPENAI_API_KEY` to `backend/.env`
- Point `DATABASE_URL` to a running PostgreSQL instance for non-Docker local runs
- For WSL, bootstrap once with:

```bash
cd /mnt/c/Users/Khyati/VS_Code_Projects/qa-assistant
bash scripts/wsl/move-to-wsl-and-bootstrap.sh
```

- After that, restart daily with:

```bash
cd ~/projects/qa-assistant
docker compose up -d
```

- If you pull these generator changes into an existing database, apply the new Prisma migration before running:

```bash
npm run prisma:migrate
```

- The latest migration adds contributor and `Project -> Module -> Page` tables plus links from generated suites into that hierarchy. Seed after migrating if you want the demo contributor and project data:

```bash
npm run prisma:seed
```

- Or, for a non-Docker local setup, run:

```bash
npm run prisma:migrate
npm run prisma:seed
npm run dev
```
