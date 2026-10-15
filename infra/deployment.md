# ScamTrap AI - Database & Deployment Guide

คู่มือสำหรับการติดตั้ง ใช้งาน Docker, ฐานข้อมูล PostgreSQL, Prisma Migration และการโหลดข้อมูลตัวอย่าง (Demo Data)

---

## 1. การเริ่มต้นระบบฐานข้อมูลด้วย Docker

ระบบต้องการ PostgreSQL 17 สำหรับจัดเก็บข้อมูล Cases, Sessions, Transcripts, Evidence, Consents, Audit Events และ Incident Reports

### เริ่มต้นคอนเทนเนอร์ฐานข้อมูล
```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

### ตรวจสอบสถานะการทำงาน
```bash
docker compose -f infra/docker-compose.yml ps
```

คอนเทนเนอร์จะมี Healthcheck ตรวจสอบความพร้อม `pg_isready` อัตโนมัติ

---

## 2. การตั้งค่า Environment Variables

คัดลอกไฟล์ `.env.example` เป็น `.env`:
```bash
# Windows PowerShell
Copy-Item .env.example .env

# หรือ CMD / Bash
cp .env.example .env
```

ค่าคอนฟิกสำคัญสำหรับฐานข้อมูลและการเข้ารหัสข้อมูลส่วนบุคคล:
```env
# Database Connection
DATABASE_URL=postgresql://scamtrap:scamtrap@localhost:5432/scamtrap?schema=public

# Privacy & Security Pepper/Secret (ใช้สำหรับคำนวณ Lookup Digest ป้องกัน Rainbow Table)
DATA_PEPPER_SECRET=scamtrap-privacy-pepper-2026-production-secret-key

# AES-256-GCM Master Key (สำหรับเข้ารหัสข้อมูลอ่อนไหว เช่น เลขบัญชี, เบอร์โทรศัพท์)
DATA_ENCRYPTION_SECRET=scamtrap-aes-encryption-key-32bytes-secret
```

---

## 3. Prisma Client Generation & Database Migration

### 3.1 สร้าง Prisma Client
```bash
pnpm db:generate
```

### 3.2 ทำการรัน Migration ไปยังฐานข้อมูล
```bash
pnpm db:migrate
```
คำสั่งนี้จะรันไฟล์ SQL migration ใน `packages/database/prisma/migrations/0_init/migration.sql` เพื่อสร้าง Enums, Tables, Indexes และ Constraints ทั้งหมด

---

## 4. โหลดข้อมูลจำลองสำหรับการนำเสนอ (Demo Seeding)

ระบบเตรียมข้อมูลจำลองที่สอดคล้องกับสถานการณ์จริงใน Hackathon:
1. **Case 1 (สายด่วนแอบอ้างตำรวจ)**: บทสนทนาข่มขู่คดีฟอกเงิน มีช่วงสลับเสียง AI Decoy Handoff, สกัดหลักฐานทางจิตวิทยา, เลขบัญชีม้า และผลตรวจจาก AOC 1441
2. **Case 2 (SMS พัสดุศุลกากรค้างส่ง)**: SMS ลิงก์ปลอม Phishing Portal หลอกชำระค่าธรรมเนียม 45 บาท
3. **Case 3 (งานกดรับออเดอร์ - บัญชีม้าซ้ำ)**: ตรวจพบเลขบัญชีม้าตรงกับ Case 1 ทันที ทำให้ระบบ Incident Correlation แจ้งเตือนเหตุการณ์ซ้ำข้ามคดี

### คำสั่งรัน Seed Data:
```bash
pnpm db:seed
```

---

## 5. การเปิดดูข้อมูลผ่าน Prisma Studio

เปิด GUI ตรวจดูตารางข้อมูลและความสัมพันธ์:
```bash
pnpm db:studio
```
เปิดเบราว์เซอร์ไปที่ `http://localhost:5555`

---

## 6. สรุปความสามารถด้าน Data & Reports

| คุณสมบัติ | คำอธิบาย |
|---|---|
| **Privacy Cryptography** | ข้อมูลอ่อนไหวถูกเข้ารหัสด้วย AES-256-GCM และสร้าง HMAC-SHA256 Lookup Digest สำหรับเปรียบเทียบข้อมูลซ้ำ |
| **Masking** | แสดงข้อมูลแบบปิดบังเป็นค่าเริ่มต้น เช่น `081-***-4321` เพื่อความเป็นส่วนตัวตาม PDPA |
| **Data Withdrawal** | รองรับการถอนความยินยอม (Consent Withdrawal), ถอนตัวบ่งชี้ภัยจากชุมชน (Indicator Revocation) และ Soft Delete / Hard Purge พร้อมบันทึก Audit Event ที่เปลี่ยนแปลงไม่ได้ |
| **Incident Correlation** | เครื่องมือเชื่อมโยงเหตุการณ์ซ้ำ ตรวจจับตัวบ่งชี้ภัยที่เคยปรากฏในคดีก่อนหน้า หรือในฐานข้อมูลภัยชุมชน |
| **Report Generation** | สร้างรายงานเหตุการณ์ (Incident Report) แบบ Versioned ตามข้อกำหนดใน Section 13 พร้อมสรุปผล, หลักฐาน, ลำดับการรับช่วง AI, และข้อจำกัดทางเทคนิค |
