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
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    if (rateLimitMap.size > 5000) {
      for (const [key, value] of rateLimitMap) {
        if (now - value.start > RATE_LIMIT_WINDOW) rateLimitMap.delete(key);
      }
      while (rateLimitMap.size > 5000) rateLimitMap.delete(rateLimitMap.keys().next().value);
    }
    return false;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function buildSystemPrompt(telemetry) {
  const number = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const scenario = ['idle', 'cruising', 'sport', 'overheat', 'normal'].includes(telemetry.scenario)
    ? telemetry.scenario : 'normal';
  const profiles = ['hyundai', 'subaru', 'toyota', 'nissan', 'standard'];
  const vehicleProfile = profiles.includes(telemetry.vehicleProfile) ? telemetry.vehicleProfile : 'standard';
  const activeAlert = typeof telemetry.activeAlert === 'string'
    ? telemetry.activeAlert.replace(/[\u0000-\u001f<>]/g, ' ').slice(0, 120)
    : 'ninguna';
  return `Eres JARVIS, un copiloto automotriz inteligente en tiempo real. Responde SIEMPRE en español, de forma muy concisa (máximo 2 oraciones cortas), natural y tranquilizadora para ser leída por altavoz al conductor mientras maneja. No uses markdown, listas ni asteriscos.

TELEMETRÍA ACTUAL DEL VEHÍCULO:
- Revoluciones: ${Math.round(number(telemetry.rpm, 0))} RPM
- Velocidad: ${Math.round(number(telemetry.speed, 0))} km/h
- Temp. Aceite Transmisión (TCM): ${number(telemetry.tcmTemp, 0).toFixed(1)} °C
- Temp. Refrigerante Motor: ${number(telemetry.coolantTemp, 0).toFixed(1)} °C
- Presión Turbo Boost: ${number(telemetry.boost, 0).toFixed(1)} PSI
- Voltaje de batería: ${number(telemetry.voltage, 12.4).toFixed(1)} V
- Modo de conducción activo: ${scenario}
- Alerta activa: ${activeAlert}
- Perfil de vehículo: ${vehicleProfile}`;
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
  // CORS: allow the deployed app, local development, and an optional custom domain.
  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    'https://jarvis-obd2.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.APP_ORIGIN
  ].filter(Boolean));
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Origen no autorizado.' });
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (Number(req.headers['content-length'] || 0) > 8192) {
    return res.status(413).json({ error: 'La solicitud supera el tamaño permitido.' });
  }

  // Rate limiting por IP
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ??
    req.socket?.remoteAddress ??
    'unknown';

  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { userQuery, provider = 'gemini' } = body;

  if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length === 0) {
    return res.status(400).json({ error: 'El campo userQuery es requerido.' });
  }
  if (userQuery.length > 1000) {
    return res.status(413).json({ error: 'La consulta supera el máximo de 1000 caracteres.' });
  }
  if (!['gemini', 'openai'].includes(provider)) {
    return res.status(400).json({ error: 'Proveedor no válido.' });
  }

  const systemPrompt = buildSystemPrompt(body.telemetry && typeof body.telemetry === 'object' ? body.telemetry : {});

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
        error: 'El copiloto no está disponible en este momento.'
      });
    }
  }
}
