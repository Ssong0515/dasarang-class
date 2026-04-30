import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';

const DEFAULT_MODEL = 'gemini-2.0-flash';

export interface GenerateDescriptionPayload {
  title: string;
  text?: string;
  slideUrl?: string;
  driveAccessToken?: string;
}

export const validateGenerateDescriptionPayload = (body: unknown): GenerateDescriptionPayload => {
  const payload = body as Record<string, unknown>;
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const text = typeof payload?.text === 'string' ? payload.text.trim() : undefined;
  const slideUrl = typeof payload?.slideUrl === 'string' ? payload.slideUrl.trim() : undefined;
  const driveAccessToken =
    typeof payload?.driveAccessToken === 'string' ? payload.driveAccessToken.trim() : undefined;

  if (!title) throw new Error('title is required.');
  if (!text && !slideUrl) throw new Error('Either text or slideUrl is required.');
  if (slideUrl && !driveAccessToken) throw new Error('driveAccessToken is required when slideUrl is provided.');

  return { title, text, slideUrl, driveAccessToken };
};

const extractPresentationId = (slideUrl: string): string | null => {
  const match = slideUrl.match(/\/presentation\/d\/([^/?#]+)/);
  return match?.[1] ?? null;
};

const extractSlidesText = async (accessToken: string, presentationId: string): Promise<string> => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const slidesClient = google.slides({ version: 'v1', auth });
  const response = await slidesClient.presentations.get({ presentationId });

  const lines: string[] = [];
  for (const slide of response.data.slides || []) {
    for (const element of slide.pageElements || []) {
      const textElements = element.shape?.text?.textElements || [];
      const text = textElements
        .map((te) => te.textRun?.content || '')
        .join('')
        .trim();
      if (text) lines.push(text);
    }
  }
  return lines.join('\n').trim();
};

const generateWithGemini = async (text: string, title: string): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const model = process.env.GEMINI_CLASS_NOTE_MODEL?.trim() || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const truncated = text.slice(0, 4000);

  const prompt = `다음은 "${title}" 수업 자료의 내용입니다. 이 내용을 바탕으로 수업 내용을 간결하게 요약해주세요.

요구사항:
- 한국어로 작성
- 3문장 이내
- 수업의 주요 내용과 학습 목표를 포함
- 간결하고 명확하게
- 마크다운 없이 일반 텍스트로만

내용:
${truncated}`;

  const response = await ai.models.generateContent({ model, contents: prompt });
  const result = response.text?.trim();
  if (!result) throw new Error('Gemini returned an empty response.');
  return result;
};

export const generateDescriptionFromContent = async (
  payload: GenerateDescriptionPayload
): Promise<string> => {
  let text = payload.text ?? '';

  if (payload.slideUrl && payload.driveAccessToken) {
    const presentationId = extractPresentationId(payload.slideUrl);
    if (!presentationId) throw new Error('Invalid slideUrl: could not extract presentation ID.');
    text = await extractSlidesText(payload.driveAccessToken, presentationId);
    if (!text) throw new Error('슬라이드에서 텍스트를 추출할 수 없습니다. 슬라이드에 텍스트가 없거나 접근 권한이 없습니다.');
  }

  if (!text.trim()) throw new Error('요약할 내용을 찾을 수 없습니다.');

  return generateWithGemini(text, payload.title);
};
