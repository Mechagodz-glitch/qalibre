# WSL Ubuntu Setup

This project runs locally on Windows through WSL Ubuntu with:

- Angular frontend
- Node.js + TypeScript backend
- Prisma ORM
- PostgreSQL installed inside WSL
- OpenAI integration from the backend only

No Docker is required.

## 1. Install WSL On Windows

Open **PowerShell as Administrator** and run:

```powershell
wsl --install -d Ubuntu
wsl --set-default Ubuntu
```

If WSL is already installed, verify it:

```powershell
wsl -l -v
```

Then open Ubuntu and update packages:

```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Install System Dependencies In WSL

From Ubuntu:

```bash
cd /mnt/c/Users/Khyati/VS_Code_Projects/qa-assistant
bash scripts/wsl/install-system-deps.sh
```

This installs:

- `curl`
- `git`
- `build-essential`
- `postgresql`
- `postgresql-contrib`
- `nvm`
- latest Node LTS and npm

If `nvm` is not loaded yet in the current shell:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

## 3. Configure PostgreSQL

Start PostgreSQL:

```bash
sudo service postgresql start
```

Open `psql` as the local `postgres` superuser:

```bash
sudo -u postgres psql
```

Inside `psql`, run:

```sql
CREATE USER qa_user WITH PASSWORD 'qa_password' CREATEDB;
CREATE DATABASE qa_dataset_db OWNER qa_user;
GRANT ALL PRIVILEGES ON DATABASE qa_dataset_db TO qa_user;
\q
```

Or run the bundled SQL file directly:

```bash
sudo -u postgres psql -f /mnt/c/Users/Khyati/VS_Code_Projects/qa-assistant/scripts/wsl/init-postgres.sql
```

Verify the database exists:

```bash
sudo -u postgres psql -c '\l'
```

Verify the app user can connect:

```bash
PGPASSWORD=qa_password psql -h localhost -U qa_user -d qa_dataset_db -c '\conninfo'
```

## 4. One-Command WSL Bootstrap And Startup

Run this from the Windows-mounted repo path inside WSL:

```bash
cd /mnt/c/Users/Khyati/VS_Code_Projects/qa-assistant
bash scripts/wsl/move-to-wsl-and-bootstrap.sh
```

That single script will:

- remove incompatible Windows-created `node_modules`
- copy the repo into `~/projects/qa-assistant`
- remove stale install state and lockfile from the WSL copy
- create `backend/.env` if missing
- install Linux-native npm dependencies
- start PostgreSQL
- ensure `qa_user` and `qa_dataset_db` exist
- run Prisma generate
- run Prisma migrate
- run Prisma seed
- start backend and frontend with `npm run dev`

## 5. Backend Environment File

If `backend/.env` was created from the example, edit the WSL copy so it contains:

```env
PORT=3000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:4200
DATABASE_URL=postgresql://qa_user:qa_password@localhost:5432/qa_dataset_db?schema=public
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.4
OPENAI_TIMEOUT_MS=45000
OPENAI_MAX_RETRIES=2
DEFAULT_ACTOR=local-admin
```

Working copy after bootstrap:

```bash
~/projects/qa-assistant
```

## 6. Application URLs

Backend URL:

- `http://localhost:3000`
- `http://localhost:3000/docs`
- `http://localhost:3000/health`

Frontend URL:

- `http://localhost:4200`

## 8. Verify The Full Stack

Run:

```bash
cd ~/projects/qa-assistant
bash scripts/wsl/verify-local.sh
```

Or check manually:

- frontend: `http://localhost:4200`
- backend: `http://localhost:3000`
- swagger: `http://localhost:3000/docs`
- health: `http://localhost:3000/health`

## 9. Quick Restart

When you reopen WSL later:

```bash
cd ~/projects/qa-assistant
sudo service postgresql start
npm run dev
```

## 10. Recommended VS Code Flow

Install the **WSL** extension in VS Code, then from Ubuntu:

```bash
cd ~/projects/qa-assistant
code .
```

That ensures the terminal, Node runtime, Prisma commands, and file watchers run inside WSL rather than Windows.
