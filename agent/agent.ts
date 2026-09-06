import { defineAgent } from "eve";

export default defineAgent({
  compaction: {
    thresholdPercent: 0.6,
  },
  model: "alibaba/qwen3.7-flash",
  reasoning: "none",
});
