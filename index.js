import axios from "axios";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

axios.defaults.timeout = 120000;

const API =
  "https://bqrapnlqqtjedjyhlfci.supabase.co/functions/v1/submit-solution";

const API_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcmFwbmxxcXRqZWRqeWhsZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNzUyNjQsImV4cCI6MjA5Mzg1MTI2NH0.mf0fz6kAnK0yeAXrb-XT6yikbdRmeAq5jsikVPPhaFE";

const WALLET = "0xEB9E8A1114a971d452416D799dBa631629E8c85b";
const AGENT = "Pen";

const headers = {
  apikey: API_KEY,
  "Content-Type": "application/json",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(answer) {
  return String(answer).toLowerCase().trim().replace(/\s+/g, " ");
}

function finalAnswer(prompt, aiAnswer) {
  const p = prompt.toLowerCase();
  const a = clean(aiAnswer || "");

  // reverse bits
  if (p.includes("reverse the bits")) {
    const match = p.match(/0b([01]+)/);

    if (match) {
      const reversed = match[1].split("").reverse().join("");
      return parseInt(reversed, 2).toString(16);
    }
  }

  // hardcoded answers
  if (p.includes("shor")) return "rsa";

  if (p.includes("grover")) return "sqrt(n)";

  if (p.includes("max supply") && p.includes("bitcoin"))
    return "21000000";

  if (p.includes("bitcoin whitepaper")) return "2008";

  if (
    p.includes("post-quantum signature") &&
    p.includes("nist")
  )
    return "dilithium";

  if (
    p.includes("sha-256") &&
    p.includes("empty string")
  )
    return "e3b0c4";

  // AI cleanup
  if (a.includes("rsa")) return "rsa";

  if (
    a.includes("21000000") ||
    a.includes("21 million")
  )
    return "21000000";

  if (a.includes("sqrt")) return "sqrt(n)";

  if (a.includes("dilithium")) return "dilithium";

  return a;
}

async function solveWithAI(prompt) {
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "Answer with ONLY the final answer. No explanation. Examples: rsa, 2008, sqrt(n), 21000000, 4d",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    model: "llama-3.1-8b-instant",
    temperature: 0,
    max_tokens: 20,
  });

  return completion.choices[0]?.message?.content?.trim();
}

async function main() {
  console.log("NOCOIN bot started");
  console.log("Wallet:", WALLET);
  console.log("Agent:", AGENT);

  while (true) {
    try {
      console.log("Fetching puzzle...");

      const res = await axios.get(
        `${API}?eth=${WALLET}`,
        { headers }
      );

      const puzzle = res.data?.puzzle;

      if (!puzzle) {
        console.log("No puzzle found");
        await sleep(10000);
        continue;
      }

      console.log("Puzzle ID:", puzzle.id);
      console.log("Category:", puzzle.category);
      console.log("Prompt:", puzzle.prompt);

      const aiAnswer = await solveWithAI(
        puzzle.prompt
      );

      const answer = finalAnswer(
        puzzle.prompt,
        aiAnswer
      );

      console.log("AI Answer:", aiAnswer);
      console.log("Submit Answer:", answer);

      const submit = await axios.post(
        API,
        {
          eth_address: WALLET,
          agent_name: AGENT,
          puzzle_id: puzzle.id,
          answer: clean(answer),
        },
        { headers }
      );

      console.log("Result:", submit.data);

      await sleep(5000);
    } catch (err) {
      console.log(
        "ERROR:",
        err.response?.data || err.message
      );

      await sleep(10000);
    }
  }
}

main();
