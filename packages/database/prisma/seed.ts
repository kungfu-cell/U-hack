import { PrismaClient } from '@prisma/client';
import { computeLookupDigest, encryptValue } from '../src/crypto.js';
import { ReportService } from '../src/services/report.service.js';

const prisma = new PrismaClient();

export async function seedDemoData() {
  console.log('--- Starting ScamTrap AI Demo Database Seeding ---');

  // Clean existing demo data if any
  await prisma.auditEvent.deleteMany({});
  await prisma.report.deleteMany({});
  await prisma.intelCheck.deleteMany({});
  await prisma.evidence.deleteMany({});
  await prisma.entityMention.deleteMany({});
  await prisma.assessment.deleteMany({});
  await prisma.utterance.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.consent.deleteMany({});
  await prisma.caseInput.deleteMany({});
  await prisma.sharedIndicator.deleteMany({});
  await prisma.voiceProfile.deleteMany({});
  await prisma.case.deleteMany({});

  const demoUserId = 'demo-user-u-hack';
  const sharedAccountRaw = '0819984321';
  const sharedAccountDigest = computeLookupDigest('bank_account', sharedAccountRaw);
  const sharedAccountEncrypted = encryptValue(sharedAccountRaw);

  const sharedUrlRaw = 'customs-parcel-th-track.vip/auth';
  const sharedUrlDigest = computeLookupDigest('url', sharedUrlRaw);
  const sharedUrlEncrypted = encryptValue(sharedUrlRaw);

  // ==========================================
  // CASE 1: Police Impersonation Call with AI Decoy Handoff
  // ==========================================
  console.log('Seeding Case 1: Police Impersonation Call with AI Decoy Handoff...');
  const case1 = await prisma.case.create({
    data: {
      id: 'demo-case-001-police-call',
      ownerId: demoUserId,
      title: 'สายด่วนแอบอ้างตำรวจ สภ.เมืองทอง ข่มขู่โอนเงินคดีฟอกเงิน',
      status: 'COMPLETED',
      isDemo: true,
      createdAt: new Date('2026-10-14T09:15:00Z'),
      inputs: {
        create: [
          {
            id: 'input-001-call',
            type: 'AUDIO',
            source: 'live_web_call',
            content:
              'นี่คือพันตำรวจเอก สมศักดิ์ จากสถานีตำรวจภูธรเมืองทอง บัญชีธนาคารของคุณมีส่วนเกี่ยวข้องกับคดีฟอกเงินยาเสพติด หากไม่ต้องการถูกออกหมายจับ ให้โอนเงินในบัญชีทั้งหมดมาที่บัญชีกลางเพื่อตรวจสอบทันที บัญชีเลขที่ 081-998-4321 รีบโอนเดี๋ยวนี้ก่อนหมายจับจะไปถึงบ้าน!',
            createdAt: new Date('2026-10-14T09:15:10Z'),
          },
        ],
      },
      consents: {
        create: [
          {
            id: 'consent-001',
            subjectId: demoUserId,
            scope: 'audio_analysis_and_decoy_handoff',
            noticeVersion: 'v1.0-hackathon',
            grantedAt: new Date('2026-10-14T09:14:50Z'),
          },
        ],
      },
      sessions: {
        create: [
          {
            id: 'session-001',
            state: 'ENDED',
            startedAt: new Date('2026-10-14T09:15:00Z'),
            endedAt: new Date('2026-10-14T09:18:30Z'),
            utterances: {
              create: [
                {
                  id: 'utt-001',
                  speaker: 'caller',
                  text: 'นี่คือพันตำรวจเอก สมศักดิ์ จากสถานีตำรวจภูธรเมืองทอง บัญชีคุณพัวพันคดีฟอกเงิน',
                  transcriptState: 'COMMITTED',
                  startedAtMs: 1200,
                  endedAtMs: 5400,
                },
                {
                  id: 'utt-002',
                  speaker: 'user',
                  text: 'คุณตำรวจคะ ดิฉันไม่เคยเกี่ยวข้องเลยค่ะ ทำไมถึงมีชื่อดิฉันได้',
                  transcriptState: 'COMMITTED',
                  startedAtMs: 6000,
                  endedAtMs: 9800,
                },
                {
                  id: 'utt-003',
                  speaker: 'caller',
                  text: 'ถ้าบริสุทธิ์ใจจริง ต้องโอนเงินทั้งหมดเข้าบัญชีตรวจสอบ บัญชี 081-998-4321 เดี๋ยวนี้เลย!',
                  transcriptState: 'COMMITTED',
                  startedAtMs: 10500,
                  endedAtMs: 16200,
                },
                {
                  id: 'utt-004',
                  speaker: 'ai',
                  text: 'รับทราบครับท่านผู้การ กำลังเปิดแอปธนาคารอยู่ครับ แต่สัญญาณเน็ตหมุนอยู่ รบกวนทวนชื่อบัญชีอีกครั้งได้ไหมครับ',
                  transcriptState: 'COMMITTED',
                  startedAtMs: 18000,
                  endedAtMs: 24500,
                },
              ],
            },
          },
        ],
      },
      assessments: {
        create: [
          {
            id: 'assessment-001',
            score: 96,
            level: 'critical',
            summary:
              'ตรวจพบลักษณะการแอบอ้างเป็นเจ้าหน้าที่ตำรวจ ข่มขู่ดำเนินคดีฟอกเงิน และเร่งรัดให้โอนเงินไปยังบัญชีส่วนบุคคลทันที',
            recommendation:
              'ระงับการสนทนาและห้ามโอนเงินโดยเด็ดขาด เจ้าหน้าที่ตำรวจจริงไม่มีนโยบายให้โอนเงินเพื่อตรวจสอบบัญชี',
            modelVersion: 'scamtrap-engine-v1.4',
            inputSnapshot: {
              source: 'live_web_call',
              analyzedUtteranceCount: 4,
            },
            isDemo: true,
            evidence: {
              create: [
                {
                  sourceId: 'utt-001',
                  quote: 'นี่คือพันตำรวจเอก สมศักดิ์ จากสถานีตำรวจภูธรเมืองทอง บัญชีคุณพัวพันคดีฟอกเงิน',
                  startOffset: 0,
                  endOffset: 77,
                  tactic: 'authority_impersonation',
                  explanation: 'แอบอ้างเป็นตำรวจยศสูงและสถานีตำรวจเพื่อสร้างความน่าเชื่อถือและความกลัว',
                },
                {
                  sourceId: 'utt-003',
                  quote: 'ถ้าบริสุทธิ์ใจจริง ต้องโอนเงินทั้งหมดเข้าบัญชีตรวจสอบ บัญชี 081-998-4321 เดี๋ยวนี้เลย!',
                  startOffset: 0,
                  endOffset: 85,
                  tactic: 'financial_coercion_and_urgency',
                  explanation: 'บีบบังคับให้โอนเงินโดยอ้างการตรวจสอบความบริสุทธิ์พร้อมเร่งรัดเวลา',
                },
              ],
            },
            entityMentions: {
              create: [
                {
                  id: 'mention-001',
                  type: 'bank_account',
                  encryptedValue: sharedAccountEncrypted,
                  lookupDigest: sharedAccountDigest,
                  sourceId: 'utt-003',
                  speaker: 'caller',
                  confidence: 0.98,
                  verified: true,
                },
                {
                  id: 'mention-002',
                  type: 'phone',
                  encryptedValue: encryptValue('0819984321'),
                  lookupDigest: computeLookupDigest('phone', '0819984321'),
                  sourceId: 'utt-003',
                  speaker: 'caller',
                  confidence: 0.92,
                  verified: true,
                },
              ],
            },
            intelChecks: {
              create: [
                {
                  id: 'check-001',
                  provider: 'Anti-Scam Intelligence Center (AOC 1441)',
                  status: 'match',
                  threatType: 'Mule Account / Call Center Gang',
                  responseSummary: {
                    blacklistStatus: 'CONFIRMED_FRAUD',
                    reportedTimes: 14,
                    lastReported: '2026-10-12',
                  },
                  isDemo: true,
                },
              ],
            },
          },
        ],
      },
      sharedItems: {
        create: [
          {
            id: 'shared-001',
            type: 'bank_account',
            encryptedValue: sharedAccountEncrypted,
            lookupDigest: sharedAccountDigest,
            reviewStatus: 'APPROVED',
            approvedAt: new Date('2026-10-14T10:00:00Z'),
          },
        ],
      },
      auditEvents: {
        create: [
          {
            actorId: demoUserId,
            action: 'CASE_CREATED',
            metadata: { title: 'สายด่วนแอบอ้างตำรวจ' },
            occurredAt: new Date('2026-10-14T09:15:00Z'),
          },
          {
            actorId: demoUserId,
            action: 'AI_DECOY_ACTIVATED',
            metadata: { sessionId: 'session-001', requestedState: 'PREPARING_AI' },
            occurredAt: new Date('2026-10-14T09:17:15Z'),
          },
          {
            actorId: 'system',
            action: 'ASSESSMENT_COMPLETED',
            metadata: { score: 96, level: 'critical' },
            occurredAt: new Date('2026-10-14T09:18:00Z'),
          },
          {
            actorId: demoUserId,
            action: 'INDICATOR_SHARED',
            metadata: { type: 'bank_account', lookupDigest: sharedAccountDigest },
            occurredAt: new Date('2026-10-14T09:30:00Z'),
          },
        ],
      },
    },
  });

  // ==========================================
  // CASE 2: Customs Parcel Phishing SMS
  // ==========================================
  console.log('Seeding Case 2: Customs Parcel Phishing SMS...');
  const case2 = await prisma.case.create({
    data: {
      id: 'demo-case-002-customs-sms',
      ownerId: demoUserId,
      title: 'SMS หลอกพัสดุศุลกากรค้างส่ง ลิงก์ปลอมดูดข้อมูล',
      status: 'COMPLETED',
      isDemo: true,
      createdAt: new Date('2026-10-15T08:20:00Z'),
      inputs: {
        create: [
          {
            id: 'input-002-sms',
            type: 'TEXT',
            source: 'sms_forward',
            content:
              'แจ้งเตือนกรมศุลกากร: พัสดุเลขที่ TH998234 ของคุณค้างชำระภาษี 45 บาท กรุณายืนยันตัวตนและชำระที่ https://customs-parcel-th-track.vip/auth ภายใน 24 ชม. ก่อนถูกยึดพัสดุ',
            createdAt: new Date('2026-10-15T08:20:10Z'),
          },
        ],
      },
      consents: {
        create: [
          {
            id: 'consent-002',
            subjectId: demoUserId,
            scope: 'text_analysis',
            noticeVersion: 'v1.0-hackathon',
            grantedAt: new Date('2026-10-15T08:20:00Z'),
          },
        ],
      },
      assessments: {
        create: [
          {
            id: 'assessment-002',
            score: 88,
            level: 'high',
            summary: 'ตรวจพบ SMS แอบอ้างหน่วยงานรัฐ ลิงก์เว็บไซต์เลียนแบบ และใช้ยอดเงินเล็กน้อยเป็นเหยื่อล่อ',
            recommendation: 'ห้ามคลิกลิงก์และห้ามกรอกข้อมูลบัตรหรือรหัส OTP ในเว็บไซต์ดังกล่าว',
            modelVersion: 'scamtrap-engine-v1.4',
            inputSnapshot: {
              source: 'sms_forward',
              inputType: 'TEXT',
            },
            isDemo: true,
            evidence: {
              create: [
                {
                  sourceId: 'input-002-sms',
                  quote: 'https://customs-parcel-th-track.vip/auth',
                  startOffset: 77,
                  endOffset: 118,
                  tactic: 'phishing_domain',
                  explanation: 'โดเมนไม่ใช่เว็บไซต์ทางการของกรมศุลกากร (.go.th) แต่เป็นโดเมนปลอมแปลง (.vip)',
                },
                {
                  sourceId: 'input-002-sms',
                  quote: 'ชำระที่ ... ภายใน 24 ชม. ก่อนถูกยึดพัสดุ',
                  startOffset: 95,
                  endOffset: 140,
                  tactic: 'urgency_threat',
                  explanation: 'กำหนดเวลาจำกัดและขู่ว่าจะยึดพัสดุเพื่อเร่งให้เหยื่อรีบคลิก',
                },
              ],
            },
            entityMentions: {
              create: [
                {
                  id: 'mention-003',
                  type: 'url',
                  encryptedValue: sharedUrlEncrypted,
                  lookupDigest: sharedUrlDigest,
                  sourceId: 'input-002-sms',
                  speaker: 'caller',
                  confidence: 0.99,
                  verified: true,
                },
              ],
            },
            intelChecks: {
              create: [
                {
                  id: 'check-002',
                  provider: 'Threat Intel / PhishTank',
                  status: 'match',
                  threatType: 'Phishing / Credential Harvesting',
                  responseSummary: {
                    domainAgeDays: 3,
                    sslIssuer: "Let's Encrypt",
                    category: 'Fake Government Portal',
                  },
                  isDemo: true,
                },
              ],
            },
          },
        ],
      },
      sharedItems: {
        create: [
          {
            id: 'shared-002',
            type: 'url',
            encryptedValue: sharedUrlEncrypted,
            lookupDigest: sharedUrlDigest,
            reviewStatus: 'APPROVED',
            approvedAt: new Date('2026-10-15T08:35:00Z'),
          },
        ],
      },
      auditEvents: {
        create: [
          {
            actorId: demoUserId,
            action: 'CASE_CREATED',
            metadata: { title: 'SMS หลอกพัสดุศุลกากร' },
            occurredAt: new Date('2026-10-15T08:20:00Z'),
          },
          {
            actorId: 'system',
            action: 'ASSESSMENT_COMPLETED',
            metadata: { score: 88, level: 'high' },
            occurredAt: new Date('2026-10-15T08:20:25Z'),
          },
        ],
      },
    },
  });

  // ==========================================
  // CASE 3: Recurring Account Scam (Job Order Scheme)
  // Re-uses the EXACT same bank account lookup digest as Case 1!
  // ==========================================
  console.log('Seeding Case 3: Job Order Scheme sharing the same bank account digest as Case 1...');
  const case3 = await prisma.case.create({
    data: {
      id: 'demo-case-003-recurring-job',
      ownerId: 'another-user-123',
      title: 'งานกดรับออเดอร์ออนไลน์ หลอกโอนเงินสำรองทุน (บัญชีม้าซ้ำ)',
      status: 'COMPLETED',
      isDemo: true,
      createdAt: new Date('2026-10-15T10:00:00Z'),
      inputs: {
        create: [
          {
            id: 'input-003-job',
            type: 'TEXT',
            source: 'line_chat_export',
            content:
              'ยินดีด้วยค่ะคุณได้รับคัดเลือกทำงานพาร์ทไทม์กดรับออเดอร์สินค้า รายได้วันละ 1,500-3,000 บาท เพียงเติมเงินสำรองทุนเริ่มต้น 500 บาท โอนเข้าบัญชี 081-998-4321 ธนาคารกรุงสยาม ถอนเงินคืนพร้อมกำไรทันที',
            createdAt: new Date('2026-10-15T10:00:05Z'),
          },
        ],
      },
      consents: {
        create: [
          {
            id: 'consent-003',
            subjectId: 'another-user-123',
            scope: 'text_analysis',
            noticeVersion: 'v1.0-hackathon',
            grantedAt: new Date('2026-10-15T10:00:00Z'),
          },
        ],
      },
      assessments: {
        create: [
          {
            id: 'assessment-003',
            score: 94,
            level: 'critical',
            summary: 'ตรวจพบแผนหลอกลวงทำงานออนไลน์กดออเดอร์ และใช้เลขบัญชีม้าที่ตรวจพบซ้ำในระบบ',
            recommendation: 'ห้ามโอนเงินค่าสำรองทุนเด็ดขาด บัญชีนี้มีประวัติเกี่ยวข้องกับคดีหลอกลวงอื่นในระบบ',
            modelVersion: 'scamtrap-engine-v1.4',
            inputSnapshot: {
              source: 'line_chat_export',
              inputType: 'TEXT',
            },
            isDemo: true,
            evidence: {
              create: [
                {
                  sourceId: 'input-003-job',
                  quote: 'เพียงเติมเงินสำรองทุนเริ่มต้น 500 บาท โอนเข้าบัญชี 081-998-4321 ... ถอนเงินคืนพร้อมกำไรทันที',
                  startOffset: 70,
                  endOffset: 165,
                  tactic: 'advance_fee_and_high_return_bait',
                  explanation: 'หลอกล่อด้วยผลตอบแทนสูงเกินจริงและบังคับให้โอนเงินสำรองทุนก่อน',
                },
              ],
            },
            entityMentions: {
              create: [
                {
                  id: 'mention-004',
                  type: 'bank_account',
                  encryptedValue: sharedAccountEncrypted,
                  lookupDigest: sharedAccountDigest,
                  sourceId: 'input-003-job',
                  speaker: 'caller',
                  confidence: 0.99,
                  verified: true,
                },
              ],
            },
            intelChecks: {
              create: [
                {
                  id: 'check-003',
                  provider: 'Community Fraud Intelligence',
                  status: 'match',
                  threatType: 'Recurring Scammer Account',
                  responseSummary: {
                    crossCaseMatches: 2,
                    communityApproved: true,
                  },
                  isDemo: true,
                },
              ],
            },
          },
        ],
      },
      auditEvents: {
        create: [
          {
            actorId: 'another-user-123',
            action: 'CASE_CREATED',
            metadata: { title: 'งานกดรับออเดอร์ออนไลน์' },
            occurredAt: new Date('2026-10-15T10:00:00Z'),
          },
          {
            actorId: 'system',
            action: 'ASSESSMENT_COMPLETED',
            metadata: { score: 94, level: 'critical', isRecurring: true },
            occurredAt: new Date('2026-10-15T10:00:30Z'),
          },
        ],
      },
    },
  });

  // ==========================================
  // Generate Official Reports for Cases
  // ==========================================
  console.log('Generating official versioned Incident Reports for demo cases...');
  const reportService = new ReportService(prisma);
  const report1 = await reportService.generateAndSaveReport(case1.id);
  const report2 = await reportService.generateAndSaveReport(case2.id);
  const report3 = await reportService.generateAndSaveReport(case3.id);

  console.log(`Generated Report 1 ID: ${report1.id} (Version: ${report1.version})`);
  console.log(`Generated Report 2 ID: ${report2.id} (Version: ${report2.version})`);
  console.log(`Generated Report 3 ID: ${report3.id} (Version: ${report3.version})`);

  console.log('--- ScamTrap AI Demo Database Seeding Completed Successfully! ---');
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDemoData()
    .catch((e) => {
      console.error('Seed script failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
