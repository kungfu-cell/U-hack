import { useState, useRef, useEffect, type FormEvent } from 'react';
import type { AnalysisResult } from '@scamtrap/contracts';
import { createCase, addCaseInput, analyzeCase, uploadCaseAudio } from '../../lib/api';
import { copyToClipboard, showToast } from '../../lib/toast';

interface PresetData {
  payload: string;
  url: string;
  phone: string;
  source: string;
  score: string;
  summary: string;
  verdict: string;
  verdictClass: string;
  confidence: string;
  bars: [number, number, number];
  iocs: Array<{ type: string; val: string; status: string; statusClass: string }>;
  mode: 'text' | 'image' | 'audio' | 'link';
}

type PresetKey = 'police' | 'bank' | 'warrant' | 'vishing' | 'trojan' | 'legit';

const PRESETS: Record<PresetKey, PresetData> = {
  police: {
    payload:
      'แจ้งความจาก สภ.เมืองเชียงใหม่: บัญชีธนาคารกรุงไทยของท่านพัวพันคดีฟอกเงินยาเสพติด ต้องโอนเงินทั้งหมดเข้ามาตรวจสอบที่บัญชีกลาง ปปง. (นายวิชัย ภักดี) ภายใน 30 นาที มิฉะนั้นจะออกหมายจับและอายัดทรัพย์สินทันที',
    url: 'https://royalthaipolice-verify-case.cc/auth',
    phone: '+66 82-419-8921',
    source: 'phone',
    score: '96.8%',
    summary: 'Organized Call Center Extortion • Police Impersonation',
    verdict: 'Critical Severity',
    verdictClass: 'badge-critical',
    confidence: 'HIGH COERCION',
    bars: [98, 94, 91],
    iocs: [
      { type: 'Domain', val: 'royalthaipolice-verify-case.cc', status: 'Phishing Domain', statusClass: 'badge-critical' },
      { type: 'Caller ID', val: '+66 82-419-8921', status: 'Mule VoIP Trunk', statusClass: 'badge-critical' },
      { type: 'Mule Target', val: 'นายวิชัย ภักดี (ปปง. ปลอม)', status: 'Flagged AOC 1441', statusClass: 'badge-warning' },
    ],
    mode: 'text',
  },
  bank: {
    payload:
      'ธนาคารกรุงไทย: คะแนนสะสมของคุณใกล้หมดอายุ แลกรับของขวัญมูลค่า 3,000 บาทได้ที่ลิงก์ด้านล่าง กรุณายืนยันรหัส OTP เพื่อสิทธิพิเศษ',
    url: 'https://ktb-reward-points.online/claim',
    phone: 'SMS: KTB-Privilege',
    source: 'sms',
    score: '89.4%',
    summary: 'Banking Credential Harvester • Fake OTP Trigger',
    verdict: 'High Risk Phishing',
    verdictClass: 'badge-warning',
    confidence: 'CREDENTIAL THEFT',
    bars: [85, 92, 95],
    iocs: [
      { type: 'Domain', val: 'ktb-reward-points.online', status: 'Fake Bank Domain', statusClass: 'badge-critical' },
      { type: 'SMS Header', val: 'KTB-Privilege (Spoofed)', status: 'Unregistered Sender', statusClass: 'badge-warning' },
    ],
    mode: 'text',
  },
  warrant: {
    payload:
      '[OCR Auto-Extracted: fake-police-arrest-warrant.png]\nสำนักงานตำรวจแห่งชาติ • หมายจับและคำสั่งอายัดทรัพย์สินเร่งด่วน\nผู้ต้องหา: นาย/นาง [REDACTED]\nข้อหา: พัวพันขบวนการฟอกเงินข้ามชาติ (แก๊งคอลเซ็นเตอร์)\nคำสั่ง: ให้โอนเงินในบัญชีทั้งหมดเข้ามาตรวจสอบที่ \'บัญชีกลางสำนักงานตำรวจแห่งชาติ\' ธนาคารกรุงไทย เลขที่ 984-2-90184-1 นายวิชัย ภักดี ภายใน 1 ชม. มิฉะนั้นจะออกหมายจับทันที',
    url: 'https://royalthaipolice-verify-case.cc/warrant-download',
    phone: '+66 82-419-8921',
    source: 'line',
    score: '99.1%',
    summary: 'Forged Police Arrest Warrant Image • Fabricated Official Seal & Mule Account',
    verdict: 'Critical Document Forgery',
    verdictClass: 'badge-critical',
    confidence: 'DOCUMENT FORGERY DETECTED',
    bars: [99, 98, 95],
    iocs: [
      { type: 'Document Hash', val: 'SHA256: e8b9410f...fake-seal.png', status: 'Tampered Police Crest', statusClass: 'badge-critical' },
      { type: 'Mule Account', val: 'KTB: 984-2-90184-1 (นายวิชัย ภักดี)', status: 'Flagged AOC 1441', statusClass: 'badge-critical' },
      { type: 'Spoofed Entity', val: 'สำนักงานตำรวจแห่งชาติ (ตราครุฑปลอม)', status: 'Impersonation Vector', statusClass: 'badge-warning' },
    ],
    mode: 'image',
  },
  vishing: {
    payload:
      '[ElevenLabs Scribe STT Transcribed: recorded-scammer-call.mp3]\n[00:01 Caller]: สวัสดีครับ ติดต่อจาก สภ.เมืองเชียงใหม่ ร้อยตำรวจเอก สุรเชษฐ์ นะครับ\n[00:08 Caller]: ทางเราจับกุมผู้ต้องหาคดียาเสพติดได้ และพบสมุดบัญชีธนาคารกรุงไทยเป็นชื่อของคุณ\n[00:16 Caller]: ตอนนี้ ปปง. ได้สั่งอายัดบัญชีชั่วคราว คุณต้องให้ความร่วมมือโอนเงินเข้ามาตรวจสอบความบริสุทธิ์ก่อน\n[00:26 Caller]: เรื่องนี้เป็นความลับทางราชการ ห้ามบอกญาติหรือวางสายเด็ดขาด มิฉะนั้นจะถือเป็นผู้สมรู้ร่วมคิดทันที',
    url: 'None detected (Voice Extortion)',
    phone: '+66 82-419-8921 (VoIP Trunk)',
    source: 'phone',
    score: '97.4%',
    summary: 'Audio Voice Phishing (Vishing) • Extortion & False Prosecution Coercion',
    verdict: 'Critical Coercion Audio',
    verdictClass: 'badge-critical',
    confidence: 'HIGH PSYCHOLOGICAL PRESSURE',
    bars: [98, 96, 92],
    iocs: [
      { type: 'Audio File', val: 'recorded-scammer-call.mp3 (01:42)', status: 'Vishing Audio Evidence', statusClass: 'badge-critical' },
      { type: 'Caller ID', val: '+66 82-419-8921', status: 'Known Mule VoIP Gateway', statusClass: 'badge-critical' },
      { type: 'Coercion Cue', val: 'ห้ามบอกญาติ / ห้ามวางสาย', status: 'Isolation Threat', statusClass: 'badge-critical' },
    ],
    mode: 'audio',
  },
  trojan: {
    payload:
      'กรมการขนส่งทางบก (DLT): ท่านค้างชำระภาษีป้ายทะเบียนรถยนต์ประจำปี ดาวน์โหลดแอปพลิเคชันเพื่อตรวจสอบและรับส่วนลดค่าปรับ',
    url: 'https://dlt-portal-service.apk/download',
    phone: 'SMS: DLT-Notice',
    source: 'web',
    score: '98.2%',
    summary: 'Remote Access Trojan (RAT) • Device Hijack APK',
    verdict: 'Critical Malware',
    verdictClass: 'badge-critical',
    confidence: 'MALICIOUS APK',
    bars: [90, 99, 98],
    iocs: [
      { type: 'Malicious File', val: 'dlt-portal-service.apk', status: 'RAT Signature', statusClass: 'badge-critical' },
      { type: 'IP C2 Host', val: '103.45.89.214:8080', status: 'Known Malware C2', statusClass: 'badge-critical' },
    ],
    mode: 'text',
  },
  legit: {
    payload:
      'รหัส OTP ของคุณคือ 841902 เพื่อยืนยันการทำรายการผ่าน Shopee Pay (ห้ามแจ้งรหัสนี้แก่ผู้อื่นโดยเด็ดขาด รหัสมีอายุ 5 นาที)',
    url: 'None detected',
    phone: 'ShopeePay-OTP',
    source: 'sms',
    score: '1.2%',
    summary: 'Legitimate Two-Factor Authentication • Standard Security Protocol',
    verdict: 'Verified Safe',
    verdictClass: 'badge-safe',
    confidence: 'CLEARED PROTOCOL',
    bars: [2, 0, 0],
    iocs: [
      { type: 'Sender ID', val: 'ShopeePay Authorized Gateway', status: 'Whitelisted', statusClass: 'badge-safe' },
    ],
    mode: 'text',
  },
};

const SAMPLE_WARRANT_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' fill='%23fef3c7'/><circle cx='200' cy='90' r='45' fill='%23dc2626' opacity='0.25'/><polygon points='200,55 210,80 235,80 215,95 222,120 200,105 178,120 185,95 165,80 190,80' fill='%23dc2626'/><text x='200' y='160' font-size='16' font-family='sans-serif' font-weight='bold' fill='%23991b1b' text-anchor='middle'>สำนักงานตำรวจแห่งชาติ (หมายจับ)</text><text x='200' y='185' font-size='12' font-family='sans-serif' fill='%2378350f' text-anchor='middle'>ข้อหาฟอกเงินยาเสพติดข้ามชาติ</text><rect x='40' y='210' width='320' height='2' fill='%23dc2626'/><text x='50' y='240' font-size='11' font-family='sans-serif' fill='%231f2937'>คำสั่ง: ให้อายัดทรัพย์สินและโอนเงินตรวจสอบ</text><text x='50' y='265' font-size='11' font-family='sans-serif' fill='%231f2937'>บัญชีกลาง ปปง. (นายวิชัย ภักดี) ธ.กรุงไทย</text><circle cx='310' cy='320' r='38' fill='none' stroke='%23dc2626' stroke-width='3' stroke-dasharray='4,2'/><text x='310' y='325' font-size='11' font-family='sans-serif' font-weight='bold' fill='%23dc2626' text-anchor='middle'>ตราประทับปลอม</text></svg>";

interface AttachmentItem {
  id: string;
  type: 'image' | 'audio';
  name: string;
  size: string;
  thumb?: string;
  badge: string;
}

type IocItem = PresetData['iocs'][number];

const getVerdictPresentation = (level: AnalysisResult['level']) => {
  if (level === 'critical') return { label: 'Critical Severity', className: 'badge-critical' };
  if (level === 'high') return { label: 'High Risk', className: 'badge-warning' };
  if (level === 'medium') return { label: 'Medium Risk', className: 'badge-warning' };
  return { label: 'Low / Cleared', className: 'badge-safe' };
};

const buildAnalysisBars = (result: AnalysisResult): [number, number, number] => {
  const linguisticConfidence = result.evidence.length > 0
    ? Math.round(Math.max(...result.evidence.map((item) => item.confidence)) * 100)
    : 0;
  const checkedThreats = result.threatChecks.filter((check) => check.status !== 'not_checked');
  const matchedThreats = checkedThreats.filter((check) => check.status === 'match');
  const urlThreats = checkedThreats.filter((check) => /^https?:\/\//i.test(check.indicator));
  const matchedUrls = urlThreats.filter((check) => check.status === 'match');

  return [
    Math.max(result.score, linguisticConfidence),
    checkedThreats.length > 0 ? Math.round((matchedThreats.length / checkedThreats.length) * 100) : 0,
    urlThreats.length > 0 ? Math.round((matchedUrls.length / urlThreats.length) * 100) : 0,
  ];
};

const buildAnalysisIocs = (result: AnalysisResult, url: string, phone: string): IocItem[] => {
  const items: IocItem[] = [];
  const normalizedUrl = url.trim();
  const normalizedPhone = phone.trim();

  if (normalizedUrl && !normalizedUrl.toLowerCase().startsWith('none detected')) {
    const check = result.threatChecks.find((item) => item.indicator === normalizedUrl);
    const presentation = check?.status === 'match'
      ? { status: check.threatType ?? 'Threat match', statusClass: 'badge-critical' }
      : check?.status === 'unavailable'
        ? { status: 'Threat check unavailable', statusClass: 'badge-warning' }
        : check?.status === 'not_found'
          ? { status: 'Not found in threat source', statusClass: 'badge-info' }
          : { status: 'Provided input', statusClass: 'badge-info' };
    items.push({
      type: 'Domain',
      val: normalizedUrl.replace(/^https?:\/\//, '').split('/')[0] ?? normalizedUrl,
      ...presentation,
    });
  }

  if (normalizedPhone && normalizedPhone.toLowerCase() !== 'none') {
    items.push({
      type: 'Caller ID',
      val: normalizedPhone,
      status: 'Provided input',
      statusClass: 'badge-info',
    });
  }

  for (const entity of result.entities) {
    if (entity.type === 'url' && normalizedUrl) continue;
    if (entity.type === 'phone' && normalizedPhone) continue;
    items.push({
      type: entity.type.replaceAll('_', ' ').toUpperCase(),
      val: entity.value,
      status: entity.verified ? 'Verified risk' : 'Detected entity',
      statusClass: entity.verified ? 'badge-critical' : 'badge-warning',
    });
  }

  return items;
};

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์เสียงไม่สำเร็จ'));
    reader.onload = () => {
      const encoded = String(reader.result ?? '').split(',')[1];
      if (!encoded) reject(new Error('ไฟล์เสียงไม่มีข้อมูล'));
      else resolve(encoded);
    };
    reader.readAsDataURL(file);
  });

export const QuickAnalysis = () => {
  const [activePreset, setActivePreset] = useState<string>('police');
  const [inputMode, setInputMode] = useState<'text' | 'image' | 'audio' | 'link'>('text');
  const [payloadText, setPayloadText] = useState(PRESETS.police.payload);
  const [url, setUrl] = useState(PRESETS.police.url);
  const [phone, setPhone] = useState(PRESETS.police.phone);
  const [sourceChannel, setSourceChannel] = useState(PRESETS.police.source);

  // Verdict state
  const [score, setScore] = useState(PRESETS.police.score);
  const [summary, setSummary] = useState(PRESETS.police.summary);
  const [verdict, setVerdict] = useState(PRESETS.police.verdict);
  const [verdictClass, setVerdictClass] = useState(PRESETS.police.verdictClass);
  const [confidence, setConfidence] = useState(PRESETS.police.confidence);
  const [bars, setBars] = useState<[number, number, number]>(PRESETS.police.bars);
  const [iocs, setIocs] = useState(PRESETS.police.iocs);
  const [riskScoreValue, setRiskScoreValue] = useState(96.8);
  const [analysisReference, setAnalysisReference] = useState('Demo preset');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [aiEvidence, setAiEvidence] = useState<
    Array<{ quote: string; tactic: string; explanation: string; confidence: number }>
  >([]);

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  // Dedicated image state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [imageSize, setImageSize] = useState<string>('');
  const [imageOcrText, setImageOcrText] = useState<string>('');

  // Dedicated audio state
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioSize, setAudioSize] = useState<string>('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioConsentConfirmed, setAudioConsentConfirmed] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioSec, setAudioSec] = useState(0);

  // Waveform heights
  const [waveformBars, setWaveformBars] = useState<number[]>(() =>
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 16 + 4)),
  );

  const fileInputImageRef = useRef<HTMLInputElement>(null);
  const fileInputAudioRef = useRef<HTMLInputElement>(null);
  const inlineImgInputRef = useRef<HTMLInputElement>(null);
  const inlineAudioInputRef = useRef<HTMLInputElement>(null);

  // Audio preview playback timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlayingAudio) {
      interval = setInterval(() => {
        setAudioSec((prev) => (prev >= 102 ? 0 : prev + 1));
        setWaveformBars(Array.from({ length: 32 }, () => Math.floor(Math.random() * 18 + 4)));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingAudio]);

  const invalidateAnalysis = () => {
    setActivePreset('');
    setScore('—');
    setRiskScoreValue(0);
    setSummary('ข้อมูลมีการเปลี่ยนแปลง กด Execute Risk Analysis เพื่อวิเคราะห์ใหม่');
    setVerdict('Awaiting Analysis');
    setVerdictClass('badge-info');
    setConfidence('NOT ANALYZED');
    setBars([0, 0, 0]);
    setIocs([]);
    setAiRecommendation(null);
    setAiEvidence([]);
    setAnalysisReference('No analysis yet');
  };

  const loadPreset = (key: PresetKey) => {
    const data = PRESETS[key];
    if (!data) return;
    setActivePreset(key);
    setPayloadText(data.payload);
    setUrl(data.url);
    setPhone(data.phone);
    setSourceChannel(data.source);
    setScore(data.score);
    setSummary(data.summary);
    setVerdict(data.verdict);
    setVerdictClass(data.verdictClass);
    setConfidence(data.confidence);
    setBars(data.bars);
    setIocs(data.iocs);
    setRiskScoreValue(Number.parseFloat(data.score));
    setAnalysisReference('Demo preset');
    setInputMode(data.mode);
    setAiRecommendation(null);
    setAiEvidence([]);

    if (key === 'warrant') {
      setImagePreview(SAMPLE_WARRANT_SVG);
      setImageName('fake-police-arrest-warrant.png');
      setImageSize('1.4 MB • 400×400 px');
      setImageOcrText(
        'สำนักงานตำรวจแห่งชาติ (หมายจับ) • ข้อหาฟอกเงินยาเสพติด • โอนเงินตรวจสอบบัญชีกลาง ปปง. (นายวิชัย ภักดี)',
      );
    } else if (key === 'vishing') {
      setAudioName('recorded-scammer-call.mp3');
      setAudioSize('2.8 MB • Dual Channel');
    }

    showToast(`โหลดสถานการณ์จำลอง: ${data.summary}`);
  };

  const handleInlineImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const thumb = String(e.target?.result ?? '');
      setAttachments((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          type: 'image',
          name: file.name,
          size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          thumb,
          badge: 'Preview only',
        },
      ]);
      setImageOcrText('OCR ยังไม่เปิดใช้ในต้นแบบ กรุณาวางข้อความจากภาพในช่องข้อความ');
      showToast(`แนบภาพ "${file.name}" สำหรับดูตัวอย่างแล้ว (ยังไม่ได้ทำ OCR)`);
    };
    reader.readAsDataURL(file);
  };

  const handleInlineAudio = (file: File) => {
    setAudioFile(file);
    setAudioConsentConfirmed(false);
    setAudioName(file.name);
    setAudioSize(`${(file.size / 1024 / 1024).toFixed(2)} MB`);
    setAttachments((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        type: 'audio',
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        badge: 'Awaiting Scribe',
      },
    ]);
    showToast(`เลือกไฟล์เสียง "${file.name}" แล้ว กดวิเคราะห์เพื่อส่งไป Scribe`);
  };

  const removeAttachment = (id: string) => {
    const attachment = attachments.find((item) => item.id === id);
    if (attachment?.type === 'audio') {
      setAudioFile(null);
      setAudioName(null);
      setAudioConsentConfirmed(false);
    }
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    showToast('ลบไฟล์แนบแล้ว');
  };

  const executeAnalysis = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setAnalyzing(true);

    try {
      // Execute against backend Case API
      const content = payloadText.trim() || url.trim();
      if (!content && !audioFile) {
        throw new Error('กรุณาใส่ข้อความ ลิงก์ หรือเลือกไฟล์เสียงก่อนเริ่มวิเคราะห์');
      }
      if (audioFile && !audioConsentConfirmed) {
        throw new Error('กรุณายืนยันว่าคุณมีสิทธิ์ส่งไฟล์เสียงนี้ไปประมวลผล');
      }
      if (content || audioFile) {
        const created = await createCase();
        const analyzed = audioFile
          ? (await uploadCaseAudio(created.id, {
              fileName: audioFile.name,
              mimeType: audioFile.type || 'audio/mpeg',
              audioBase64: await readFileAsBase64(audioFile),
              consentConfirmed: true,
            })).case
          : await (async () => {
              await addCaseInput(created.id, {
                type: url && !payloadText ? 'url' : 'text',
                content: `${content}${url ? `\nTarget URL: ${url}` : ''}${phone ? `\nCaller: ${phone}` : ''}`,
                source: sourceChannel,
              });
              return analyzeCase(created.id);
            })();
        window.localStorage.setItem('scamtrap:lastCaseId', created.id);
        window.localStorage.removeItem('scamtrap:lastSessionId');
        const result: AnalysisResult | null = analyzed.latestAnalysis;

        if (result) {
          const verdictPresentation = getVerdictPresentation(result.level);
          setScore(`${result.score}%`);
          setRiskScoreValue(result.score);
          setSummary(result.summary);
          setVerdict(verdictPresentation.label);
          setVerdictClass(verdictPresentation.className);
          setConfidence(result.verificationStatus.toUpperCase());
          setBars(buildAnalysisBars(result));
          setIocs(buildAnalysisIocs(result, url, phone));
          setAiRecommendation(result.recommendation || null);
          setAiEvidence(result.evidence);
          setAnalysisReference(`${result.isDemo ? 'Demo analysis' : 'Analysis'}: ${result.id.slice(0, 8)}`);
          setActivePreset('');
        }
      }
      showToast('การวิเคราะห์เสร็จสิ้น • โปรดตรวจสถานะแหล่งข้อมูลในผลลัพธ์');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'เชื่อมต่อระบบวิเคราะห์ไม่ได้';
      setScore('—');
      setRiskScoreValue(0);
      setSummary(`ไม่สามารถยืนยันผลวิเคราะห์ได้: ${message}`);
      setVerdict('Analysis Unavailable');
      setVerdictClass('badge-warning');
      setConfidence('UNAVAILABLE');
      setAiRecommendation('กรุณาลองใหม่เมื่อระบบพร้อม อย่าใช้ผลตัวอย่างเดิมเพื่อตัดสินข้อมูลนี้');
      setAiEvidence([]);
      setIocs([]);
      setBars([0, 0, 0]);
      setAnalysisReference('Analysis unavailable');
      showToast(`วิเคราะห์ไม่สำเร็จ: ${message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const clearForm = () => {
    setPayloadText('');
    setUrl('');
    setPhone('');
    setAttachments([]);
    setImagePreview(null);
    setAudioName(null);
    setAudioFile(null);
    setAudioConsentConfirmed(false);
    setImageName('');
    setImageSize('');
    setImageOcrText('');
    invalidateAnalysis();
    showToast('ล้างข้อมูลฟอร์มเรียบร้อย');
  };

  return (
    <div className="tab-pane active" id="tab-verify">
      <div className="grid-2col">
        {/* Left Column: Unified Multi-Modal Input */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Threat Intake &amp; Heuristic Verification
              </div>
              <div className="card-subtitle">
                ตรวจสอบข้อความน่าสงสัย, ลิงก์ฟิชชิ่ง, หมายจับปลอม (OCR) หรือไฟล์เสียงสนทนา
              </div>
            </div>
            <button className="btn-action btn-action-ghost" onClick={clearForm} style={{ height: 26, fontSize: 11 }}>
              Clear Form
            </button>
          </div>

          <div className="card-body">
            {/* Privacy Redaction Indicator */}
            <div className="privacy-notice">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>
                <strong>Privacy Guard Active:</strong> ชื่อ นามสกุล เลขบัตรประชาชน และ PIN ธนาคารจะถูก Redact ปิดบังอัตโนมัติก่อนวิเคราะห์
              </span>
            </div>

            {/* Quick Presets for Demo */}
            <div className="form-group">
              <span className="form-label">Simulate Real-World Incident Presets (Thai Fraud Vectors):</span>
              <div className="presets-row">
                <button
                  type="button"
                  className={`preset-chip ${activePreset === 'police' ? 'active' : ''}`}
                  onClick={() => loadPreset('police')}
                >
                  <span style={{ color: '#ef4444' }}>●</span> ตำรวจขู่โอนเงิน (สภ.เชียงใหม่)
                </button>
                <button
                  type="button"
                  className={`preset-chip ${activePreset === 'bank' ? 'active' : ''}`}
                  onClick={() => loadPreset('bank')}
                >
                  <span style={{ color: '#f59e0b' }}>●</span> SMS ธนาคารหลอกล่อ OTP
                </button>
                <button
                  type="button"
                  className={`preset-chip ${activePreset === 'warrant' ? 'active' : ''}`}
                  onClick={() => loadPreset('warrant')}
                >
                  <span style={{ color: '#ef4444' }}>●</span> หมายจับปลอม (Image OCR)
                </button>
                <button
                  type="button"
                  className={`preset-chip ${activePreset === 'vishing' ? 'active' : ''}`}
                  onClick={() => loadPreset('vishing')}
                >
                  <span style={{ color: '#38bdf8' }}>●</span> สายโทรขู่กรรโชก (Scribe STT)
                </button>
                <button
                  type="button"
                  className={`preset-chip ${activePreset === 'trojan' ? 'active' : ''}`}
                  onClick={() => loadPreset('trojan')}
                >
                  <span style={{ color: '#ef4444' }}>●</span> หลอกโหลด APK กรมขนส่ง
                </button>
                <button
                  type="button"
                  className={`preset-chip ${activePreset === 'legit' ? 'active' : ''}`}
                  onClick={() => loadPreset('legit')}
                >
                  <span style={{ color: 'var(--emerald)' }}>●</span> OTP ปกติ (ShopeePay)
                </button>
              </div>
            </div>

            {/* Channel / Modality Selector */}
            <div className="form-group">
              <span className="form-label">Input Modality:</span>
              <div className="input-mode-tabs">
                <button
                  type="button"
                  className={`input-mode-btn ${inputMode === 'text' ? 'active' : ''}`}
                  onClick={() => setInputMode('text')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Text / Chat Log
                </button>
                <button
                  type="button"
                  className={`input-mode-btn ${inputMode === 'image' ? 'active' : ''}`}
                  onClick={() => setInputMode('image')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  Image / OCR
                </button>
                <button
                  type="button"
                  className={`input-mode-btn ${inputMode === 'audio' ? 'active' : ''}`}
                  onClick={() => setInputMode('audio')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                  Audio File (Scribe STT)
                </button>
                <button
                  type="button"
                  className={`input-mode-btn ${inputMode === 'link' ? 'active' : ''}`}
                  onClick={() => setInputMode('link')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  Suspicious URL
                </button>
              </div>
            </div>

            {/* Mode 1: Text & Transcript */}
            {(inputMode === 'text' || inputMode === 'link') && (
              <div className="form-group">
                <label className="form-label" htmlFor="txt-payload">
                  Suspicious Content / Conversation Transcript:
                </label>
                <textarea
                  id="txt-payload"
                  className="textarea-box"
                  placeholder="วางข้อความ SMS, แชต LINE หรือบทสนทนาที่ต้องการวิเคราะห์..."
                  value={payloadText}
                  onChange={(e) => {
                    setPayloadText(e.target.value);
                    invalidateAnalysis();
                  }}
                />
                <div className="textarea-attachment-bar">
                  <div className="attach-btn-group">
                    <button
                      type="button"
                      className="btn-attach"
                      onClick={() => inlineImgInputRef.current?.click()}
                      title="Attach scam screenshot"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span>+ แนบรูปภาพ (preview)</span>
                    </button>
                    <button
                      type="button"
                      className="btn-attach"
                      onClick={() => inlineAudioInputRef.current?.click()}
                      title="Attach audio recording"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                      <span>+ แนบไฟล์เสียง</span>
                    </button>
                  </div>
                  <span style={{ color: 'var(--fg-muted)', fontSize: '10.5px' }}>Image preview &amp; Scribe upload</span>
                </div>
                <input
                  type="file"
                  ref={inlineImgInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleInlineImage(e.target.files[0])}
                />
                <input
                  type="file"
                  ref={inlineAudioInputRef}
                  style={{ display: 'none' }}
                  accept="audio/*"
                  onChange={(e) => e.target.files?.[0] && handleInlineAudio(e.target.files[0])}
                />

                {/* Attachments Tray */}
                {attachments.length > 0 && (
                  <div className="attachments-tray">
                    {attachments.map((att) => (
                      <div key={att.id} className="attachment-card">
                        <div className="attachment-card-left">
                          {att.thumb ? (
                            <img src={att.thumb} className="attachment-thumbnail" alt="Thumb" />
                          ) : (
                            <div className="attachment-icon-box">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                              </svg>
                            </div>
                          )}
                          <div className="attachment-info">
                            <div className="attachment-name">{att.name}</div>
                            <div className="attachment-meta">
                              <span>{att.size}</span>
                              <span className="badge-sev badge-safe" style={{ fontSize: '9.5px', padding: '1px 5px' }}>
                                {att.badge}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-remove-attachment"
                          onClick={() => removeAttachment(att.id)}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mode 2: Dedicated Image OCR */}
            {inputMode === 'image' && (
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Upload Scam Screenshot / Evidence Image (PNG, JPG, WebP):
                  </label>
                  <button
                    type="button"
                    className="btn-attach"
                    onClick={() => loadPreset('warrant')}
                    style={{ fontSize: '10.5px', height: 22, padding: '0 7px' }}
                  >
                    <span>📄 Load Sample Warrant</span>
                  </button>
                </div>
                <div className="upload-dropzone" onClick={() => fileInputImageRef.current?.click()}>
                  <svg className="dropzone-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <div className="dropzone-title">{imageName ? `Uploaded: ${imageName}` : 'Click to upload screenshot or drag image here'}</div>
                  <div className="dropzone-subtitle">Preview only — OCR is not enabled in this prototype</div>
                  <input
                    type="file"
                    ref={fileInputImageRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setImagePreview(String(ev.target?.result ?? ''));
                          setImageName(file.name);
                          setImageSize(`${(file.size / 1024 / 1024).toFixed(2)} MB`);
                          setImageOcrText('OCR ยังไม่เปิดใช้ในต้นแบบ กรุณาวางข้อความจากภาพในช่องข้อความ');
                          showToast(`อัปโหลดรูปภาพ "${file.name}" สำหรับดูตัวอย่างแล้ว (ยังไม่ได้ทำ OCR)`);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>

                {imagePreview && (
                  <div style={{ marginTop: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 76, height: 76, borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0, background: '#000', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={imagePreview} alt="Evidence Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{imageName}</span>
                          <span className="badge-sev badge-info">Preview only</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{imageSize}</div>
                        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--fg-secondary)', background: 'var(--surface)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border-subtle)', maxHeight: 60, overflowY: 'auto' }}>
                          {imageOcrText}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-remove-attachment"
                        onClick={() => {
                          setImagePreview(null);
                          setImageName('');
                          showToast('ลบรูปภาพแล้ว');
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mode 3: Dedicated Audio STT */}
            {inputMode === 'audio' && (
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Upload Recorded Call / Voice Clip (WAV, MP3, M4A up to 15MB):
                  </label>
                  <button
                    type="button"
                    className="btn-attach"
                    onClick={() => loadPreset('vishing')}
                    style={{ fontSize: '10.5px', height: 22, padding: '0 7px' }}
                  >
                    <span>🎙️ Load Sample Audio</span>
                  </button>
                </div>
                <div className="upload-dropzone" onClick={() => fileInputAudioRef.current?.click()}>
                  <svg className="dropzone-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  <div className="dropzone-title">
                    {audioName ? `Selected: ${audioName}` : 'Click to select audio recording for ElevenLabs Scribe STT'}
                  </div>
                  <div className="dropzone-subtitle">Supports bilingual Thai/English call center recordings with dual-channel diarization</div>
                  <input
                    type="file"
                    ref={fileInputAudioRef}
                    style={{ display: 'none' }}
                    accept="audio/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setAudioFile(file);
                        setAudioConsentConfirmed(false);
                        setAudioName(file.name);
                        setAudioSize(`${(file.size / 1024 / 1024).toFixed(2)} MB`);
                        showToast(`เลือกไฟล์เสียง "${file.name}" แล้ว กดวิเคราะห์เพื่อส่งไป Scribe`);
                      }
                    }}
                  />
                </div>

                {audioName && (
                  <div style={{ marginTop: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="pulse-dot-green" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{audioName}</span>
                        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{audioSize}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge-sev badge-info">Awaiting Scribe</span>
                        <button
                          type="button"
                          className="btn-remove-attachment"
                          onClick={() => {
                            setAudioName(null);
                            setAudioFile(null);
                            setAudioConsentConfirmed(false);
                            setIsPlayingAudio(false);
                            showToast('ลบไฟล์เสียงแล้ว');
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="mini-audio-player">
                      <button
                        type="button"
                        className="audio-play-btn"
                        onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                        title={isPlayingAudio ? 'Pause' : 'Play'}
                      >
                        {isPlayingAudio ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16" />
                            <rect x="14" y="4" width="4" height="16" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </button>
                      <div className="audio-waveform-bars">
                        {waveformBars.map((h, i) => (
                          <div
                            key={i}
                            className={`audio-wave-bar ${isPlayingAudio ? 'playing' : ''}`}
                            style={{ height: `${h}px` }}
                          />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-secondary)' }}>
                        {String(Math.floor(audioSec / 60)).padStart(2, '0')}:{String(audioSec % 60).padStart(2, '0')} / 01:42
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {audioFile && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, fontSize: 11.5, color: 'var(--fg-secondary)' }}>
                <input
                  type="checkbox"
                  checked={audioConsentConfirmed}
                  onChange={(event) => setAudioConsentConfirmed(event.target.checked)}
                />
                <span>
                  ฉันยืนยันว่ามีสิทธิ์และความยินยอมในการส่งไฟล์เสียงนี้ไปยัง ElevenLabs Scribe เพื่อถอดเสียง
                </span>
              </label>
            )}

            {/* Extracted URL & Phone */}
            <div className="grid-2col" style={{ gap: 12, marginBottom: 14 }}>
              <div>
                <label className="form-label" htmlFor="txt-url">
                  Extracted / Attached URL:
                </label>
                <input
                  type="text"
                  id="txt-url"
                  className="input-control"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    invalidateAnalysis();
                  }}
                  placeholder="เว้นว่างได้ หากไม่มี URL"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="txt-phone">
                  Caller / Sender ID:
                </label>
                <input
                  type="text"
                  id="txt-phone"
                  className="input-control"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    invalidateAnalysis();
                  }}
                  placeholder="เว้นว่างได้ หากไม่มีเบอร์หรือ Sender ID"
                />
              </div>
            </div>

            {/* Communication Channel */}
            <div className="form-group">
              <label className="form-label" htmlFor="select-source">
                Communication Channel:
              </label>
              <select
                id="select-source"
                className="input-control"
                value={sourceChannel}
                onChange={(e) => {
                  setSourceChannel(e.target.value);
                  invalidateAnalysis();
                }}
              >
                <option value="phone">Inbound Phone Call (สายโทรศัพท์เข้า)</option>
                <option value="sms">SMS Text Message</option>
                <option value="line">LINE Chat / Social Messaging</option>
                <option value="web">Web Browser / Mobile Phish</option>
              </select>
            </div>

            {/* Action CTA Button */}
            <button
              type="button"
              className="btn-action btn-action-primary"
              id="btn-run-analysis"
              style={{ width: '100%', height: 38, justifyContent: 'center', fontSize: 13 }}
              onClick={() => executeAnalysis()}
              disabled={analyzing}
            >
              {analyzing ? (
                <span>Evaluating with AI Core &amp; configured threat sources...</span>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Execute Risk Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Forensic Verdict & Evidence */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Forensic Verdict &amp; Risk Evaluation
              </div>
              <div className="card-subtitle">Analysis from configured AI and threat-intelligence sources</div>
            </div>
            <span className={`badge-sev ${verdictClass}`} id="badge-verdict">
              {verdict}
            </span>
          </div>

          <div className="card-body">
            {/* Confidence & Verdict Score */}
            <div className="verdict-box">
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--fg-muted)', textTransform: 'uppercase' }}>
                  Heuristic Risk Score
                </div>
                <div
                  className="verdict-score"
                  id="display-score"
                  style={{ color: verdictClass === 'badge-safe' ? 'var(--emerald)' : verdictClass === 'badge-warning' ? '#f59e0b' : '#ff6b6b' }}
                >
                  {score}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 2 }}>{summary}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge-sev ${verdictClass}`}>{confidence}</span>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>{analysisReference}</div>
              </div>
            </div>

            {/* 3 Pillars Breakdown */}
            <div className="score-row">
              <div className="score-meta">
                <span>1. Linguistic Coercion &amp; Psychological Pressure</span>
                <strong>{bars[0]}%</strong>
              </div>
              <div className="score-track">
                <div
                  className="score-fill"
                  style={{
                    width: `${bars[0]}%`,
                    background: bars[0] > 70 ? '#ef4444' : bars[0] > 30 ? '#f59e0b' : 'var(--emerald)',
                  }}
                />
              </div>
            </div>

            <div className="score-row">
              <div className="score-meta">
                <span>2. Blacklist IOC &amp; Threat Intelligence Matching</span>
                <strong>{bars[1]}%</strong>
              </div>
              <div className="score-track">
                <div
                  className="score-fill"
                  style={{
                    width: `${bars[1]}%`,
                    background: bars[1] > 70 ? '#ef4444' : bars[1] > 30 ? '#f59e0b' : 'var(--emerald)',
                  }}
                />
              </div>
            </div>

            <div className="score-row">
              <div className="score-meta">
                <span>3. Domain &amp; Channel Authenticity Verification</span>
                <strong>{bars[2]}%</strong>
              </div>
              <div className="score-track">
                <div
                  className="score-fill"
                  style={{
                    width: `${bars[2]}%`,
                    background: bars[2] > 70 ? '#ef4444' : bars[2] > 30 ? '#f59e0b' : 'var(--emerald)',
                  }}
                />
              </div>
            </div>

            {/* AI Recommendation Alert Box */}
            {aiRecommendation && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  marginTop: 14,
                }}
              >
                <div
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: '#60a5fa',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>คำแนะนำจากระบบวิเคราะห์:</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>
                  {aiRecommendation}
                </div>
              </div>
            )}

            {/* Extracted Semantic Evidence & Tactics */}
            {aiEvidence.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <span className="form-label">
                  Detected Coercion Tactics &amp; Semantic Evidence ({aiEvidence.length}):
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {aiEvidence.map((ev, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#090d16',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 10px',
                        fontSize: 11.5,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span className="code-tag" style={{ color: '#ff6b6b' }}>"{ev.quote}"</span>
                        <span className="badge-sev badge-critical" style={{ fontSize: 9.5 }}>
                          {ev.tactic.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg-secondary)', marginTop: 2 }}>
                        {ev.explanation}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extracted IOCs Table */}
            <div style={{ marginTop: 16 }}>
              <span className="form-label">Extracted Indicators of Compromise (IOCs):</span>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Indicator Value</th>
                    <th>Threat Intel</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {iocs.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--fg-muted)', textAlign: 'center' }}>
                        ไม่พบ URL, เบอร์โทร หรือข้อมูลบ่งชี้จากผลวิเคราะห์นี้
                      </td>
                    </tr>
                  ) : (
                    iocs.map((ioc, idx) => (
                      <tr key={`${ioc.type}-${ioc.val}-${idx}`}>
                        <td>{ioc.type}</td>
                        <td>
                          <span className="code-tag">{ioc.val}</span>
                        </td>
                        <td>
                          <span className={`badge-sev ${ioc.statusClass}`}>{ioc.status}</span>
                        </td>
                        <td>
                          <button type="button" className="btn-copy" onClick={() => copyToClipboard(ioc.val)}>
                            Copy
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Immediate Countermeasure Checklist */}
            {riskScoreValue >= 25 && <div
              style={{
                background: '#090d16',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: 12,
                marginTop: 14,
              }}
            >
              <div
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#ff6b6b',
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Immediate Countermeasure Checklist:
              </div>
              <ul style={{ fontSize: 11, color: 'var(--fg-secondary)', paddingLeft: 18, lineHeight: 1.6 }}>
                <li>หยุดการสนทนาหรือธุรกรรมไว้ก่อน แล้วตรวจสอบผ่านช่องทางทางการที่ค้นหาเอง</li>
                <li>อย่าเปิดเผย OTP, PIN หรือโอนเงินตามคำขอในข้อความหรือสายที่ยังยืนยันไม่ได้</li>
                <li>เก็บหลักฐานและตรวจทานรายงานใน Incident Dossier ก่อนตัดสินใจแชร์ข้อมูล</li>
              </ul>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
};
