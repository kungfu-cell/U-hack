# @scamtrap/analysis-core

Business logic สำหรับวิเคราะห์ข้อความโดยไม่ผูกกับ HTTP, UI หรือฐานข้อมูล

## Pipeline

```text
source text
  ├─ deterministic rules ───────────────┐
  ├─ local entity extraction            │
  │    └─ sensitive-value redaction     ├─ deterministic risk score
  ├─ semantic classifier (optional) ────┤
  └─ URL threat lookup (optional) ──────┘
```

- `DemoAnalysisProvider` ทำงานภายในเครื่องและไม่เรียกบริการภายนอก
- `OpenAIAnalysisProvider` ใช้ Structured Outputs แต่รับ evidence เฉพาะ quote ที่ตรงกับต้นฉบับ
- `GoogleWebRiskProvider` ตรวจ URL กับรายการ `MALWARE` และ `SOCIAL_ENGINEERING`
- หาก provider ภายนอกล่ม ระบบยังคืนผลจากกฎภายในพร้อมข้อจำกัด

## Server-side wiring

```ts
const provider = new OpenAIAnalysisProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-5.6-terra",
  threatIntelProvider: new GoogleWebRiskProvider(
    process.env.GOOGLE_WEB_RISK_API_KEY!,
  ),
});
```

ห้ามสร้าง provider นี้ใน frontend หรือส่ง API key ไปยัง browser

## Safety guarantees in code

- คะแนนคำนวณด้วย `scamtrap-risk-v1` ไม่รับคะแนนจาก LLM
- Evidence มี source span และ quote ที่ตรวจย้อนกลับได้
- เบอร์โทร บัญชี ชื่อบัญชี LINE ID อีเมล และ secret code ถูกปกปิดก่อนส่ง LLM
- ไม่สร้าง Entity ที่เก็บค่า OTP/PIN
- `not_found` จาก Threat Intelligence ไม่ถูกแปลว่า URL ปลอดภัย
- Risk Level และ Verification Status แยกจากกัน

## Known integration boundaries

- Correlation กับรายงานเดิมเป็นหน้าที่ของ Community/Data module
- Transcript ที่ยืนยันแล้วสามารถส่งเข้า `analyzeText` ได้เหมือนข้อความทั่วไป
- การจัดเก็บ Evidence และ Entity ต้องเข้ารหัสค่าจริงและเก็บ audit trail ใน Data module
- การใช้ provider จริงต้องมี API key และทดสอบใน environment ของทีม
