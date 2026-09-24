export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { userQuery, telemetry } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });
  }

  const systemPrompt = `Eres un copiloto automotriz inteligente en tiempo real. Responde de forma muy concisa (máximo 2 oraciones) y natural para ser leída por altavoz al conductor mientras maneja.
TELEMETRÍA ACTUAL DEL VEHÍCULO:
- Revoluciones: ${Math.round(telemetry?.rpm || 0)} RPM
- Velocidad: ${Math.round(telemetry?.speed || 0)} km/h
- Temp. Aceite Transmisión (TCM): ${Number(telemetry?.tcmTemp || 0).toFixed(1)} °C
- Temp. Refrigerante Motor: ${Number(telemetry?.coolantTemp || 0).toFixed(1)} °C
- Presión Turbo Boost: ${Number(telemetry?.boost || 0).toFixed(1)} PSI
- Modo de conducción: ${telemetry?.scenario || 'normal'}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userQuery }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      }
    );

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Todo opera en rangos normales.";
    
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Error en Copilot API Proxy:", error);
    return res.status(500).json({ error: 'Error comunicando con la IA del Copiloto' });
  }
}