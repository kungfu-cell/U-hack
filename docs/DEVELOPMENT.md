# Development guide

## เริ่มต้น

ต้องมี Node.js 22+ และ pnpm 10+ จากนั้นรัน:

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

## กติกาสำคัญ

- ห้ามใส่ API key ในโค้ดหรือ commit ไฟล์ `.env`
- เก็บ key ของ ElevenLabs, LLM และ threat intelligence ที่ฝั่ง API เท่านั้น
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
