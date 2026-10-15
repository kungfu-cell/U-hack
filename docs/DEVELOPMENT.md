# Development guide

## เริ่มต้น

ต้องมี Node.js 22+ และ pnpm 11 จากนั้นรัน:

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d postgres
copy .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Web: `http://localhost:5173`
- API health check: `http://localhost:3001/health`

ค่าเริ่มต้น `USE_DEMO_ADAPTERS=true` ใช้ตัววิเคราะห์แบบ deterministic สำหรับพัฒนา UI และต้องแสดงป้ายว่าเป็นผลทดสอบ ไม่ใช่ผลจากผู้ให้บริการจริง

เมื่อต้องการทดสอบ provider จริง ให้กำหนด `USE_DEMO_ADAPTERS=false` และใส่ key ของ provider ที่ต้องการใช้ใน `.env` ฝั่ง backend ได้แก่ `OPENAI_API_KEY`, `GOOGLE_SAFE_BROWSING_API_KEY`, `ELEVENLABS_API_KEY` และ `ELEVENLABS_AGENT_ID` ระบบจะใช้ demo adapter เฉพาะ provider ที่ยังตั้งค่าไม่ครบ และ `/health` จะแสดง adapter ที่เลือกโดยไม่เปิดเผย key ห้ามใช้ข้อมูลจริงหรือข้อมูลอ่อนไหวในการทดสอบ

ค่าเริ่มต้น `PERSISTENCE_MODE=memory` เหมาะกับการพัฒนาและข้อมูลจะหายเมื่อ API หยุด หากต้องการ PostgreSQL ให้ตั้ง `PERSISTENCE_MODE=postgres`, เปิด container, รัน migration และกำหนด `DATA_ENCRYPTION_SECRET` กับ `DATA_PEPPER_SECRET` คนละค่า โดยแต่ละค่าต้องยาวอย่างน้อย 32 ตัวอักษร ห้ามใช้ค่าตัวอย่างใน production

Reviewer API ปิดโดยค่าเริ่มต้น ให้กำหนด `REVIEWER_API_KEY` อย่างน้อย 16 ตัวอักษรและส่งผ่าน header `x-reviewer-key` เมื่อตรวจรายการ โดย API จะคืนเฉพาะค่าที่ mask แล้ว ไม่คืนค่า indicator ที่เข้ารหัสหรือ digest

## API ที่เก็บลง PostgreSQL

- รายงาน: `GET/POST /cases/:id/report`
- Consent: `GET/POST /cases/:id/consents` และ `DELETE /cases/:id/consents/:consentId`
- Incident correlation และ audit: `GET /cases/:id/correlations`, `GET /cases/:id/audit`
- ถอนข้อมูลตาม PDPA: `POST /cases/:id/withdrawal`
- Reviewer queue: `GET /review/indicators`, `PATCH /review/indicators/:indicatorId`
- Transcript: `GET /sessions/:id/utterances`, `PATCH /sessions/:id/utterances/:utteranceId`

ข้อมูล demo จะสร้าง share proposal สำหรับทดสอบ response เท่านั้น และจะไม่ถูกเขียนลง shared-indicator review queue

## ทดสอบ Live Scam Shield สองเบราว์เซอร์

1. เปิดหน้า Live Scam Shield ในเบราว์เซอร์แรกและอนุญาตไมโครโฟน
2. คัดลอกลิงก์เชิญหรือรหัสห้องจากฝั่งเจ้าของ
3. เปิดลิงก์ในอีกเบราว์เซอร์หรือโหมดไม่ระบุตัวตน แล้วกดเข้าร่วมห้อง
4. ตรวจว่าสถานะ WebRTC เป็นเชื่อมต่อแล้ว ทั้งสองฝั่งได้ยินเสียง และ transcript แยก `user` กับ `caller`
5. ทดสอบ AI handoff, กลับมาพูดเอง และจบสาย จากฝั่งเจ้าของห้อง

การใช้งานข้ามเครือข่ายจริงอาจต้องเพิ่ม TURN server; ค่าเริ่มต้นของต้นแบบใช้ public STUN จึงไม่ครอบคลุม NAT/firewall ทุกแบบ

## กติกาสำคัญ

- ห้ามใส่ API key ในโค้ดหรือ commit ไฟล์ `.env`
- เก็บ key ของ ElevenLabs, OpenAI และ Google Safe Browsing ที่ฝั่ง API เท่านั้น
- ปกปิดข้อมูลอ่อนไหวก่อนส่ง Semantic Classifier และห้ามเก็บค่า OTP/PIN
- วิเคราะห์เฉพาะ committed transcript; partial transcript ใช้แสดงผลเท่านั้น
- ผล `not_found` ไม่ได้แปลว่า `safe` และ provider error ต้องแสดงเป็น `unavailable`
- AI handoff ต้องเกิดจากการยืนยันของผู้ใช้ และต้องหยุดได้เสมอ
- ข้อมูล demo ต้องไม่ถูกแชร์เข้าฐานข้อมูลจริง

## Definition of done สำหรับแต่ละงาน

1. TypeScript ผ่าน `pnpm typecheck`
2. เพิ่มหรือแก้ test สำหรับ business rule ที่เปลี่ยน
3. ไม่มี secret/ข้อมูลส่วนตัวใน log
4. ระบุสถานะ loading, error และ unavailable ใน UI
5. ถ้าเป็น integration จริง ต้องมี adapter interface และ fallback ที่ระบุว่าเป็น demo
