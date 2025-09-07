// language-builder.js - multi-shard version
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || '';
const DATABASE_NAME = 'MemoryCore';
let client, db;

// Map to store collections per shard
const collections = {};

// --- Initialize MongoDB connection ---
async function init() {
  if (!MONGO_URI) throw new Error('Missing MONGO_URI in environment');
  if (!client) {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DATABASE_NAME);
    console.log('[LanguageBuilder] Connected to MongoDB');
  }
}

// --- Helper to get collections per shard ---
async function getCollections(shard = 'default') {
  await init();
  if (!collections[shard]) {
    collections[shard] = {
      vocabCol: db.collection(`${shard}_vocabulary`),
      bigramCol: db.collection(`${shard}_bigrams`),
      sentenceCol: db.collection(`${shard}_sentences`)
    };
    await bootstrapSchema(shard);
  }
  return collections[shard];
}

// --- Bootstrap indexes for shard ---
async function bootstrapSchema(shard) {
  console.log(`[LanguageBuilder] Bootstrapping schema for shard: ${shard}`);
  const { vocabCol, bigramCol, sentenceCol } = collections[shard];

  await vocabCol.createIndex({ word: 1 }, { unique: true });
  await vocabCol.createIndex({ count: -1 });

  await bigramCol.createIndex({ prev: 1, next: 1 }, { unique: true });
  await bigramCol.createIndex({ prev: 1, count: -1 });

  await sentenceCol.createIndex({ timestamp: -1 });
  console.log(`[LanguageBuilder] Shard ${shard} schema ready.`);
}

// --- Increment functions ---
async function incrementWord(word, vocabCol) {
  word = word.toLowerCase();
  await vocabCol.updateOne({ word }, { $inc: { count: 1 } }, { upsert: true });
}

async function incrementBigram(prev, next, bigramCol) {
  prev = prev.toLowerCase();
  next = next.toLowerCase();
  await bigramCol.updateOne({ prev, next }, { $inc: { count: 1 } }, { upsert: true });
}

// --- Public API ---
async function learnText(text, shard = 'default') {
  const { vocabCol, bigramCol, sentenceCol } = await getCollections(shard);

  const words = text
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase())
    .filter(Boolean);
  if (!words.length) return;

  for (const word of words) await incrementWord(word, vocabCol);

  for (let i = 0; i < words.length - 1; i++) await incrementBigram(words[i], words[i + 1], bigramCol);

  await sentenceCol.insertOne({ text, timestamp: Date.now() });
}

async function generateWord(shard = 'default') {
  const { vocabCol } = await getCollections(shard);
  const words = await vocabCol.aggregate([{ $sample: { size: 1 } }]).toArray();
  return words[0]?.word || '...';
}

async function generateSentence(maxLength = 8, shard = 'default') {
  const { bigramCol } = await getCollections(shard);

  let currentWord = await generateWord(shard);
  let sentence = [currentWord];

  for (let i = 1; i < maxLength; i++) {
    const next = await bigramCol.find({ prev: currentWord }).sort({ count: -1 }).limit(3).toArray();
    if (!next.length) break;

    const total = next.reduce((sum, n) => sum + n.count, 0);
    let rand = Math.floor(Math.random() * total);
    let chosen = next[0].next;

    for (const option of next) {
      if (rand < option.count) {
        chosen = option.next;
        break;
      }
      rand -= option.count;
    }

    sentence.push(chosen);
    currentWord = chosen;
  }

  return sentence.join(' ');
}

async function getVocabulary(limit = 50, shard = 'default') {
  const { vocabCol } = await getCollections(shard);
  return await vocabCol.find({}).sort({ count: -1 }).limit(limit).toArray();
}

module.exports = { learnText, generateWord, generateSentence, getVocabulary };