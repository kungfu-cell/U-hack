export interface ImageFileInput {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ImageOcrResult {
  text: string;
  provider: string;
}

export interface ImageOcrProvider {
  extractText(input: ImageFileInput): Promise<ImageOcrResult>;
}

export class DemoImageOcrProvider implements ImageOcrProvider {
  async extractText(input: ImageFileInput): Promise<ImageOcrResult> {
    const lowerName = input.fileName.toLowerCase();
    if (lowerName.includes('warrant') || lowerName.includes('police') || lowerName.includes('หมายจับ')) {
      return {
        text: 'สำนักงานตำรวจแห่งชาติ (หมายจับ) • ข้อหาฟอกเงินยาเสพติด • คำสั่งให้อายัดทรัพย์สินและโอนเงินตรวจสอบบัญชีกลาง ปปง. (นายวิชัย ภักดี) เลขที่บัญชี 984-2-90184-1',
        provider: 'demo_ocr_warrant',
      };
    }
    return {
      text: `[OCR ภาพถ่าย: ${input.fileName}] ตรวจพบเอกสารต้องสงสัย มีการอ้างถึงการโอนเงินเพื่อตรวจสอบความบริสุทธิ์`,
      provider: 'demo_ocr_generic',
    };
  }
}

export class OpenAIImageOcrProvider implements ImageOcrProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'gpt-4o-mini',
  ) {}

  async extractText(input: ImageFileInput): Promise<ImageOcrResult> {
    const base64Data = Buffer.from(input.bytes).toString('base64');
    const dataUrl = `data:${input.mimeType};base64,${base64Data}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert OCR and fraud detection transcription system. Extract ALL readable text from this image faithfully and accurately, especially Thai and English text, bank account numbers, phone numbers, URLs, official authority claims, and names. Output only the extracted text with no extraneous commentary.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract and transcribe all text from this image accurately:',
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const err = (await response.text()).slice(0, 300);
      throw new Error(`OPENAI_OCR_FAILED:${response.status}:${err}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      throw new Error('OPENAI_OCR_EMPTY_RESULT');
    }

    return {
      text,
      provider: `openai_vision_${this.model}`,
    };
  }
}
