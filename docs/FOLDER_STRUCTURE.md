# Folder structure

```text
U-hack/
├─ frontend/                  # React + Vite user interface
│  └─ src/
│     ├─ app/                 # application shell and navigation
│     ├─ components/          # reusable UI components
│     ├─ features/            # quick analysis, live session, reports
│     └─ lib/                 # API client and browser utilities
├─ backend/                   # Fastify HTTP API and orchestration
│  └─ src/
│     ├─ config/              # validated server configuration
│     ├─ lib/                 # shared backend helpers
│     └─ modules/             # cases, sessions and future modules
├─ packages/
│  ├─ contracts/              # schemas/types shared by frontend and backend
│  ├─ analysis-core/          # provider-independent risk analysis rules
│  └─ database/               # Prisma client and database schema
├─ infra/                     # Docker Compose and deployment infrastructure
├─ docs/                      # architecture, team split and development guides
├─ .env.example               # safe environment-variable template
├─ package.json               # root commands for the monorepo
└─ pnpm-workspace.yaml        # workspace package definitions
```

## Ownership rule

- Frontend developer ทำงานหลักใน `frontend`
- Backend developer ทำงานหลักใน `backend`
- AI developer ทำงานหลักใน `packages/analysis-core`
- Database/infra developer ทำงานหลักใน `packages/database` และ `infra`
- การเปลี่ยน `packages/contracts` ต้องแจ้งทีม เพราะกระทบทั้ง frontend และ backend
