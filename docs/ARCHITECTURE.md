# Architecture

```text
apps/web ───────┐
                ├── packages/contracts
apps/api ───────┤
  │             └── packages/analysis-core
  └──────────────── packages/database

External services are reached only through server-side adapters.
```

- `apps/web`: React UI; ไม่มี secret และไม่เรียก provider ภายนอกโดยตรง
- `apps/api`: HTTP/WebSocket boundary, authorization, orchestration และ adapter wiring
- `packages/contracts`: Zod schemas และ TypeScript types ที่ใช้ร่วมกัน
- `packages/analysis-core`: business rules แบบไม่ผูกกับ framework/provider
- `packages/database`: Prisma schema/client; เก็บ provenance, consent และ audit trail

เส้นทางข้อมูลหลักคือ input → normalization → entity extraction → risk assessment → threat checks → report โดยทุกผลต้องชี้กลับไปยังหลักฐานต้นฉบับได้
