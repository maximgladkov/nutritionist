import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

export default defineWorkflowTool({
  description: [
    "Ask the user one question and wait for the answer. Use it only when you cannot go on without something only they know and a sensible guess would be wrong. Never ask for what your other tools can find, and never ask them to confirm what they already said.",
    "Offer options when the likely answers are few, the likeliest first. Set multiple when more than one can be true at once, such as which of several foods were in it. Leave options out when the answer could be anything. Never add \"Other\": they can always answer in their own words.",
    "`answer` is what they chose, separated by commas when there are several, or their own words. With status \"unavailable\" nobody can answer: go on with your best judgment and say what you assumed. With status \"interrupted\" they said something else instead: respond to that.",
  ].join("\n\n"),
  inputSchema: z.object({
    multiple: z.boolean().optional().describe("They may choose more than one option."),
    options: z
      .array(
        z.object({
          description: z.string().max(200).optional().describe("One short sentence, only if the label alone isn't clear."),
          label: z.string().min(1).max(80).describe("What they tap, 1-5 words, without commas."),
          suggested: z.boolean().optional().describe("The likeliest one."),
        }),
      )
      .min(2)
      .max(6)
      .optional(),
    question: z.string().min(1).max(2000).describe("The question, in their language."),
  }),
  async execute(input, ctx) {
    "use workflow";
    const options = input.options ?? [];
    // Elsewhere than the app a tap chooses one and is the whole answer, so several are asked for in words.
    const listed = input.multiple && options.length > 0;
    const answer = await ctx.ask({
      allowFreeform: true,
      prompt: listed ? `${input.question}\n\n${options.map(({ label }) => `- ${label}`).join("\n")}` : input.question,
      ...(options.length > 0 && !listed
        ? { display: "select" as const, options: options.map(({ description, label }) => ({ description, id: label, label })) }
        : { display: "text" as const }),
    });
    if (answer.status === "answered") {
      return { answer: answer.optionId ?? answer.text ?? "", status: "answered" as const };
    }
    return { status: answer.status === "unavailable" ? ("unavailable" as const) : ("interrupted" as const) };
  },
});
