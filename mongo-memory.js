const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || '';
const DATABASE_NAME = process.env.MONGO_DB || 'MemoryCore';
const COLLECTION_NAME = process.env.MONGO_COLLECTION || 'knowledge';
let client, collection;

async function initMongo() {
  if (!MONGO_URI) return console.error('Mongo URI missing');
  client = new MongoClient(MONGO_URI);
  await client.connect();
  collection = client.db(DATABASE_NAME).collection(COLLECTION_NAME);
  console.log('[Mongo] Connected to MemoryCore');
}

async function saveKnowledge(entry) {
  if (!collection) await initMongo();
  await collection.updateOne({ text: entry.text }, { $set: entry }, { upsert: true });
}

async function fetchKnowledge(keyword) {
  if (!collection) await initMongo();
  return await collection.find({ text: { $regex: keyword, $options: 'i' } }).toArray();
}

module.exports = { initMongo, saveKnowledge, fetchKnowledge };