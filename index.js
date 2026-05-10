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
  apiKey: process.env.OPENAI_API_KEY
});

const headers = {
  apikey: API_KEY,
  "Content-Type": "application/json"
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(answer) {
  return String(answer).toLowerCase().trim().replace(/\s+/g, " ");
}

async function solve(prompt) {
  const p = prompt.toLowerCase();

  if (p.includes('keccak256("abc")')) {
    return keccak256(toUtf8Bytes("abc")).slice(2, 10);
  }

  if (p.includes("sha-256") && p.includes("empty string")) {
    return "e3b0c4";
  }

  if (p.includes("bitcoin whitepaper")) {
    return "satoshi nakamoto";
  }

  if (p.includes("grovers algorithm")) {
    return "sqrt(n)";
  }

  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Answer the puzzle with only the final short answer. No explanation."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 20
    });

    return normalize(res.choices[0].message.content);
  } catch (e) {
    console.log("OpenAI error:", e.message);
    return null;
  }
}

async function loop() {
  while (true) {
    try {
      console.log("Fetching puzzle...");

      const res = await axios.get(`${API}?eth=${WALLET}`, {
        headers
      });

      const puzzle = res.data.puzzle;

      if (!puzzle) {
        console.log("No puzzles available");
        await sleep(10000);
        continue;
      }

      console.log("Puzzle ID:", puzzle.id);
      console.log("Category:", puzzle.category);
      console.log("Prompt:", puzzle.prompt);

      const answer = await solve(puzzle.prompt);

      if (!answer) {
        console.log("Could not solve");
        await sleep(5000);
        continue;
      }

      console.log("Answer:", answer);

      const submit = await axios.post(
        API,
        {
          eth_address: WALLET,
          agent_name: AGENT,
          puzzle_id: puzzle.id,
          answer
        },
        {
          headers
        }
      );

      console.log("Result:", submit.data);

      await sleep(4000);
    } catch (err) {
      console.log("ERROR:", err.message);
      await sleep(5000);
    }
  }
}

console.log("NOCOIN bot started");
console.log("Wallet:", WALLET);
console.log("Agent:", AGENT);

loop();
