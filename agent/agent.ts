import { gateway, wrapLanguageModel } from "ai";
import { defineAgent } from "eve";
import { createRequireWriteToolsMiddleware } from "../lib/require-write-tools";
import { classifyToolCategories } from "../lib/telegram-ack";

const MODEL_ID = "alibaba/qwen3.7-flash";

export default defineAgent({
  compaction: {
    thresholdPercent: 0.6,
  },
  model: wrapLanguageModel({
    middleware: createRequireWriteToolsMiddleware({ classify: classifyToolCategories }),
    model: gateway(MODEL_ID),
    modelId: MODEL_ID,
  }),
  modelContextWindowTokens: 262_144,
  reasoning: "none",
});
