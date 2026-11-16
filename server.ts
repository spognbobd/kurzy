import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_MODEL = 'gemini-4-hydrogen';

interface TicketLegInput {
  matchId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  recommendedPick: string;
  marketLabel: string;
  betanoOdds: number;
  marketAvgOdds?: number;
  aiProbability: number;
  valueScore: number;
  formHome?: string[];
  formAway?: string[];
  h2hSummary?: string;
}

interface ReasoningItem {
  matchId: string;
  reasoning: string;
}

function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractJsonObject(rawText: string): { reasons?: ReasoningItem[] } | null {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as { reasons?: ReasoningItem[] };
  } catch {
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx >= 0 && endIdx > startIdx) {
      try {
        return JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as { reasons?: ReasoningItem[] };
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildReasoningPrompt(legs: TicketLegInput[]): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  const serializedLegs = legs.map((leg) => ({
    matchId: leg.matchId,
    sport: leg.sport,
    soutez: leg.league,
    zapas: `${leg.homeTeam} vs. ${leg.awayTeam}`,
    domaci: leg.homeTeam,
    hoste: leg.awayTeam,
    casVykonu: leg.kickoffTime,
    doporucenyTip: leg.recommendedPick,
    trh: leg.marketLabel,
    kurzBetano: leg.betanoOdds,
    prumernyKurzTrhu: leg.marketAvgOdds ?? leg.betanoOdds,
    aiPravdepodobnostPct: leg.aiProbability,
    valuePct: leg.valueScore,
    formaDomaciPoslednich5: leg.formHome?.join('-') ?? 'neuvedena',
    formaHostePoslednich5: leg.formAway?.join('-') ?? 'neuvedena',
    vzajemnaBilance: leg.h2hSummary ?? 'neuvedena',
  }));

  return [
    `Dnešní datum: ${todayIso}.`,
    `Níže jsou vybrané zápasy z vygenerovaného tiketu. Ke KAŽDÉMU zápasu napiš přesně 2 až 3 stručné, věcné české věty bez obecné omáčky, proč má doporučený tip vyjít.`,
    `U každého zápasu zhodnoť všechny 4 body:`,
    `1) aktuální formu obou soupeřů,`,
    `2) klíčové absence nebo zranění (pokud jsou dostupné aktuální zprávy, uveď konkrétní jména nebo potvrď plnou sestavu / bez hlášených absencí),`,
    `3) výhodu domácího prostředí (u tenisu/MMA uveď kurt, povrch nebo stylovou výhodu),`,
    `4) proč kurz ${serializedLegs.map((l) => l.kurzBetano).join('/')} na Betanu nabízí hodnotu (Value) oproti průměru trhu a pravděpodobnosti modelu.`,
    `Vrať VÝHRADNĚ validní JSON objekt ve tvaru {"reasons":[{"matchId":"...","reasoning":"..."}]} bez markdownu a dalšího textu.`,
    `Zápasy: ${JSON.stringify(serializedLegs)}`,
  ].join('\n\n');
}

const SYSTEM_INSTRUCTION =
  'Jsi elitní sportovní analytik pro české sázkaře. Píšeš výhradně česky, maximálně věcně, konkrétně a bez klišé. Ke každému zápasu napiš přesně 2 až 3 hutné věty pokrývající formu obou stran, absence/zranění, domácí prostředí (nebo prostředí/povrch) a matematickou hodnotu kurzu (Value). Nikdy nepoužívej odrážky ani nadpisy uvnitř pole reasoning.';

async function generateReasonsWithGemini(legs: TicketLegInput[]): Promise<{
  reasons: Record<string, string>;
  grounded: boolean;
}> {
  const ai = createGeminiClient();
  const prompt = buildReasoningPrompt(legs);

  // Primary call: Gemini 4 Hydrogen with Google Search grounding for real-time form & injuries
  try {
    const groundedResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const parsed = extractJsonObject(groundedResponse.text ?? '');
    if (parsed && Array.isArray(parsed.reasons) && parsed.reasons.length > 0) {
      const mapped: Record<string, string> = {};
      for (const item of parsed.reasons) {
        if (item && typeof item.matchId === 'string' && typeof item.reasoning === 'string' && item.reasoning.trim()) {
          mapped[item.matchId] = item.reasoning.trim();
        }
      }
      if (Object.keys(mapped).length > 0) {
        return { reasons: mapped, grounded: true };
      }
    }
  } catch (err) {
    // Re-throw auth/key/quota errors immediately; fall back to structured JSON if tool use fails
    const status = (err as { status?: number })?.status;
    const msg = err instanceof Error ? err.message : String(err);
    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      msg.includes('API_KEY_INVALID') ||
      msg.includes('PERMISSION_DENIED')
    ) {
      throw err;
    }
  }

  // Fallback structured JSON call without search tool
  const structuredResponse = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reasons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                matchId: { type: Type.STRING },
                reasoning: { type: Type.STRING },
              },
              required: ['matchId', 'reasoning'],
            },
          },
        },
        required: ['reasons'],
      },
    },
  });

  const parsedFallback = extractJsonObject(structuredResponse.text ?? '');
  const mappedFallback: Record<string, string> = {};
  if (parsedFallback && Array.isArray(parsedFallback.reasons)) {
    for (const item of parsedFallback.reasons) {
      if (item && typeof item.matchId === 'string' && typeof item.reasoning === 'string' && item.reasoning.trim()) {
        mappedFallback[item.matchId] = item.reasoning.trim();
      }
    }
  }
  return { reasons: mappedFallback, grounded: false };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/gemini/ticket-reasoning', async (req: Request, res: Response) => {
    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({
        error: 'Chybí klíč GEMINI_API_KEY na serveru. Zkontrolujte panel Settings > Secrets.',
      });
      return;
    }

    const body = req.body as { legs?: TicketLegInput[] } | undefined;
    const legs = body?.legs;
    if (!Array.isArray(legs) || legs.length === 0 || legs.length > 8) {
      res.status(400).json({ error: 'Neplatný seznam zápasů pro analýzu Gemini AI.' });
      return;
    }

    try {
      const result = await generateReasonsWithGemini(legs);
      res.json({
        reasons: result.reasons,
        grounded: result.grounded,
        model: GEMINI_MODEL,
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const message = err instanceof Error ? err.message : 'Neznámá chyba Gemini API.';
      if (
        status === 400 ||
        status === 401 ||
        status === 403 ||
        message.includes('API_KEY_INVALID') ||
        message.includes('PERMISSION_DENIED')
      ) {
        res.status(403).json({
          error: 'Neplatný nebo nepovolený GEMINI_API_KEY. Zkontrolujte klíč v panelu Settings > Secrets.',
        });
        return;
      }
      if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Dočasně vyčerpána kvóta Gemini API. Zkuste analýzu obnovit za okamžik.',
        });
        return;
      }
      res.status(500).json({
        error: `Gemini AI analýza selhala: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BetEdge AI server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
