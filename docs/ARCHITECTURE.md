# Architecture

```text
frontend ───────┐
                ├── packages/contracts
backend ────────┤
  │             └── packages/analysis-core
  └──────────────── packages/database

External services are reached only through server-side adapters.
```

- `frontend`: React UI; ไม่มี secret และไม่เรียก provider ภายนอกโดยตรง
- `backend`: HTTP/WebSocket boundary, authorization, orchestration และ adapter wiring
- `packages/contracts`: Zod schemas และ TypeScript types ที่ใช้ร่วมกัน
- `packages/analysis-core`: business rules แบบไม่ผูกกับ framework/provider
- `packages/database`: Prisma schema/client; เก็บ provenance, consent และ audit trail
- `infra`: Docker Compose และไฟล์สำหรับ local/deployment infrastructure

เส้นทางข้อมูลหลักคือ input → normalization → entity extraction → risk assessment → threat checks → report โดยทุกผลต้องชี้กลับไปยังหลักฐานต้นฉบับได้
