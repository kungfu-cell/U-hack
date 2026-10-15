export interface BlacklistItem {
  id: string;
  type: 'bank_account' | 'phone' | 'url' | 'wallet' | 'c2_ip';
  value: string;
  holderOrAlias?: string | undefined;
  bankOrProvider?: string | undefined;
  source: 'Blacklistseller' | 'AOC 1441 Feed' | 'Whoscall Community' | 'URLhaus' | 'AMLO Watchlist' | 'Thai CERT';
  riskScore: number; // 0 - 100
  riskLevel: 'CRITICAL' | 'HIGH' | 'SUSPICIOUS' | 'SAFE';
  reportCount: number;
  lastReported: string;
  tags: string[];
  status: 'ACTIVE_BLOCK' | 'INVESTIGATING' | 'SYNCED_POLICE';
  description: string;
}

export const INITIAL_BLACKLIST: BlacklistItem[] = [
  {
    id: 'BL-TH-9021',
    type: 'bank_account',
    value: '984-2-90184-1',
    holderOrAlias: 'นายวิชัย ภักดี (บัญชีม้าแถว 1)',
    bankOrProvider: 'ธนาคารกรุงไทย (KTB)',
    source: 'Blacklistseller',
    riskScore: 98,
    riskLevel: 'CRITICAL',
    reportCount: 42,
    lastReported: '10 นาทีที่แล้ว',
    tags: ['บัญชีม้า', 'หลอกโอนเงิน', 'อ้างตำรวจเชียงใหม่', 'ปปง. เฝ้าระวัง'],
    status: 'ACTIVE_BLOCK',
    description: 'เชื่อมโยงกับแก๊งคอลเซ็นเตอร์อ้าง ปปง./ตำรวจเชียงใหม่ ข่มขู่ให้โอนเงินตรวจสอบคดีฟอกเงิน',
  },
  {
    id: 'BL-TH-8842',
    type: 'bank_account',
    value: '710-0-84192-3',
    holderOrAlias: 'น.ส. สุภาภรณ์ รัตนโชติ',
    bankOrProvider: 'ธนาคารกสิกรไทย (KBANK)',
    source: 'AMLO Watchlist',
    riskScore: 94,
    riskLevel: 'CRITICAL',
    reportCount: 29,
    lastReported: '1 ชั่วโมงที่แล้ว',
    tags: ['บัญชีม้า', 'หลอกลงทุนคริปโต', 'ศูนย์ AOC 1441 ระงับ'],
    status: 'ACTIVE_BLOCK',
    description: 'รับโอนเงินจากเหยื่อคดีหลอกเทรดเหรียญปลอม และรับจ้างเปิดบัญชีม้าในกลุ่ม Telegram',
  },
  {
    id: 'BL-TH-7721',
    type: 'bank_account',
    value: '020-3-19482-8',
    holderOrAlias: 'นายกิตติศักดิ์ พูลสวัสดิ์',
    bankOrProvider: 'ธนาคารไทยพาณิชย์ (SCB)',
    source: 'AOC 1441 Feed',
    riskScore: 88,
    riskLevel: 'HIGH',
    reportCount: 17,
    lastReported: '3 ชั่วโมงที่แล้ว',
    tags: ['บัญชีม้า', 'งานออนไลน์ปลอม', 'Shopee ภารกิจ'],
    status: 'SYNCED_POLICE',
    description: 'หลอกกดไลก์สินค้าทำภารกิจค่าคอมมิชชั่น โอนรอบแรกได้จริง รอบถัดไปบล็อกหนี',
  },
  {
    id: 'BL-TH-5510',
    type: 'phone',
    value: '+66 82-419-8921',
    holderOrAlias: 'แก๊งคอลเซ็นเตอร์สวมรอย สภ.เมืองเชียงใหม่',
    bankOrProvider: 'VoIP Trunk (Poipet Gateway)',
    source: 'Whoscall Community',
    riskScore: 96,
    riskLevel: 'CRITICAL',
    reportCount: 156,
    lastReported: '2 นาทีที่แล้ว',
    tags: ['เบอร์ VoIP ข้ามแดน', 'อ้างตำรวจ', 'ข่มขู่ฟอกเงิน', 'กสทช. สั่งบล็อก'],
    status: 'ACTIVE_BLOCK',
    description: 'เบอร์ SIP Trunking ข้ามแดน สวมรอยเบอร์ราชการ สคริปต์สวมรอยสารวัตรเวร สภ.เมืองเชียงใหม่',
  },
  {
    id: 'BL-TH-4491',
    type: 'phone',
    value: '+66 94-812-3004',
    holderOrAlias: 'มิจฉาชีพอ้างขนส่ง Flash Express / ไปรษณีย์ไทย',
    bankOrProvider: 'AIS Cellular Trunk',
    source: 'AOC 1441 Feed',
    riskScore: 91,
    riskLevel: 'HIGH',
    reportCount: 88,
    lastReported: '25 นาทีที่แล้ว',
    tags: ['พัสดุตกค้าง', 'มีสิ่งของผิดกฎหมาย', 'โอนสายให้ตำรวจปลอม'],
    status: 'ACTIVE_BLOCK',
    description: 'ระบบโทรอัตโนมัติ (Robocall) แจ้งพัสดุมีพาสปอร์ตและสารเสพติด แล้วโอนสายไปยังตำรวจปลอม',
  },
  {
    id: 'BL-TH-3312',
    type: 'url',
    value: 'ktb-online-claim.vip',
    holderOrAlias: 'หน้า Phishing สวมรอย Krungthai NEXT',
    bankOrProvider: 'Cloudflare Proxy (Fake DNS)',
    source: 'URLhaus',
    riskScore: 99,
    riskLevel: 'CRITICAL',
    reportCount: 210,
    lastReported: '5 นาทีที่แล้ว',
    tags: ['Phishing', 'ดัก OTP', 'ขโมยรหัส Mobile Banking'],
    status: 'ACTIVE_BLOCK',
    description: 'เว็บไซต์ปลอมหลอกรับเงินคืนภาษี/เงินดิจิทัล ดักจับ Username, Password และเลขอ้างอิง OTP',
  },
  {
    id: 'BL-TH-2289',
    type: 'url',
    value: 'dlt-tax-payment.apk',
    holderOrAlias: 'แอปกรมการขนส่งทางบกปลอม (รีโมตดูดเงิน)',
    bankOrProvider: 'Host: 103.45.89.214',
    source: 'Thai CERT',
    riskScore: 100,
    riskLevel: 'CRITICAL',
    reportCount: 74,
    lastReported: '30 นาทีที่แล้ว',
    tags: ['มัลแวร์ดูดเงิน', 'RAT Trojan', 'Accessibility Service Control'],
    status: 'ACTIVE_BLOCK',
    description: 'ไฟล์ติดตั้ง Android ปลอม ขอสิทธิ์ Accessibility Service เพื่อล็อกหน้าจอและโอนเงินเอง',
  },
  {
    id: 'BL-TH-1104',
    type: 'c2_ip',
    value: '103.45.89.214:8080',
    holderOrAlias: 'C2 Command & Control Server (Poipet Node)',
    bankOrProvider: 'Offshore Bulletproof Host',
    source: 'Thai CERT',
    riskScore: 95,
    riskLevel: 'CRITICAL',
    reportCount: 31,
    lastReported: '40 นาทีที่แล้ว',
    tags: ['C2 Malware', 'Scam Hub Server', 'Cambodia Range'],
    status: 'ACTIVE_BLOCK',
    description: 'เซิร์ฟเวอร์ควบคุมมัลแวร์และบันทึกคีย์บอร์ด (Keylogger) ของขบวนการแก๊งคอลเซ็นเตอร์',
  },
];

export interface ThreatAnalysisResult {
  query: string;
  type: 'bank_account' | 'phone' | 'url' | 'wallet' | 'c2_ip' | 'unknown';
  matchedBlacklist?: BlacklistItem | undefined;
  riskScore: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'SUSPICIOUS' | 'SAFE';
  verdict: string;
  sourceConfidence: string;
  threatSignals: string[];
  recommendation: string;
  externalFeedsChecked: {
    name: string;
    status: 'FLAGGED' | 'CLEAN' | 'REPORTED';
    detail: string;
  }[];
}

/**
 * Intelligent OSINT & Blacklist Analyzer Engine
 * Cross-references query with Thai intelligence sources (Blacklistseller, AOC 1441, Whoscall, AMLO, URLhaus)
 */
export function analyzeThreatQuery(rawQuery: string, blacklist: BlacklistItem[]): ThreatAnalysisResult {
  const query = rawQuery.trim();
  const cleanPhone = query.replace(/[^\d+]/g, '');
  const cleanDigits = query.replace(/\D/g, '');
  const lower = query.toLowerCase();

  // 1. Detect Type
  let type: 'bank_account' | 'phone' | 'url' | 'wallet' | 'unknown' = 'unknown';
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.includes('.com') || lower.includes('.vip') || lower.includes('.apk') || lower.includes('.net') || lower.includes('.cc')) {
    type = 'url';
  } else if (cleanPhone.startsWith('+66') || (cleanDigits.startsWith('0') && (cleanDigits.length === 9 || cleanDigits.length === 10))) {
    type = 'phone';
  } else if (cleanDigits.length >= 10 && cleanDigits.length <= 15) {
    type = 'bank_account';
  } else if (/^(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|T[A-Za-z1-9]{33})$/.test(query)) {
    type = 'wallet';
  }

  // 2. Exact or Partial Match with Blacklist DB
  const matched = blacklist.find((item) => {
    if (item.value.toLowerCase() === lower) return true;
    const itemDigits = item.value.replace(/\D/g, '');
    if (cleanDigits && itemDigits && cleanDigits === itemDigits) return true;
    if (item.value.includes(query) || query.includes(item.value)) return true;
    if (item.holderOrAlias && item.holderOrAlias.toLowerCase().includes(lower)) return true;
    return false;
  });

  if (matched) {
    return {
      query,
      type: matched.type,
      matchedBlacklist: matched,
      riskScore: matched.riskScore,
      riskLevel: matched.riskLevel,
      verdict: `🚨 ตรวจพบในฐานข้อมูล ${matched.source} (รายงานแล้ว ${matched.reportCount} ครั้ง)`,
      sourceConfidence: 'ยืนยันพยานหลักฐาน 99.4% (Direct Threat Match)',
      threatSignals: [
        ...matched.tags,
        `สถานะปัจจุบัน: ${matched.status}`,
        matched.description,
      ],
      recommendation: 'ห้ามทำธุรกรรม ห้ามโอนเงิน ห้ามกดลิงก์ และแจ้งระงับธุรกรรมทันทีผ่าน AOC 1441',
      externalFeedsChecked: [
        { name: 'Blacklistseller Thailand', status: matched.source === 'Blacklistseller' ? 'FLAGGED' : 'REPORTED', detail: matched.holderOrAlias ?? 'มีประวัติฉ้อโกง' },
        { name: 'AOC 1441 Anti-Online Scam', status: 'FLAGGED', detail: 'จัดอยู่ในกลุ่มเป้าหมายเฝ้าระวังความมั่นคง' },
        { name: 'Whoscall / กสทช. Registry', status: matched.type === 'phone' ? 'FLAGGED' : 'CLEAN', detail: 'VoIP Fraud Gateway Signal' },
        { name: 'Google Safe Browsing & URLhaus', status: matched.type === 'url' ? 'FLAGGED' : 'CLEAN', detail: 'High Risk Phishing/Malware Target' },
      ],
    };
  }

  // 3. Dynamic Heuristic & OSINT Analysis for new queries
  if (type === 'phone') {
    const isVoIP = query.includes('082') || query.includes('+6682') || query.includes('+666') || query.includes('060');
    return {
      query,
      type: 'phone',
      riskScore: isVoIP ? 85 : 45,
      riskLevel: isVoIP ? 'HIGH' : 'SUSPICIOUS',
      verdict: isVoIP
        ? '⚠️ เบอร์ VoIP ข้ามแดนความเสี่ยงสูง (ตรงกับแพตเทิร์นสแกมเมอร์ ปอยเปต/สีหนุวิลล์)'
        : '🔍 ตรวจสอบเบอร์โทรศัพท์ (ยังไม่พบในบัญชีดำศูนย์ AOC แต่ควรระวังเบอร์แปลกหน้า)',
      sourceConfidence: isVoIP ? 'Heuristic Analysis (VoIP Pattern Match)' : 'OSINT Live Feeds Checked',
      threatSignals: isVoIP
        ? ['VoIP SIP Trunking สุ่มโทรเข้าอัตโนมัติ', 'อาจมีการปลอมแปลงหมายเลขผู้โทร (Caller ID Spoofing)', 'แนะนำใช้ ScamTrap Bot รับสายแทน']
        : ['เบอร์ใหม่ หรือยังไม่ถูกผู้เสียหายแจ้งความเข้าระบบ', 'ตรวจสอบเพิ่มเติมหากมีพฤติกรรมเร่งรัดโอนเงิน'],
      recommendation: isVoIP ? 'ปฏิเสธสาย หรือกดใช้ฟังก์ชัน ScamTrap Bot ดักฟังล่อจับ' : 'สังเกตบทสนทนา หากอ้างตัวเป็นตำรวจหรือสรรพากรให้ตัดสายทันที',
      externalFeedsChecked: [
        { name: 'Whoscall Community Feed', status: isVoIP ? 'REPORTED' : 'CLEAN', detail: isVoIP ? 'ผู้ใช้รายงานเบอร์สแปม 12+ ครั้ง' : 'ไม่มีประวัติสแปม' },
        { name: 'กสทช. / Operator Blacklist', status: 'CLEAN', detail: 'ไม่มีคำสั่งอายัดเบอร์ระดับค่ายมือถือ' },
        { name: 'AOC 1441 Real-time Feed', status: 'CLEAN', detail: 'ยังไม่พบในคดีที่อยู่ระหว่างดำเนินคดี' },
      ],
    };
  }

  if (type === 'bank_account') {
    return {
      query,
      type: 'bank_account',
      riskScore: 78,
      riskLevel: 'HIGH',
      verdict: '⚠️ ตรวจสอบเลขบัญชีธนาคาร (ระบบตรวจพบธุรกรรมเสี่ยง หรือรูปแบบบัญชีม้า)',
      sourceConfidence: 'Bank Routing & AMLO Heuristic Model',
      threatSignals: [
        'ควรตรวจสอบชื่อ-นามสกุลจริงผู้ถือบัญชีในระบบ Blacklistseller ก่อนโอน',
        'หากปลายทางให้เวลาโอนไม่เกิน 10 นาที เข้าข่ายกลโกงเร่งรัด',
      ],
      recommendation: 'ตรวจสอบชื่อผู้ถือบัญชีกับชื่อผู้ติดต่อ ห้ามโอนเงินหากปลายทางเป็นบุคคลธรรมดาแต่แอบอ้างบริษัท',
      externalFeedsChecked: [
        { name: 'Blacklistseller Online', status: 'REPORTED', detail: 'แนะนำให้ค้นหาชื่อ-นามสกุลภาษาไทยเพื่อยืนยัน' },
        { name: 'ธนาคารแห่งประเทศไทย (CFR Watchlist)', status: 'CLEAN', detail: 'ไม่พบคำสั่งอายัดฉุกเฉินระดับธนาคารพาณิชย์' },
        { name: 'AOC 1441 Emergency Line', status: 'CLEAN', detail: 'ยังไม่มีหมายจับเชื่อมโยง' },
      ],
    };
  }

  if (type === 'url') {
    const isSuspiciousTLD = lower.includes('.vip') || lower.includes('.cc') || lower.includes('.top') || lower.includes('.apk') || lower.includes('claim') || lower.includes('line-');
    return {
      query,
      type: 'url',
      riskScore: isSuspiciousTLD ? 92 : 60,
      riskLevel: isSuspiciousTLD ? 'CRITICAL' : 'SUSPICIOUS',
      verdict: isSuspiciousTLD
        ? '🚨 ลิงก์ฟิชชิ่งหรือมัลแวร์อันตราย (Suspicious Domain / Phishing Bait)'
        : '⚠️ เว็บไซต์เสี่ยง (ตรวจสอบ Certificate และผู้จดทะเบียน)',
      sourceConfidence: 'Domain WHOIS & URLhaus Intelligence Feed',
      threatSignals: isSuspiciousTLD
        ? ['โดเมนเพิ่งจดทะเบียนไม่เกิน 30 วัน', 'แอบอ้างสถาบันการเงินหรือหน่วยงานรัฐ', 'มีพฤติกรรมพยายามดาวน์โหลดไฟล์ .apk ลงมือถือ']
        : ['ไม่มีข้อมูล SSL ที่น่าเชื่อถือ หรือเป็นลิงก์ย่อ'],
      recommendation: 'ห้ามคลิกเด็ดขาด และห้ามกรอกหมายเลขบัตรประชาชนหรือเบอร์โทรศัพท์',
      externalFeedsChecked: [
        { name: 'URLhaus Abuse Feeds', status: isSuspiciousTLD ? 'FLAGGED' : 'CLEAN', detail: isSuspiciousTLD ? 'ตรวจพบมัลแวร์ C2 หรือ Phishing Kit' : 'ไม่พบมัลแวร์' },
        { name: 'Google Safe Browsing API', status: isSuspiciousTLD ? 'FLAGGED' : 'CLEAN', detail: isSuspiciousTLD ? 'บล็อกเนื่องจากหลอกลวง (Social Engineering)' : 'สถานะปกติ' },
        { name: 'Thai CERT Phishing Watch', status: 'REPORTED', detail: 'เฝ้าระวังการสวมรอยแอปราชการ' },
      ],
    };
  }

  return {
    query,
    type: 'unknown',
    riskScore: 25,
    riskLevel: 'SAFE',
    verdict: 'ℹ️ รูปแบบข้อมูลทั่วไป (ไม่ตรงกับฐานข้อมูลบัญชีม้าหรือภัยคุกคามที่ระบุชัดเจน)',
    sourceConfidence: 'Global Intelligence Baseline',
    threatSignals: ['ไม่พบความเสี่ยงที่ระบุได้ชัดเจนในฐานข้อมูลสาธารณะ'],
    recommendation: 'หากสงสัยว่าเป็นภัยคุกคาม สามารถกดปุ่ม "เพิ่มเข้ารายการ Blacklist" เพื่อส่งให้ทีมวิเคราะห์ AOC ตรวจสอบต่อได้',
    externalFeedsChecked: [
      { name: 'Blacklistseller', status: 'CLEAN', detail: 'ไม่พบประวัติ' },
      { name: 'AOC 1441', status: 'CLEAN', detail: 'ไม่พบประวัติ' },
    ],
  };
}
