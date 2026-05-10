import axios from "axios";
import { keccak256, toUtf8Bytes } from "ethers";

const API = "https://bqrapnlqqtjedjyhlfci.supabase.co/functions/v1/submit-solution";

const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcmFwbmxxcXRqZWRqeWhsZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNzUyNjQsImV4cCI6MjA5Mzg1MTI2NH0.mf0fz6kAnK0yeAXrb-XT6yikbdRmeAq5jsikVPPhaFE";

const WALLET = "0xEB9E8A1114a971d452416D799dBa631629E8c85b";
const AGENT = "Pen";

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

function solve(prompt = "") {
  const p = prompt.toLowerCase();

  if (p.includes('keccak256("abc")')) {
    return "4e03657a";
  }

  if (p.includes("sha-256") && p.includes("empty string")) {
    return "e3b0c4";
  }

  if (p.includes("bitcoin whitepaper")) {
    return "2008";
  }

  if (p.includes("post-quantum signature") && p.includes("nist")) {
    return "dilithium";
  }

  const match = prompt.match(/keccak256\(["'`](.*?)["'`]\)/i);
  if (match) {
    const text = match[1];
    const hash = keccak256(toUtf8Bytes(text)).replace("0x", "");
    return hash.slice(0, 8);
  }

  return null;
}

async function getPuzzle() {
  const res = await axios.get(`${API}?eth=${WALLET}`, {
    headers,
    timeout: 30000,
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
    timeout: 30000,
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
        await sleep(10000);
        continue;
      }

      console.log("Puzzle ID:", puzzle.id);
      console.log("Category:", puzzle.category);
      console.log("Prompt:", puzzle.prompt);

      const answer = solve(puzzle.prompt);

      if (!answer) {
        console.log("Cannot solve this puzzle yet. Skipping...");
        await sleep(5000);
        continue;
      }

      console.log("Answer:", answer);

      const result = await submitSolution(puzzle.id, answer);

      console.log("Result:", result);

      await sleep(3000);
    } catch (err) {
      console.log("ERROR:", err.response?.data || err.message);
      await sleep(5000);
    }
  }
}

main();
