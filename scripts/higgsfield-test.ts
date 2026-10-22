import { config, higgsfield } from "@higgsfield/client/v2";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

config({
  credentials: process.env.HF_CREDENTIALS,
});

async function main() {
  const result = await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  if (result.status === "completed") {
    console.log("COMPLETED");
    console.log("video:", (result as unknown as { video?: unknown }).video);
    return;
  }

  console.log("NOT COMPLETED");
  console.log("status:", result.status);
  console.log("full result:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("REQUEST FAILED");
  console.error(err);
  process.exit(1);
});
