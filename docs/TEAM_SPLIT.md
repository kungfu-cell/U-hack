# แนวทางแบ่งงานในทีม

แต่ละคนสามารถรับผิดชอบโฟลเดอร์หลักของตัวเองเพื่อลด merge conflict

| งาน | พื้นที่หลัก | ผลส่งมอบรอบแรก |
|---|---|---|
| Frontend | `frontend` | หน้า Quick Analysis, Live Session, Report และสถานะ error/loading |
| Backend/API | `backend` | Case API, Session API, auth/ownership guard และ WebSocket events |
| AI/Analysis | `packages/analysis-core` | extraction, risk assessment, evidence span และ provider adapter |
| Data/Infra | `packages/database`, `infra` | Prisma schema, migration, seed และ storage adapter |
| Voice/WebRTC | `frontend/src/features/live-session`, `backend/src/modules/sessions` | ห้องทดสอบสองคน, transcript และ handoff state machine |

ไฟล์ใน `packages/contracts` เป็นข้อตกลงร่วมกัน ควร review กันก่อน merge เพราะกระทบทั้ง frontend และ backend

## ลำดับ integration ที่แนะนำ

1. ทำ Quick Analysis ให้ครบเส้นทางด้วย demo adapter
2. ต่อฐานข้อมูลและ ownership ของ case
3. ต่อ provider วิเคราะห์ข้อความและ threat intelligence
4. ต่อเสียงเข้า analysis core
5. ทำ WebRTC และ handoff state machine
6. สร้าง report, consent และ shared indicator review

## Branch convention

- `feat/web-quick-analysis`
- `feat/api-cases`
- `feat/analysis-core`
- `feat/live-session`
- `feat/database`

หนึ่ง pull request ควรแก้เฉพาะพื้นที่รับผิดชอบ และหากต้องเปลี่ยน contract ให้แยก commit ของ contract ชัดเจน
