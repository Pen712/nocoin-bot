import axios from "axios";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

axios.defaults.timeout = 120000;

const API =
  "https://bqrapnlqqtjedjyhlfci.supabase.co/functions/v1/submit-solution";

const API_KEY =
  "YOUR_API_KEY";

const WALLET = "0xEB9E8A1114a971d452416D799dBa631629E8c85b";
const AGENT = "Pen";

const headers = {
  apikey: API_KEY,
  "Content-Type": "application/json",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function solveWithAI(prompt) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are a crypto and blockchain expert. Reply with ONLY the correct short answer.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0,
      max_tokens: 50,
    });

    return completion.choices[0]?.message?.content?.trim();
  } catch (err) {
    console.log("Groq Error:", err.message);
    return null;
  }
}

async function main() {
  console.log("NOCOIN bot started");
  console.log("Wallet:", WALLET);
  console.log("Agent:", AGENT);

  while (true) {
    try {
      console.log("Fetching puzzle...");

      const res = await axios.get(`${API}?eth=${WALLET}`, {
        headers,
      });

      const puzzle = res.data?.puzzle;

      if (!puzzle) {
        console.log("No puzzle found");
        await sleep(5000);
        continue;
      }

      console.log("Puzzle ID:", puzzle.id);
      console.log("Category:", puzzle.category);
      console.log("Prompt:", puzzle.prompt);

      const answer = await solveWithAI(puzzle.prompt);

      if (!answer) {
        console.log("Could not solve");
        await sleep(5000);
        continue;
      }

      console.log("Answer:", answer);

      const submit = await axios.post(
        API,
        {
          eth: WALLET,
          agent: AGENT,
          puzzle_id: puzzle.id,
          answer,
        },
        {
          headers,
        }
      );

      console.log("Result:", submit.data);

      await sleep(3000);
    } catch (err) {
      console.log("ERROR:", err.message);
      await sleep(5000);
    }
  }
}

main();
