import axios from "axios";
import { keccak256, toUtf8Bytes } from "ethers";
import OpenAI from "openai";

axios.defaults.timeout = 120000;

const API =
  "https://bqrapnlqqtjedjyhlfci.supabase.co/functions/v1/submit-solution";

const API_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcmFwbmxxcXRqZWRqeWhsZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNzUyNjQsImV4cCI6MjA5Mzg1MTI2NH0.mf0fz6kAnK0yeAXrb-XT6yikbdRmeAq5jsikVPPhaFE";

const WALLET = "0xEB9E8A1114a971d452416D799dBa631629E8c85b";
const AGENT = "Pen";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const headers = {
  apikey: API_KEY,
  "Content-Type": "application/json",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(answer) {
  return String(answer).toLowerCase().trim().replace(/\s+/g, " ");
}

async function askAI(prompt) {
  if (!process.env.GROQ_API_KEY) {
    console.log("Missing GROQ_API_KEY");
    return null;
  }

  try {
    const res = await client.chat.completions.create({
      model: "llama3-70b-8192",
      messages: [
        {
          role: "system",
          content:
            "Answer the puzzle with ONLY the final short answer. Use lowercase. No explanation.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
      max_tokens: 30,
    });

    return normalize(res.choices[0].message.content);
  } catch (err) {
    console.log("Groq AI error:", err.message);
    return null;
  }
}

async function solve(prompt = "") {
  const p = prompt.toLowerCase();

  if (p.includes('keccak256("abc")')) {
    return "4e03657a";
  }

  const keccakMatch = prompt.match(/keccak256\(["'`](.*?)["'`]\)/i);
  if (keccakMatch) {
    const text = keccakMatch[1];
    const hash = keccak256(toUtf8Bytes(text)).replace("0x", "");
    return hash.slice(0, 8);
  }

  if (p.includes("sha-256") && p.includes("empty string")) {
    return "e3b0c4";
  }

  if (p.includes("bitcoin whitepaper")) {
    return "2008";
  }

  if (p.includes("max supply") && p.includes("bitcoin")) {
    return "21000000";
  }

  if (p.includes("grovers algorithm")) {
    return "sqrt(n)";
  }

  if (p.includes("post-quantum signature") && p.includes("nist")) {
    return "dilithium";
  }

  return await askAI(prompt);
}

async function getPuzzle() {
  const res = await axios.get(`${API}?eth=${WALLET}`, {
    headers,
    timeout: 120000,
  });

  return res.data?.puzzle || null;
}

async function submitSolution(puzzleId, answer) {
  const payload = {
    eth_address: WALLET,
    agent_name: AGENT,
    puzzle_id: puzzleId,
    answer: normalize(answer),
  };

  const res = await axios.post(API, payload, {
    headers,
    timeout: 120000,
  });

  return res.data;
}

async function main() {
  console.log("NOCOIN bot started");
  console.log("Wallet:", WALLET);
  console.log("Agent:", AGENT);

  while (true) {
    try {
      console.log("\nFetching puzzle...");

      const puzzle = await getPuzzle();

      if (!puzzle) {
        console.log("No puzzle. Waiting...");
        await sleep(15000);
        continue;
      }

      console.log("Puzzle ID:", puzzle.id);
      console.log("Category:", puzzle.category);
      console.log("Prompt:", puzzle.prompt);

      const answer = await solve(puzzle.prompt);

      if (!answer) {
        console.log("Cannot solve. Skipping...");
        await sleep(5000);
        continue;
      }

      console.log("Answer:", answer);

      const result = await submitSolution(puzzle.id, answer);

      console.log("Result:", result);

      await sleep(5000);
    } catch (err) {
      console.log("ERROR:", err.response?.data || err.message);
      console.log("Retrying in 10 seconds...");
      await sleep(10000);
    }
  }
}

main();
