# Technical decisions for the Hackathon MVP

เอกสารนี้เป็นค่ามาตรฐานที่ทีมตกลงใช้ร่วมกัน เพื่อลดการตัดสินใจซ้ำและให้แต่ละส่วนเชื่อมกันได้

## Analysis pipeline

1. สกัด Indicator และตรวจ deterministic rules ภายในระบบก่อน
2. ปกปิดเบอร์โทร บัญชี ชื่อบัญชี LINE ID และอีเมล
3. ส่งข้อความที่ปกปิดแล้วไปยัง OpenAI Responses API ด้วย `gpt-5.6-terra`
4. รับผลด้วย strict Structured Outputs
5. รับเฉพาะ evidence quote ที่ค้นพบตรงในต้นฉบับ
6. คำนวณ Risk Score ในระบบ ไม่ใช้คะแนนที่โมเดลสร้างเอง
7. ส่ง URL ไปตรวจ Google Web Risk Lookup API โดยไม่เปิด URL

หาก Semantic Classifier หรือ Threat Intelligence ใช้งานไม่ได้ ระบบต้องคืนผลจากกฎภายในพร้อมระบุข้อจำกัด ไม่ตีความว่าไม่พบข้อมูลเท่ากับปลอดภัย

## Risk score

ใช้เวอร์ชัน `scamtrap-risk-v1`:

| ช่วงคะแนน | ระดับ    |
| --------- | -------- |
| 0–24      | low      |
| 25–54     | medium   |
| 55–79     | high     |
| 80–100    | critical |

คะแนนสูงใช้สำหรับเตือนและอธิบายเหตุผลเท่านั้น ห้ามตัดสาย ทำธุรกรรม หรือกล่าวหาบุคคลโดยอัตโนมัติ

## Scam taxonomy

- `authority_impersonation`
- `threat_or_fear`
- `urgency`
- `money_transfer_request`
- `secret_request`
- `isolation`
- `remote_access_request`
- `guaranteed_return`

## Verification status

- `unverified`: ยังไม่มีหลักฐานอิสระยืนยัน
- `corroborated`: Indicator ตรงกับรายงานอิสระมากกว่าหนึ่งรายการ
- `technically_validated`: ตรวจพบจากแหล่งเทคนิค เช่น Google Web Risk
- `partner_verified`: ยืนยันโดยหน่วยงานหรือ Partner ที่ได้รับอนุญาต
- `rejected`: ข้อมูลผิด ไม่เพียงพอ หรือถูกปฏิเสธหลังตรวจทาน

Risk Score และ Verification Status เป็นคนละค่า ห้ามเพิ่มความน่าเชื่อถือของหลักฐานเพียงเพราะข้อความดูเสี่ยง

## Data policy

- ห้ามเก็บ OTP รหัสผ่าน PIN หรือ secret value
- ไฟล์เสียงเป็นข้อมูลชั่วคราวและต้องลบหลังถอดเสียง
- Transcript ที่เก็บต้องผ่านการปกปิดข้อมูล และตั้งอายุไม่เกิน 7 วันสำหรับ MVP
- Community Indicator ต้องผ่านหน้าตรวจทานก่อนแบ่งปัน
- AI Voice Handoff ใช้เฉพาะสถานการณ์จำลองที่ผู้ร่วมทดสอบยินยอม
- ใช้ข้อมูลบัญชีและตัวตนสมมติในเดโม ห้ามส่งข้อมูลธนาคารจริงไป ElevenLabs

## Providers and deployment

- Text analysis: OpenAI Responses API, `gpt-5.6-terra`
- URL threat intelligence: Google Web Risk Lookup API
- Realtime transcription: ElevenLabs Scribe v2 Realtime ผ่าน single-use token
- Deployment: Railway project เดียว แยก frontend, backend และ PostgreSQL service
- ระหว่าง Hackathon ให้ backend ทำงานหนึ่ง instance เพื่อไม่ต้อง sync WebSocket room state

Secret ทุกตัวอยู่ใน Railway sealed variables หรือ GitHub Environment Secrets เท่านั้น ห้ามใส่ใน frontend, ตัวแปร `VITE_*`, source code หรือ Git history

ค่าที่ backend ใช้:

```text
OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-terra
GOOGLE_WEB_RISK_API_KEY
ELEVENLABS_API_KEY
ELEVENLABS_AGENT_ID
DATABASE_URL
```
