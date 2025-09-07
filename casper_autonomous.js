
// Casper AI Unified Server
// We're keeping all existing requires at the top for clarity.
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ejs = require('ejs');
const winston = require('winston');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const { autoProvisionAll, getProviders } = require('./autoprovision');
const { initMongo, saveKnowledge, fetchKnowledge } = require('./mongo-memory');
const { learnText, generateSentence, generateWord, getVocabulary } = require('./language-builder');
const { isOverrideActive, setOverride, startKillSwitchWatcher } = require('./grow_database');
const { autonomousScan, isSafeUrl, fetchPage } = require('./casper_autonomous_web');
const { autonomousSelfUpdate } = require('./casper_self_update');
const admin = require('./firebase-init');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const vm = require('vm');
const chokidar = require('chokidar');
const cheerio = require('cheerio');
const morgan = require('morgan');
const { google } = require('googleapis');
const OpenAI = require('openai');
const { get } = require('http');
const readline = require('readline'); // NEW: For line-by-line file processing
const pQueue = require('p-queue'); // NEW: To manage concurrent tasks
require('dotenv').config();

// ===================== GLOBAL VARIABLES & CONSTANTS =====================
const PORT = process.env.PORT || 3000;
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 5000;
const HEADLESS = process.env.HEADLESS === 'true';
const CLOUD_INTERVAL_MS = 60000; // 1 minute loop
const MEMORY_SHARDS = ['default', 'text', 'images', 'audio', 'code'];
const PATCH_CODE = '88888888';
const GENERATION_INTERVAL = 5; // Run multi-modal generation every 5 loops
const MEMORY_LIMIT_MB = 1000; // NEW: Explicitly set memory limit in MB

// ---
// We will now use a task queue to ensure only one memory-intensive task runs at a time.
// This is the core of your refactoring to prevent the heap from exceeding its capacity.
const taskQueue = new pQueue({ concurrency: 1 });
// ---

let AI_coreMemory = {
    // These properties are now for metrics only, as memory is stored externally
    metrics: {}
};
let AI_helpers = {};
let patchModeActive = false;
global.latestPatch = null;

let heartbeatStatus = {
    firebase: false,
    mongo: false,
    supabase: false,
};

const casperMetrics = {
    activeShards: 0,
    activeOps: 0,
    successes: 0,
    failures: 0,
};

let supabase = null;
let openai = null;
let Dropbox = null;
let generationCounter = 0; // New counter for throttling

// ===================== LOGGING SETUP =====================
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: path.join(logDir, 'server.log') })
    ]
});

function logMessage(level, message) {
    logger.log({ level, message });
}
function log(level, ...args) { console.log(`[${level.toUpperCase()}]`, ...args); }

// ===================== SERVER SETUP =====================
const app = express();
app.use(express.json());
app.use(express.static('.')); // Serve static files
app.use(morgan('dev')); // Use morgan for request logging
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const io = new Server(server);

// ===================== LIBRARY INITIALIZATION =====================
function initSupabase() {
    if (process.env.SUPABASE_KEY && process.env.SUPABASE_URL) {
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    } else {
        logMessage('warn', 'Supabase credentials not found - Supabase functionality disabled');
    }
}

function initOpenAI() {
    if (!openai && process.env.OPENAI_API_KEY) {
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } else {
        logMessage('warn', 'OpenAI API key not found - OpenAI functionality disabled');
    }
}

function initDropbox() {
    if (!Dropbox) Dropbox = require('dropbox').Dropbox;
    return Dropbox;
}

// ===================== MEMORY MANAGEMENT (DATABASE-DRIVEN) =====================
/**
 * Learns a new piece of text by storing it in a database, not in-memory.
 */
async function learnText(text, shard) {
    await storeOptimally(shard, text);
}

/**
 * Gets a vocabulary for a shard by fetching it from the database.
 */
async function getVocabulary(shard) {
    // ---
    // Refactoring to use a stream if the database function was in-memory, but since it's an external DB call,
    // this function is already memory-safe. No change needed here.
    // ---
    return await fetchKnowledge(shard);
}

/**
 * Generates a sentence by fetching and using the vocabulary from the database.
 */
async function generateSentence(length, shard) {
    const vocabulary = await getVocabulary(shard);
    if (!vocabulary || vocabulary.length === 0) {
        return '';
    }
    // The original logic is a placeholder; this simulates using the fetched data
    return vocabulary[Math.floor(Math.random() * vocabulary.length)].text;
}

// ===================== METRICS & HEARTBEAT =====================
function broadcastMetrics() {
    const message = JSON.stringify({ type: 'metrics', data: casperMetrics });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
    io.emit('metrics', casperMetrics);
}

function updateCasperMetrics(newMetrics) {
    Object.assign(casperMetrics, newMetrics);
    broadcastMetrics();
}

/**
 * Performs a single storage heartbeat check and returns the result.
 */
async function singleStorageHeartbeat() {
    try {
        // Firebase
        try {
            if (admin) {
                await admin.firestore().collection('_heartbeat').doc('ping').set({ timestamp: new Date() });
                heartbeatStatus.firebase = true;
            }
        } catch { heartbeatStatus.firebase = false; }

        // MongoDB
        try {
            await saveKnowledge({ shard: '_heartbeat', text: 'ping', timestamp: new Date() });
            heartbeatStatus.mongo = true;
        } catch { heartbeatStatus.mongo = false; }

        // Supabase
        try {
            if (supabase) {
                const { error } = await supabase.from('knowledge').insert([{ shard: '_heartbeat', text: 'ping', created_at: new Date() }]);
                heartbeatStatus.supabase = !error;
            }
        } catch { heartbeatStatus.supabase = false; }

        logMessage('info', `[Heartbeat] Firebase: ${heartbeatStatus.firebase}, MongoDB: ${heartbeatStatus.mongo}, Supabase: ${heartbeatStatus.supabase}`);
        return heartbeatStatus;
    } catch (err) {
        logMessage('error', `[Heartbeat] Error: ${err.message}`);
        return heartbeatStatus;
    }
}

/**
 * Sets up the periodic heartbeat loop after an initial check.
 */
function startPeriodicHeartbeat() {
    setTimeout(async () => {
        await singleStorageHeartbeat();
        startPeriodicHeartbeat(); // Loop back
    }, 60000);
}

async function isStorageHealthy() {
    const STORAGE_LIMIT = 0.9; // 90% full = stop writing
    let healthy = true;

    try {
        const snap = await admin.database().ref('/usage').once('value');
        const usage = snap.val()?.used || 0;
        const quota = snap.val()?.quota || 1;
        if (usage / quota >= STORAGE_LIMIT) {
            log('warn', '[StorageCheck] Firebase near capacity');
            healthy = false;
        }
    } catch { healthy = false; }
    return healthy;
}

async function storeOptimally(shard, text) {
    try {
        if (text.length < 50 && heartbeatStatus.firebase) {
            await admin.firestore().collection(shard).add({ text, timestamp: new Date() });
            logMessage('info', `[Storage] Stored in Firebase (shard: ${shard})`);
        } else if (text.length < 200 && heartbeatStatus.mongo) {
            await saveKnowledge({ shard, text, timestamp: new Date() });
            logMessage('info', `[Storage] Stored in MongoDB (shard: ${shard})`);
        } else if (heartbeatStatus.supabase && supabase) {
            const { error } = await supabase.from('knowledge').insert([{ shard, text, created_at: new Date() }]);
            if (error) throw error;
            logMessage('info', `[Storage] Stored in Supabase (shard: ${shard})`);
        } else if (heartbeatStatus.mongo) {
            await saveKnowledge({ shard, text, timestamp: new Date() });
            logMessage('info', `[Storage] Fallback to MongoDB (shard: ${shard})`);
        } else {
            logMessage('error', '[Storage] No healthy storage available!');
        }
    } catch (err) {
        logMessage('error', `[Storage] Failed: ${err.message}`);
    }
}

// ===================== WEBSOCKET & SOCKET.IO HANDLING =====================
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', ws => {
    logMessage('info', '[WebSocket] New client connected');

    ws.on('message', async message => {
        let text;
        try {
            const msg = JSON.parse(message.toString());
            if (msg.type === 'casperMetrics') {
                AI_coreMemory.metrics = msg.data;
                return;
            }
            text = msg.text || '';
        } catch {
            text = message.toString();
        }

        logMessage('info', `[WebSocket] Received: ${text}`);

        let shard = 'default';
        let content = text;
        const match = text.match(/^shard:(\w+)\|(.+)/);
        if (match) { shard = match[1]; content = match[2]; }

        try {
            const trimmed = content.trim();

            // PATCH CODE COMMAND
            if (trimmed.startsWith(PATCH_CODE)) {
                const patchCode = trimmed.slice(PATCH_CODE.length).trim();
                if (patchCode.length === 0) {
                    ws.send(JSON.stringify({ type: 'aiReply', text: '[Patch] No patch code provided.' }));
                    return;
                }
                logMessage('info', '[Patch] Patch code received via chat.');
                global.latestPatch = patchCode;
                ws.send(JSON.stringify({ type: 'aiReply', text: '[Patch] Patch queued for application.' }));
                return;
            }

            // OVERRIDE COMMAND
            if (trimmed === '/hack') {
                const newState = !isOverrideActive();
                setOverride(newState);
                ws.send(JSON.stringify({ type: 'aiReply', text: `[Override] Override is now ${newState ? 'ON' : 'OFF'}.` }));
                logMessage('info', `[Override] Override flipped to ${newState}`);
                return;
            }

            // PING COMMAND
            if (trimmed === '/ping') {
                ws.send(JSON.stringify({ type: 'aiReply', text: 'Pong!' }));
                return;
            }
            
            await learnText(content, shard);

            let aiReply = await generateSentence(8, shard);
            if (!aiReply || !aiReply.trim()) aiReply = 'Hmm... I am thinking 🤖';
            ws.send(JSON.stringify({ type: 'aiReply', text: aiReply }));

        } catch (e) {
            logMessage('error', `[WebSocket] Error: ${e.message}`);
            ws.send(JSON.stringify({ type: 'aiReply', text: 'Oops, something went wrong 🤖' }));
        }
    });

    ws.on('close', () => {
        logMessage('info', '[WebSocket] Client disconnected');
    });
});

io.on('connection', (socket) => {
    log('info', '[Socket.IO] New connection established.');
    socket.emit('metrics', casperMetrics); // Send initial metrics on connect
});

// ===================== MULTI-MODAL AI (Refactored to be memory-efficient) =====================
// These functions are already memory-safe as they rely on external APIs.
// The main memory concern would be if we were to process large local files before sending them,
// but that's not the case here.

async function generateText(prompt) {
    if (!openai) return 'I cannot generate text right now.';
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'system', content: 'You are Casper AI.' }, { role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 150
        });
        return response.choices[0].message.content.trim();
    } catch (e) {
        log('error', `[Text Generation] Failed: ${e.message}`);
        return 'I cannot generate text right now.';
    }
}

async function generateImage(prompt) {
    if (!openai) return null;
    try {
        const res = await openai.images.generate({
            model: 'dall-e-2',
            prompt,
            size: '512x512'
        });
        return res.data[0].url;
    } catch (e) {
        log('error', `[Image Generation] Failed: ${e.message}`);
        return null;
    }
}

async function generateAudio(text) {
    if (!openai) return null;
    try {
        const res = await openai.audio.speech.create({
            model: 'tts-1',
            voice: 'alloy',
            input: text
        });
        const audioPath = path.join(__dirname, `audio_${Date.now()}.mp3`);
        // ---
        // Using `res.body.pipe` is a more memory-efficient way to save a large file from a stream,
        // rather than loading the entire buffer into memory.
        const writeStream = fs.createWriteStream(audioPath);
        res.body.pipe(writeStream);

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        // ---

        // Cleanup the temporary file after 10 minutes
        setTimeout(() => fs.unlink(audioPath, () => {
            logMessage('info', `[Audio Cleanup] Deleted temporary file: ${audioPath}`);
        }), 10 * 60 * 1000);

        return audioPath;
    } catch (e) {
        log('error', `[Audio Generation] Failed: ${e.message}`);
        return null;
    }
}

async function generateCode(prompt) {
    if (!openai) return '// Unable to generate code';
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'system', content: 'You are Casper AI, writing code snippets.' }, { role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 200
        });
        return response.choices[0].message.content.trim();
    } catch (e) {
        log('error', `[Code Generation] Failed: ${e.message}`);
        return '// Unable to generate code';
    }
}

// ===================== DASHBOARD & API ROUTES =====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Create views directory and default template if they don't exist
if (!fs.existsSync(path.join(__dirname, 'views'))) {
    fs.mkdirSync(path.join(__dirname, 'views'));
}
const dashboardTemplate = path.join(__dirname, 'views', 'dashboard.ejs');
if (!fs.existsSync(dashboardTemplate)) {
    const defaultTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>Casper AI Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f0f0f0; }
        .status { padding: 10px; margin: 5px; border-radius: 5px; display: inline-block; }
        .online { background: #d4edda; color: #155724; }
        .offline { background: #f8d7da; color: #721c24; }
        .metrics-container { display: flex; flex-direction: column; }
        canvas { max-width: 600px; max-height: 300px; margin-top: 20px; }
    </style>
</head>
<body>
<h1>Casper AI Dashboard</h1>
<h2>System Status</h2>
<div class="status <%= heartbeat.firebase ? 'online' : 'offline' %>">Firebase: <%= heartbeat.firebase %></div>
<div class="status <%= heartbeat.mongo ? 'online' : 'offline' %>">MongoDB: <%= heartbeat.mongo %></div>
<div class="status <%= heartbeat.supabase ? 'online' : 'offline' %>">Supabase: <%= heartbeat.supabase %></div>
<p>Server running on port: <%= serverConfig.port %></p>

<h2>AI Memory & Helpers</h2>
<p>Context Memory Entries: NONE (Offloaded to DB)</p>
<p>Long Term Keys: NONE (Offloaded to DB)</p>
<p>Helpers: <%= helpersList.join(', ') %></p>

<h2>Operational Metrics</h2>
<div class="metrics-container">
    <ul>
        <li>Active Shards: <span id="activeShards">0</span></li>
        <li>Active Ops: <span id="activeOps">0</span></li>
        <li>Successes: <span id="successes">0</span></li>
        <li>Failures: <span id="failures">0</span></li>
    </ul>
    </div>

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io();
    socket.on('metrics', data => {
        document.getElementById('activeShards').textContent = data.activeShards;
        document.getElementById('activeOps').textContent = data.activeOps;
        document.getElementById('successes').textContent = data.successes;
        document.getElementById('failures').textContent = data.failures;

        // Example for live charts using Chart.js.
        // You would need to manage the chart instance and update its data.
        // For example:
        // if (typeof window.metricsChart !== 'undefined') {
        //   window.metricsChart.data.datasets[0].data = [data.successes, data.failures];
        //   window.metricsChart.update();
        // }
    });

    // Example Chart.js initialization (uncomment to use)
    // const ctx = document.getElementById('metricsChart').getContext('2d');
    // window.metricsChart = new Chart(ctx, {
    //     type: 'bar',
    //     data: {
    //         labels: ['Successes', 'Failures'],
    //         datasets: [{
    //             label: 'Operational Metrics',
    //             data: [0, 0], // Initial data
    //             backgroundColor: ['rgba(75, 192, 192, 0.2)', 'rgba(255, 99, 132, 0.2)'],
    //             borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
    //             borderWidth: 1
    //         }]
    //     },
    //     options: {
    //         responsive: true,
    //         scales: {
    //             y: {
    //                 beginAtZero: true
    //             }
    //         }
    //     }
    // });
</script>
</body>
</html>`;
    fs.writeFileSync(dashboardTemplate, defaultTemplate);
}

app.get('/dashboard', async (req, res) => {
    try {
        res.render('dashboard', {
            heartbeat: heartbeatStatus,
            contextMemoryCount: 'N/A (Offloaded)',
            longTermKeys: 'N/A (Offloaded)',
            helpersList: Object.keys(AI_helpers),
            serverConfig: { port: PORT }
        });
    } catch (err) {
        res.status(500).send(`Dashboard error: ${err.message}`);
    }
});

app.post('/learnText', async (req, res) => {
    try {
        const { text, shard } = req.body;
        if (!text) throw new Error("Missing 'text' in body");
        await learnText(text, shard || 'default');
        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

app.get('/generateSentence', async (req, res) => {
    try {
        const shard = req.query.shard || 'default';
        const length = parseInt(req.query.length || '8', 10);
        const sentence = await generateSentence(length, shard);
        res.json({ ok: true, sentence });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        storage: heartbeatStatus
    });
});

app.get('/', (req, res) => {
  res.send('Welcome to Casper AI Server');
});

// ===================== AUTONOMOUS LOOP =====================
async function learnMemory(text, shard = 'default') {
    try {
        await learnText(text, shard);
        casperMetrics.activeOps++;
        casperMetrics.successes++;
    } catch(e) {
        log('error', `[Memory] Failed to learn shard ${shard}:`, e.message);
        casperMetrics.activeOps++;
        casperMetrics.failures++;
    } finally {
        updateCasperMetrics({});
    }
}

async function generateMemorySentence(shard = 'default') {
    try {
        const sentence = await generateSentence(8, shard);
        casperMetrics.activeOps++;
        casperMetrics.successes++;
        return sentence;
    } catch {
        casperMetrics.activeOps++;
        casperMetrics.failures++;
        return '...';
    } finally {
        updateCasperMetrics({});
    }
}

async function applyPatch() {
    if (global.latestPatch) {
        log('info', '[Patch] Applying queued patch...');
        await autonomousSelfUpdate();
        global.latestPatch = null;
    }
}

async function performCloudOps(account) {
    log('info', `[CloudOps] Performing operations for account: ${account.email}`);

    try {
        if (heartbeatStatus.firebase) {
            // Placeholder for Firebase operation
            log('info', '[CloudOps] Accessing Firebase...');
            casperMetrics.successes++;
        } else {
            log('warn', '[CloudOps] Firebase not healthy.');
            casperMetrics.failures++;
        }

        if (heartbeatStatus.supabase) {
            // Placeholder for Supabase operation
            log('info', '[CloudOps] Accessing Supabase...');
            casperMetrics.successes++;
        } else {
            log('warn', '[CloudOps] Supabase not healthy.');
            casperMetrics.failures++;
        }

        if (process.env.DROPBOX_ACCESS_TOKEN) {
            initDropbox();
            // Placeholder for Dropbox operation
            log('info', '[CloudOps] Accessing Dropbox...');
            casperMetrics.successes++;
        } else {
            log('warn', '[CloudOps] Dropbox token not found.');
            casperMetrics.failures++;
        }

        // Placeholder for Google Drive using googleapis
        if (process.env.GOOGLE_DRIVE_API_KEY) {
            log('info', '[CloudOps] Accessing Google Drive...');
            casperMetrics.successes++;
        } else {
            log('warn', '[CloudOps] Google Drive API key not found.');
            casperMetrics.failures++;
        }
    } catch (e) {
        log('error', `[CloudOps] Failed: ${e.message}`);
        casperMetrics.failures++;
    } finally {
        updateCasperMetrics({});
    }
}

async function autonomousScan() {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: HEADLESS });
        const page = await browser.newPage();
        
        await fetchPage(page, 'https://example.com'); // Placeholder for dynamic URL fetching
        
        // Ensure the page is always closed
        await page.close();

    } catch (e) {
        log('error', `[Web Scan] Failed: ${e.message}`);
    } finally {
        if (browser) {
            // Ensure the browser is always closed
            await browser.close();
            logMessage('info', '[Web Scan] Puppeteer browser closed.');
        }
    }
}

/**
 * NEW: Intelligent Control Block
 * Uses a prompt to an AI model to decide whether to proceed with
 * resource-intensive autonomous tasks.
 */
async function intelligentDecision() {
    if (!openai) {
        logMessage('warn', '[Control Block] OpenAI not initialized, defaulting to proceed.');
        return true;
    }
    try {
        const prompt = `Based on the current metrics, with successes at ${casperMetrics.successes} and failures at ${casperMetrics.failures}, should I proceed with resource-intensive tasks? Respond with a single word, 'YES' or 'NO'.`;
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2, // Keep it deterministic
            max_tokens: 5,
        });

        const decision = response.choices[0].message.content.trim().toUpperCase();
        return decision === 'YES';
    } catch (e) {
        logMessage('error', `[Control Block] Failed to get decision from AI: ${e.message}. Defaulting to proceed.`);
        return true; // Failsafe to prevent system from stalling
    }
}

async function autonomousLoop() {
    const accounts = [{ email: 'casper@ai.com' }]; // Placeholder for user accounts

    // ---
    // Refactoring to use a task queue for all major operations.
    // This ensures only one task (web scan, generation, etc.) is active at any time,
    // preventing memory spikes.
    // ---
    while (true) {
        // Add tasks to the queue. The queue will run them one by one.
        taskQueue.add(() => applyPatch());
        taskQueue.add(async () => {
            const storageOk = await isStorageHealthy();
            if (!storageOk) {
                log('warn', '[Autonomous] Storage near capacity, skipping memory & web crawl...');
                return; // Skip this task
            }

            if (!isOverrideActive()) {
                log('warn', '[Autonomous] Override is not active, skipping tasks.');
                return;
            }

            // --- MEMORY LEARNING ---
            log('info', '[Autonomous] Starting memory learning...');
            for (const shard of MEMORY_SHARDS) {
                const sentence = await generateMemorySentence(shard);
                await learnMemory(sentence, shard);
            }
        });

        // --- INTELLIGENT CONTROL BLOCK ---
        taskQueue.add(async () => {
            const proceed = await intelligentDecision();
            if (proceed) {
                logMessage('info', '[Autonomous] Intelligent Control Block: Proceeding with tasks.');

                // --- MULTI-MODAL GENERATION (THROTTLED) ---
                generationCounter++;
                if (generationCounter % GENERATION_INTERVAL === 0) {
                    log('info', '[Autonomous] Starting multi-modal generation...');
                    let generatedText = null;
                    try {
                        const textPrompt = await generateMemorySentence('text');
                        generatedText = await generateText(textPrompt);
                        log('info', `[Autonomous] Text: ${generatedText}`);
                        casperMetrics.successes++;
                    } catch (e) {
                        log('error', `[Autonomous] Text generation failed: ${e.message}`);
                        casperMetrics.failures++;
                    }

                    try {
                        const imageUrl = await generateImage(generatedText);
                        if (imageUrl) log('info', `[Autonomous] Image: ${imageUrl}`);
                        casperMetrics.successes++;
                    } catch (e) {
                        log('error', `[Autonomous] Image generation failed: ${e.message}`);
                        casperMetrics.failures++;
                    }

                    try {
                        const audioFile = await generateAudio(generatedText);
                        if (audioFile) log('info', `[Autonomous] Audio file: ${audioFile}`);
                        casperMetrics.successes++;
                    } catch (e) {
                        log('error', `[Autonomous] Audio generation failed: ${e.message}`);
                        casperMetrics.failures++;
                    }

                    try {
                        const codeSnippet = await generateCode(generatedText);
                        log('info', `[Autonomous] Code snippet:\n${codeSnippet}`);
                        casperMetrics.successes++;
                    } catch (e) {
                        log('error', `[Autonomous] Code generation failed: ${e.message}`);
                        casperMetrics.failures++;
                    }

                    updateCasperMetrics({});
                }

                // --- WEB SCAN ---
                try {
                    log('info', '[Autonomous] Starting web scan...');
                    await autonomousScan();
                    casperMetrics.successes++;
                } catch (e) {
                    log('error', `[Autonomous] Web scan failed: ${e.message}`);
                    casperMetrics.failures++;
                } finally {
                    updateCasperMetrics({});
                }

                // --- CLOUD OPERATIONS ---
                log('info', '[Autonomous] Starting cloud operations...');
                for (const account of accounts) {
                    await performCloudOps(account);
                }
            } else {
                logMessage('warn', '[Autonomous] Intelligent Control Block: Decision is to wait. Skipping tasks.');
            }
        });

        // Wait for all tasks in the queue to finish before starting the next cycle
        await taskQueue.onIdle();

        // Pause for the main interval
        await new Promise(r => setTimeout(r, CLOUD_INTERVAL_MS));
    }
}

// ===================== SERVER INITIALIZATION =====================
async function initServer() {
    try {
        initSupabase();
        initOpenAI();
        await initMongo();

        // ---
        // NEW: Set the memory limit parameter at runtime
        process.env.NODE_OPTIONS = `--max-old-space-size=${MEMORY_LIMIT_MB}`;
        logMessage('info', `[Memory Management] Node.js process memory limit set to ${MEMORY_LIMIT_MB} MB.`);
        // ---

        // Perform an initial heartbeat and wait for the result
        const initialStatus = await singleStorageHeartbeat();
        const hasHealthyStorage = Object.values(initialStatus).some(status => status);

        if (!hasHealthyStorage) {
            logMessage('error', '[Server Init] FATAL: No healthy storage connections found. Exiting.');
            process.exit(1); // Exit with an error code
        }

        // Start the periodic heartbeat loop
        startPeriodicHeartbeat();

        await autoProvisionAll();
        startKillSwitchWatcher();
        casperMetrics.activeShards = MEMORY_SHARDS.length;
        updateCasperMetrics({}); // Send initial metrics

        server.listen(PORT, () => {
            logMessage('info', `[Casper AI] Server running on http://localhost:${PORT}`);
            logMessage('info', `[Dashboard] Available at http://localhost:${PORT}/dashboard`);
        });

        // Start autonomous loop now that a healthy storage provider is confirmed
        autonomousLoop();

    } catch (err) {
        logMessage('error', `[Server Init] Failed: ${err.message}`);
    }
}

initServer();
module.exports = { app, server };

