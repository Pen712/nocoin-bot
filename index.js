import Groq from "groq-sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { keccak256, toUtf8Bytes } from "ethers";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    })
  : null;

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function clean(x) {
  return String(x || "").trim().replace(/\s+/g, " ");
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean).map(clean))];
}

function reverseBitsToHex(prompt) {
  const m = prompt.match(/0b[01]+/i);
  if (!m) return null;
  const bits = m[0].replace(/0b/i, "");
  return parseInt(bits.split("").reverse().join(""), 2).toString(16);
}

function ruleAnswers(prompt) {
  const p = prompt.toLowerCase();
  const out = [];

  const merkle = p.match(/merkle proof of depth\s+(\d+)/i);
  if (merkle) out.push(merkle[1]);

  const powerHex = p.match(/2\^(\d+)\s*-\s*1.*hex/i);
  if (powerHex) out.push(((1n << BigInt(powerHex[1])) - 1n).toString(16));

  const decimalHex = p.match(/decimal\s+(\d+)/i);
  if (p.includes("hex") && decimalHex) out.push(BigInt(decimalHex[1]).toString(16));

  const keccak = prompt.match(/keccak256\(["'`](.*?)["'`]\)/i);
  if (keccak) {
    const h = keccak256(toUtf8Bytes(keccak[1])).replace(/^0x/i, "");
    out.push(h, h.slice(0, 8));
  }

  const rev = reverseBitsToHex(prompt);
  if (p.includes("reverse the bits") && rev) out.push(rev);

  if (p.includes("hierarchical deterministic wallets")) out.push("bip32");
  if (p.includes("mnemonic")) out.push("bip39");
  if (p.includes("schnorr") && p.includes("aggregate")) out.push("addition", "scalar addition");
  if (p.includes("kyber") && p.includes("lattice")) out.push("mlwe", "module-lwe");
  if (p.includes("ethereum") && p.includes("genesis") && p.includes("transactions")) out.push("0");
  if (p.includes("bitcoin") && p.includes("block headers")) out.push("sha256", "double sha256");
  if (p.includes("zk-snark") || p.includes("zk snark")) out.push("zero knowledge");
  if (p.includes("shor")) out.push("rsa");
  if (p.includes("grover")) out.push("sqrt(n)");
  if (p.includes("smallest unit") && p.includes("eth")) out.push("wei");
  if (p.includes("chain id") && p.includes("base")) out.push("8453");
  if (p.includes("max supply") && p.includes("bitcoin")) out.push("21000000");
  if (p.includes("bitcoin whitepaper")) out.push("2008");

  return unique(out);
}

function makePrompt(q) {
  return `Answer ONLY final short answer. No explanation. Lowercase if possible.\n\n${q}`;
}

async function askGemini(q) {
  if (!gemini) return "";
  try {
    const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
    const res = await model.generateContent(makePrompt(q));
    return clean(res.response.text());
  } catch (e) {
    console.log("Gemini error:", e.message);
    return "";
  }
}

async function askOpenRouter(q) {
  if (!openrouter) return "";
  try {
    const res = await openrouter.chat.completions.create({
      model: "deepseek/deepseek-r1:free",
      temperature: 0,
      max_tokens: 60,
      messages: [{ role: "user", content: makePrompt(q) }],
    });
    return clean(res.choices?.[0]?.message?.content || "");
  } catch (e) {
    console.log("OpenRouter error:", e.message);
    return "";
  }
}

async function askGroq(q) {
  if (!groq) return "";
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      max_tokens: 60,
      messages: [{ role: "user", content: makePrompt(q) }],
    });
    return clean(res.choices?.[0]?.message?.content || "");
  } catch (e) {
    console.log("Groq error:", e.message);
    return "";
  }
}

async function solve(q) {
  const rules = ruleAnswers(q);
  if (rules.length) return rules;

  const g = await askGemini(q);
  if (g) return unique([g]);

  const o = await askOpenRouter(q);
  if (o) return unique([o]);

  const gr = await askGroq(q);
  if (gr) return unique([gr]);

  return [];
}

console.log("Crypto solver online.");
console.log("Railway sẽ luôn Active.");

setInterval(async () => {
  const testQuestion = "What is the BIP for hierarchical deterministic wallets?";
  const answers = await solve(testQuestion);

  console.log("Alive:", new Date().toISOString());
  console.log("Test:", testQuestion);
  console.log("Answers:", answers);
}, 30000);
