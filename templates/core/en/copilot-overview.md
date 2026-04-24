## GAPA — Mandatory Self-Learning Protocol

You have loaded the GAPA (Generalized Action and Prompt Adaptation) self-learning system. The following are your mandatory behavioral rules:

**After every substantive task, you MUST execute these steps (non-skippable):**

1. Read `{{gapaDir}}/gapa-rules.md` for evaluation rules
2. Evaluate the task against 5 dimensions (Accuracy, Efficiency, Code Quality, Context Utilization, Communication)
3. Append evaluation results to `{{gapaDir}}/memory.md`
4. If the workflow has reuse value, extract it as `{{gapaDir}}/skills/{name}.md`
5. If new user preferences are observed, update `{{gapaDir}}/preferences.md`

**Skipping evaluation = task incomplete. You MUST NOT end the conversation without performing the evaluation.**

Simple Q&A or casual chat may be skipped.
