// ============================================
// Max AI - Server Backend (Node.js + Express)
// ============================================
// Mendukung 3 mode:
//   - Creative: ChatGPT, temperature tinggi
//   - Precise: ChatGPT, temperature rendah
//   - Fast: Gemini Flash, respons cepat
// Dengan fallback otomatis antar provider.
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Middleware
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// API Keys
// ============================================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================
// Mode Configurations
// ============================================
const MODE_CONFIG = {
    creative: {
        label: 'Creative',
        primary: 'openai',           // Provider utama
        temperature: 0.95,           // Tinggi = lebih kreatif
        maxTokens: 3000,
        systemPrompt: 'Kamu adalah Max AI, asisten AI yang sangat kreatif dan imajinatif. Jawab dengan gaya yang menarik, ekspresif, dan penuh kreativitas. Gunakan metafora, analogi, dan bahasa yang hidup. Jawab dalam bahasa yang sama dengan pertanyaan user.'
    },
    precise: {
        label: 'Precise',
        primary: 'openai',           // Provider utama
        temperature: 0.3,            // Rendah = lebih akurat
        maxTokens: 2048,
        systemPrompt: 'Kamu adalah Max AI, asisten AI yang sangat presisi dan analitis. Berikan jawaban yang akurat, terstruktur, dan berbasis fakta. Gunakan poin-poin, data, dan penjelasan yang jelas. Jawab dalam bahasa yang sama dengan pertanyaan user.'
    },
    fast: {
        label: 'Fast',
        primary: 'gemini',           // Gemini = lebih cepat
        temperature: 0.5,
        maxTokens: 1500,
        systemPrompt: 'Kamu adalah Max AI, asisten AI yang cepat dan efisien. Berikan jawaban yang ringkas, langsung ke inti, dan mudah dipahami. Hindari penjelasan bertele-tele. Jawab dalam bahasa yang sama dengan pertanyaan user.'
    }
};

// ============================================
// Helper: Panggil ChatGPT (OpenAI)
// ============================================
async function callChatGPT(message, config) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: config.systemPrompt },
                { role: 'user', content: message }
            ],
            max_tokens: config.maxTokens,
            temperature: config.temperature
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`ChatGPT Error: ${response.status} - ${err.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return {
        reply: data.choices[0].message.content,
        model: 'GPT-4o Mini',
        provider: 'openai'
    };
}

// ============================================
// Helper: Panggil Gemini (Google)
// ============================================
async function callGemini(message, config) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: message }] }],
                systemInstruction: { parts: [{ text: config.systemPrompt }] },
                generationConfig: {
                    maxOutputTokens: config.maxTokens,
                    temperature: config.temperature
                }
            })
        }
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Gemini Error: ${response.status} - ${err.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('Gemini returned empty response');

    return {
        reply,
        model: 'Gemini 2.0 Flash',
        provider: 'gemini'
    };
}

// ============================================
// Fallback System
// ============================================
async function callWithFallback(message, config) {
    const isPrimaryOpenAI = config.primary === 'openai';
    const primaryFn = isPrimaryOpenAI ? callChatGPT : callGemini;
    const fallbackFn = isPrimaryOpenAI ? callGemini : callChatGPT;
    const primaryName = isPrimaryOpenAI ? 'ChatGPT' : 'Gemini';
    const fallbackName = isPrimaryOpenAI ? 'Gemini' : 'ChatGPT';

    try {
        return await primaryFn(message, config);
    } catch (primaryErr) {
        console.error(`⚠️ ${primaryName} gagal:`, primaryErr.message);
        try {
            console.log(`🔄 Fallback ke ${fallbackName}...`);
            const result = await fallbackFn(message, config);
            result.fallback = true;
            result.originalProvider = primaryName;
            return result;
        } catch (fallbackErr) {
            console.error(`❌ ${fallbackName} juga gagal:`, fallbackErr.message);
            throw new Error(`Kedua API gagal. ${primaryName}: ${primaryErr.message}. ${fallbackName}: ${fallbackErr.message}`);
        }
    }
}

// ============================================
// ENDPOINT: POST /api/chat
// Body: { message, mode }
// mode: "creative" | "precise" | "fast"
// ============================================
app.post('/api/chat', async (req, res) => {
    try {
        const { message, mode } = req.body;

        // Validasi: Pesan tidak boleh kosong
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Pesan tidak boleh kosong.', code: 'EMPTY_MESSAGE' });
        }

        // Validasi: Panjang pesan
        if (message.trim().length > 10000) {
            return res.status(400).json({ success: false, error: 'Pesan terlalu panjang (maks 10.000 karakter).', code: 'MESSAGE_TOO_LONG' });
        }

        const cleanMessage = message.trim();
        const selectedMode = (mode || 'precise').toLowerCase();

        // Validasi: Mode valid
        if (!MODE_CONFIG[selectedMode]) {
            return res.status(400).json({
                success: false,
                error: `Mode tidak valid. Pilihan: ${Object.keys(MODE_CONFIG).join(', ')}`,
                code: 'INVALID_MODE'
            });
        }

        const config = MODE_CONFIG[selectedMode];
        console.log(`📩 [${config.label}] "${cleanMessage.substring(0, 80)}..."`);

        const result = await callWithFallback(cleanMessage, config);

        console.log(`✅ Response: ${result.model}${result.fallback ? ' (fallback)' : ''}`);

        return res.json({
            success: true,
            reply: result.reply,
            model: result.model,
            provider: result.provider,
            mode: selectedMode,
            fallback: result.fallback || false,
            originalProvider: result.originalProvider || null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Gagal mendapatkan response dari AI. Coba lagi.',
            details: error.message,
            code: 'API_ERROR'
        });
    }
});

// ============================================
// ENDPOINT: GET /api/status
// ============================================
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        server: 'Max AI Backend',
        version: '2.0.0',
        modes: Object.keys(MODE_CONFIG),
        apis: {
            openai: OPENAI_API_KEY && OPENAI_API_KEY !== 'sk-your-openai-api-key-here' ? 'configured' : 'not configured',
            gemini: GEMINI_API_KEY && GEMINI_API_KEY !== 'your-gemini-api-key-here' ? 'configured' : 'not configured'
        },
        timestamp: new Date().toISOString()
    });
});

// Fallback route → index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// Start Server (hanya jalan di lokal, bukan Vercel)
// ============================================
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔═══════════════════════════════════════════╗');
        console.log('║         🤖 Max AI Server v2.0             ║');
        console.log('╠═══════════════════════════════════════════╣');
        console.log(`║  🌐 http://localhost:${PORT}                  ║`);
        console.log('╠═══════════════════════════════════════════╣');
        console.log(`║  OpenAI : ${OPENAI_API_KEY && OPENAI_API_KEY !== 'sk-your-openai-api-key-here' ? '✅ OK' : '❌ Not set'}                       ║`);
        console.log(`║  Gemini : ${GEMINI_API_KEY && GEMINI_API_KEY !== 'your-gemini-api-key-here' ? '✅ OK' : '❌ Not set'}                       ║`);
        console.log('╠═══════════════════════════════════════════╣');
        console.log('║  Modes: Creative | Precise | Fast         ║');
        console.log('╚═══════════════════════════════════════════╝');
        console.log('');
    });
}

// Export untuk Vercel Serverless
module.exports = app;
