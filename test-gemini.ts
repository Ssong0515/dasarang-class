import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

async function test() {
  try {
    console.log('Testing generateContent with user env key and model...');
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('Key length:', apiKey?.length);
    const ai = new GoogleGenAI({ apiKey });
    
    // Test the specific model from env or fallback
    const model = process.env.GEMINI_CLASS_NOTE_MODEL || 'gemini-3-flash-preview';
    console.log('Model:', model);
    
    const response = await ai.models.generateContent({
      model: model,
      contents: 'Hello',
    });
    console.log('Success:', response.text);
  } catch (err: any) {
    console.error('Error string:', String(err));
  }
}
test();
