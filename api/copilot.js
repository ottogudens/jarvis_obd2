/**
 * api/copilot.js — Serverless Proxy para Copiloto IA OBD2
 * Soporta: Gemini (google) y OpenAI (openai)
 * Requiere env vars: GEMINI_API_KEY, OPENAI_API_KEY
 */

// Rate limiting en memoria (se resetea por cold-start de Vercel)
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 15;   // llamadas por ventana
const RATE_LIMIT_WINDOW = 60_000; // 60 segundos

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function buildSystemPrompt(telemetry) {
  return `Eres JARVIS, un copiloto automotriz inteligente en tiempo real. Responde SIEMPRE en español, de forma muy concisa (máximo 2 oraciones cortas), natural y tranquilizadora para ser leída por altavoz al conductor mientras maneja. No uses markdown, listas ni asteriscos.

TELEMETRÍA ACTUAL DEL VEHÍCULO:
- Revoluciones: ${Math.round(telemetry?.rpm ?? 0)} RPM
- Velocidad: ${Math.round(telemetry?.speed ?? 0)} km/h
- Temp. Aceite Transmisión (TCM): ${Number(telemetry?.tcmTemp ?? 0).toFixed(1)} °C
- Temp. Refrigerante Motor: ${Number(telemetry?.coolantTemp ?? 0).toFixed(1)} °C
- Presión Turbo Boost: ${Number(telemetry?.boost ?? 0).toFixed(1)} PSI
- Voltaje de batería: ${Number(telemetry?.voltage ?? 12.4).toFixed(1)} V
- Modo de conducción activo: ${telemetry?.scenario ?? 'normal'}
- Alerta activa: ${telemetry?.activeAlert ?? 'ninguna'}
- Perfil de vehículo: ${telemetry?.vehicleProfile ?? 'Estándar OBD-II'}`;
}

// ─── Gemini Handler ──────────────────────────────────────────────────────────
async function callGemini(userQuery, systemPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada en el servidor.');

  const model = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        maxOutputTokens: 120,
        temperature: 0.7,
        topP: 0.9
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
    'Todo opera en rangos normales.'
  );
}

// ─── OpenAI Handler ──────────────────────────────────────────────────────────
async function callOpenAI(userQuery, systemPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada en el servidor.');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userQuery }
      ],
      max_tokens: 120,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return (
    data.choices?.[0]?.message?.content?.trim() ??
    'Todo opera en rangos normales.'
  );
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Rate limiting por IP
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ??
    req.socket?.remoteAddress ??
    'unknown';

  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento.' });
  }

  const { userQuery, telemetry, provider = 'gemini' } = req.body;

  if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length === 0) {
    return res.status(400).json({ error: 'El campo userQuery es requerido.' });
  }

  const systemPrompt = buildSystemPrompt(telemetry);

  try {
    let reply;

    if (provider === 'openai') {
      reply = await callOpenAI(userQuery.trim(), systemPrompt);
    } else {
      // Default: Gemini
      reply = await callGemini(userQuery.trim(), systemPrompt);
    }

    return res.status(200).json({ reply, provider });

  } catch (error) {
    console.error(`[Copilot Proxy] Error con proveedor "${provider}":`, error.message);

    // Si un proveedor falla, intentar fallback al otro
    try {
      let fallbackReply;
      if (provider === 'openai') {
        console.warn('[Copilot Proxy] Fallback a Gemini...');
        fallbackReply = await callGemini(userQuery.trim(), systemPrompt);
        return res.status(200).json({ reply: fallbackReply, provider: 'gemini', fallback: true });
      } else {
        console.warn('[Copilot Proxy] Fallback a OpenAI...');
        fallbackReply = await callOpenAI(userQuery.trim(), systemPrompt);
        return res.status(200).json({ reply: fallbackReply, provider: 'openai', fallback: true });
      }
    } catch (fallbackError) {
      console.error('[Copilot Proxy] Fallback también falló:', fallbackError.message);
      return res.status(500).json({
        error: 'El copiloto no está disponible en este momento.',
        detail: error.message
      });
    }
  }
}