import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASK_QUESTION_TOOL,
  TOOL_CATEGORY_TOOLS,
  categoryForTool,
  formatIntentPlanContext,
  formatToolCategoriesContext,
  normalizeIntents,
  normalizeToolCategories,
  parseToolCategoriesContext,
  remainingWriteAllowlist,
  remainingWriteCategories,
  requiredWriteStepCap,
  toolCategoriesPreludeSchema,
  writeAllowlistForCategories,
} from "./tool-categories.ts";

describe("normalizeToolCategories", () => {
  it("drops none when another family is present", () => {
    assert.deepEqual(normalizeToolCategories({ categories: ["none", "meal"] }), ["meal"]);
  });

  it("keeps none when it is the only value", () => {
    assert.deepEqual(normalizeToolCategories({ categories: ["none"] }), ["none"]);
  });

  it("treats an empty list as none", () => {
    assert.deepEqual(normalizeToolCategories({ categories: [] }), ["none"]);
  });
});

describe("writeAllowlistForCategories", () => {
  it("maps meal to lookup and log tools, not goals or delete", () => {
    const names = writeAllowlistForCategories(["meal"]);
    assert.equal(names.includes("lookup_product"), true);
    assert.equal(names.includes("log_meal"), true);
    assert.equal(names.includes("delete_meal_item"), false);
    assert.equal(names.includes("save_my_goals"), false);
  });

  it("does not force summary tools", () => {
    assert.deepEqual(writeAllowlistForCategories(["summary"]), []);
    assert.deepEqual(writeAllowlistForCategories(["meal", "summary"]), [...TOOL_CATEGORY_TOOLS.meal]);
  });
});

describe("remainingWriteCategories", () => {
  it("keeps goals required after only a meal tool", () => {
    assert.deepEqual(
      remainingWriteCategories({ categories: ["meal", "goals"], toolNames: ["log_meal"] }),
      ["goals"],
    );
    assert.deepEqual(
      remainingWriteAllowlist({ categories: ["meal", "goals"], toolNames: ["log_meal"] }),
      [...TOOL_CATEGORY_TOOLS.goals, ASK_QUESTION_TOOL],
    );
  });

  it("clears meal after lookup_product", () => {
    assert.deepEqual(
      remainingWriteCategories({ categories: ["meal"], toolNames: ["lookup_product"] }),
      [],
    );
  });

  it("keeps meal_delete required after a meal log", () => {
    assert.deepEqual(
      remainingWriteCategories({
        categories: ["meal", "meal_delete"],
        toolNames: ["log_meal"],
      }),
      ["meal_delete"],
    );
  });

  it("clears remaining writes after ask_question", () => {
    assert.deepEqual(
      remainingWriteCategories({
        categories: ["meal", "goals"],
        toolNames: [ASK_QUESTION_TOOL],
      }),
      [],
    );
    assert.deepEqual(
      remainingWriteAllowlist({
        categories: ["meal"],
        toolNames: [],
      }),
      [...TOOL_CATEGORY_TOOLS.meal, ASK_QUESTION_TOOL],
    );
  });

  it("ignores summary when deciding what is still required", () => {
    assert.deepEqual(
      remainingWriteCategories({
        categories: ["meal", "summary"],
        toolNames: ["log_meal"],
      }),
      [],
    );
  });
});

describe("toolCategoriesContext", () => {
  it("round-trips an owned context string", () => {
    const line = formatToolCategoriesContext(["meal", "goals"]);
    assert.equal(line, "BTR_TOOL_CATEGORIES meal,goals");
    assert.deepEqual(parseToolCategoriesContext(`hint\n${line}\nmore`), ["meal", "goals"]);
  });

  it("round-trips meal_delete", () => {
    const line = formatToolCategoriesContext(["meal", "meal_delete"]);
    assert.equal(line, "BTR_TOOL_CATEGORIES meal,meal_delete");
    assert.deepEqual(parseToolCategoriesContext(line), ["meal", "meal_delete"]);
  });

  it("returns null when the prefix is absent", () => {
    assert.equal(parseToolCategoriesContext("A short acknowledgement was already sent"), null);
  });
});

describe("toolCategoriesPreludeSchema", () => {
  it("accepts ack plus an ordered intent list", () => {
    assert.deepEqual(
      toolCategoriesPreludeSchema.parse({
        ack: "Записываю…",
        intents: [{ category: "meal", text: "log the yogurt" }],
      }),
      { ack: "Записываю…", intents: [{ category: "meal", text: "log the yogurt" }] },
    );
  });
});

describe("intent plan", () => {
  it("formats a numbered checklist", () => {
    assert.equal(
      formatIntentPlanContext([
        { category: "meal", text: "log milk" },
        { category: "goals", text: "set protein to 150g" },
      ]),
      "BTR_INTENTS\n1. [meal] log milk\n2. [goals] set protein to 150g",
    );
  });

  it("keeps classified intents and does not invent a meal", () => {
    assert.deepEqual(
      normalizeIntents({
        intents: [
          { category: "none", text: "greet" },
          { category: "goals", text: "set protein" },
        ],
      }),
      [{ category: "goals", text: "set protein" }],
    );
    assert.deepEqual(
      normalizeIntents({
        intents: [{ category: "none", text: "how much protein is in this" }],
      }),
      [{ category: "none", text: "how much protein is in this" }],
    );
  });
});

describe("requiredWriteStepCap", () => {
  it("allows slack beyond the write-category count", () => {
    assert.equal(requiredWriteStepCap(["meal", "goals"]), 4);
    assert.equal(requiredWriteStepCap(["none"]), 2);
  });
});

describe("categoryForTool", () => {
  it("maps log_meal to meal and bash to none", () => {
    assert.equal(categoryForTool("log_meal"), "meal");
    assert.equal(categoryForTool("delete_meal_item"), "meal_delete");
    assert.equal(categoryForTool("bash"), null);
  });
});
