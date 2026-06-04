# CRM Neon MCP Server

This project creates an MCP server for two dummy company CRMs hosted in one Neon Postgres project:

- `deep_crm`
- `poojan_crm`

The MCP server is the safety layer between ChatGPT and the databases. It does not expose a raw SQL tool.

## Why Neon Postgres

Neon gives you a production-style hosted Postgres database while keeping setup simple. The CRM data is relational, so Postgres is a strong fit for employees, teams, clients, tasks, attendance, and payroll. Semantic CRM search uses Neon's Postgres `pgvector` extension.

## Access Model

Configured actors:

- `deep_ceo`: CEO access to both `deep_crm` and `poojan_crm`
- `poojan_ceo`: CEO access to both `deep_crm` and `poojan_crm`
- `deep_sales_manager`: Deep CRM, `D-SALES` team only
- `deep_support_manager`: Deep CRM, `D-SUPPORT` team only
- `poojan_growth_manager`: Poojan CRM, `P-GROWTH` team only
- `poojan_delivery_manager`: Poojan CRM, `P-DELIVERY` team only

Managers can:

- read their own team employees
- read their own team clients
- read their own team client tasks
- assign client tasks only to their own team employees
- update status/comment on their own team tasks
- query attendance for their own team employees
- calculate payable salary for their own team employees

Managers cannot:

- access the other company database
- access other teams in their own company
- see raw payroll fields
- call the CEO-only payroll lookup
- run arbitrary SQL

CEOs can read/write task data across both databases and can access payroll details.

## Setup

1. Create one Neon project.

2. Copy the environment file:

```powershell
Copy-Item .env.example .env
```

3. Add your Neon connection string to `.env`:

```env
NEON_ADMIN_DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
MCP_ACTOR_ID=deep_ceo
MCP_ALLOW_DEMO_ACTOR_SWITCH=false
```

4. Install dependencies:

```powershell
npm install
```

5. Create and seed both databases:

```powershell
npm run db:setup
```

The setup script creates `deep_crm` and `poojan_crm`, applies `sql/schema.sql`, and loads the two seed files.

6. Optional, but recommended for semantic search: add an embedding API key to `.env` and refresh embeddings.

For Gemini:

```env
EMBEDDING_PROVIDER=gemini
GEMINI_API_KEY=your-google-ai-studio-key
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=1536
```

For OpenAI:

```env
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=your-openai-key
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

```powershell
npm run embeddings:refresh
```

This embeds selected CRM text only: client notes, task titles/descriptions, and task comments. It does not embed payroll, bank details, raw salary, or attendance rows.

7. Build the MCP server:

```powershell
npm run build
```

8. Run the HTTP login/OAuth MCP server:

```powershell
npm start
```

The login page is available at:

```text
http://localhost:8787/login
```

The HTTP MCP endpoint is:

```text
http://localhost:8787/mcp
```

## Deploy on Vercel

This repo is now shaped for both local Node and Vercel:

- Local development uses `src/http-server.ts`, which calls `app.listen`.
- Vercel uses `src/index.ts`, which exports the same Express app without starting a long-running listener.
- `package.json` points `main` to `src/index.ts`, so Vercel can find the app before TypeScript creates `dist`.
- `/login`, `/admin`, `/authorize`, `/token`, and `/mcp` are served directly by the Express app.

Step by step:

1. Push this folder to GitHub.

2. In Vercel, import the GitHub repo as a new project.

3. Use these project settings:

```text
Framework Preset: Express, or Other if Express is not shown
Install Command: npm install
Build Command: npm run build
Output Directory: leave blank
Start Command: leave blank
```

4. Add these Vercel environment variables:

```env
NEON_ADMIN_DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
PUBLIC_BASE_URL=https://your-vercel-project.vercel.app
OAUTH_ISSUER=https://your-vercel-project.vercel.app
AUTH_JWT_SECRET=use-a-long-random-secret
EMBEDDING_PROVIDER=gemini
GEMINI_API_KEY=your-google-ai-studio-key-if-using-embeddings
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=1536
```

Also add the demo login email/password variables from `.env.example` if you want custom accounts.

5. Create the Neon databases and seed data once from your machine:

```powershell
npm run db:setup
```

Then refresh semantic-search embeddings:

```powershell
npm run embeddings:refresh
```

Do this locally using the same Neon connection string. Do not run seeding automatically on every Vercel deploy, because it would recreate demo data.

6. Deploy the Vercel project.

After deployment:

```text
Login page: https://your-vercel-project.vercel.app/login
CEO access page: https://your-vercel-project.vercel.app/admin
MCP endpoint for ChatGPT: https://your-vercel-project.vercel.app/mcp
```

In ChatGPT, import the remote MCP server using the `/mcp` URL. ChatGPT will discover the OAuth metadata, open the login page, and receive a bearer token after sign-in.

## MCP Client Config

Use the built server path in your MCP client configuration.

```json
{
  "mcpServers": {
    "crm-neon": {
      "command": "node",
      "args": ["C:\\Users\\shlok\\Documents\\crm-mcp\\dist\\src\\stdio-server.js"],
      "env": {
        "NEON_ADMIN_DATABASE_URL": "postgresql://USER:PASSWORD@HOST/neondb?sslmode=require",
        "MCP_ACTOR_ID": "deep_sales_manager",
        "MCP_ALLOW_DEMO_ACTOR_SWITCH": "false"
      }
    }
  }
}
```

For classroom demos, you can set `MCP_ALLOW_DEMO_ACTOR_SWITCH=true` and use the `switch_demo_actor` tool. For production-like safety, keep it false and run the server with the actor identity set outside the model.

For the production-shaped ChatGPT flow, use the HTTP endpoint and OAuth login page instead of stdio. The user signs in as CEO or manager, the server issues a bearer token, and every MCP tool call verifies that token.

## Important Tools

- `whoami`
- `list_team_employees`
- `list_clients`
- `get_client_details`
- `list_client_tasks`
- `semantic_crm_search`
- `find_similar_tasks`
- `get_employee_task_summary`
- `assign_client_task`
- `update_task_status`
- `add_task_comment`
- `get_overdue_tasks`
- `get_attendance_summary`
- `calculate_payable_salary`
- `get_employee_payroll_details` CEO-only
- `list_manager_access` CEO-only
- `update_manager_access` CEO-only
- `refresh_crm_embeddings` CEO-only

## Demo Prompts

Manager task questions:

```text
What tasks has D-EMP-001 completed in May 2026?
```

```text
Assign Acme Retail Group follow-up task to D-EMP-002 due on 2026-06-15.
```

```text
Show overdue tasks for my team.
```

Semantic client/task search:

```text
Find client tasks related to rollout delays or onboarding problems.
```

```text
Find tasks similar to D-TASK-002.
```

Attendance and salary:

```text
How many days was D-EMP-001 present in May 2026, how many leaves did he take, and how much salary should be paid?
```

Permission test:

```text
As deep_sales_manager, show me Poojan Growth clients.
```

That should fail because the manager cannot access the Poojan database.

Payroll privacy test:

```text
As deep_sales_manager, show the raw payroll details for D-EMP-001.
```

That should fail because raw payroll is CEO-only.
