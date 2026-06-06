import { OpenAI } from 'openai';

export function getOpenAIClient(req: Request): OpenAI {
  const customKey = req.headers.get('x-openai-api-key') || undefined;
  
  // Use custom header key if provided, otherwise default to env variable
  const apiKey = customKey || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'AI Engine API Key is missing. Please configure it in the dashboard settings panel or add OPENAI_API_KEY to your environment variables.'
    );
  }
  
  return new OpenAI({ apiKey });
}
