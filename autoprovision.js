const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { ImapFlow } = require('imapflow');
const crypto = require('crypto');
require('dotenv').config();
const admin = require('firebase-admin');

const VAULT_DIR = path.join(__dirname, 'vault');
if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR);

const PROVIDERS_FILE = path.join(VAULT_DIR, 'providers.json');
const EMAIL_ADDRESS = process.env.EMAIL_ADDRESS || '';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || '';
const IMAP_HOST = process.env.IMAP_HOST || '';
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
const IMAP_SECURE = process.env.IMAP_SECURE === 'true';
const CASPER_FULLNAME = process.env.CASPER_FULLNAME || 'Casper AI';
const ENCRYPT_KEY = process.env.VAULT_KEY || 'change_this_to_strong_key_32chars';
const HEADLESS = process.env.HEADLESS === 'true';

// === Encryption ===
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}
function decrypt(enc) {
  const [ivHex, encryptedHex] = enc.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// === Email Verification ===
async function waitForVerificationEmail({ fromIncludes = '', subjectIncludes = '', timeoutMs = 120000 }) {
  const client = new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: IMAP_SECURE, auth: { user: EMAIL_ADDRESS, pass: EMAIL_PASSWORD } });
  await client.connect();
  await client.mailboxOpen('INBOX');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const unseen = await client.search({ seen: false });
      for (const seq of unseen.slice(-50)) {
        const msg = await client.fetchOne(seq, { envelope: true, source: true });
        const env = msg.envelope || {};
        const fromStr = (env.from || []).map(f => f.address).join(' ').toLowerCase();
        const subject = (env.subject || '').toLowerCase();
        if (fromStr.includes(fromIncludes.toLowerCase()) || subject.includes(subjectIncludes.toLowerCase())) {
          const raw = msg.source.toString();
          const linkMatch = raw.match(/https?:\/\/[^\s)>\]]+/gi);
          if (linkMatch?.length) return linkMatch.find(l => /verify|confirm|activate|signup|email/.test(l.toLowerCase())) || linkMatch[0];
        }
      }
    } finally { lock.release(); }
    await new Promise(r => setTimeout(r, 5000));
  }
  await client.logout();
  return null;
}

// === Password Generator ===
function generatePassword() {
  return crypto.randomBytes(8).toString('hex') + 'Aa1!';
}

// === MongoDB Signup ===
async function signupMongoDB(browser) {
  const page = await browser.newPage();
  await page.goto('https://www.mongodb.com/atlas/database', { waitUntil: 'networkidle2' });
  await page.click('a[href*="register"],a[href*="signup"]');
  await page.type('input[name="email"]', EMAIL_ADDRESS, { delay: 20 });
  const pwd = generatePassword();
  await page.type('input[name="password"]', pwd, { delay: 20 });
  await page.type('input[name="firstName"]', CASPER_FULLNAME.split(' ')[0], { delay: 15 });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  const link = await waitForVerificationEmail({ fromIncludes: 'mongodb', subjectIncludes: 'verify' });
  if (link) { const v = await browser.newPage(); await v.goto(link); await v.close(); }
  return { type: 'mongodb', email: EMAIL_ADDRESS, password: pwd };
}

// === Supabase Signup ===
async function signupSupabase(browser) {
  const page = await browser.newPage();
  await page.goto('https://supabase.com', { waitUntil: 'networkidle2' });
  await page.click('a[href*="sign-in"],a[href*="login"]');
  await page.type('input[type="email"]', EMAIL_ADDRESS, { delay: 20 });
  const pwd = generatePassword();
  await page.type('input[type="password"]', pwd, { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  const link = await waitForVerificationEmail({ fromIncludes: 'supabase', subjectIncludes: 'magic' });
  if (link) { const v = await browser.newPage(); await v.goto(link); await v.close(); }
  return { type: 'supabase', email: EMAIL_ADDRESS, password: pwd };
}

// === Firebase Signup ===
async function signupFirebase() {
  const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return { type: 'firebase', email: EMAIL_ADDRESS, serviceAccount };
}

// === Auto Provision All ===
async function autoProvisionAll() {
  const browser = await puppeteer.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
  const providers = {};
  try { providers.mongodb = await signupMongoDB(browser); } catch(e){ console.error(e); }
  try { providers.supabase = await signupSupabase(browser); } catch(e){ console.error(e); }
  try { providers.firebase = await signupFirebase(); } catch(e){ console.error(e); }
  fs.writeFileSync(PROVIDERS_FILE, encrypt(JSON.stringify(providers)));
  await browser.close();
  return providers;
}

function getProviders() {
  if (!fs.existsSync(PROVIDERS_FILE)) return {};
  const encrypted = fs.readFileSync(PROVIDERS_FILE, 'utf8');
  return JSON.parse(decrypt(encrypted));
}

module.exports = { autoProvisionAll, getProviders };