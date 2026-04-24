刚才的任务已完成。现在执行 GAPA 评估流程（如果刚才是简单问答、闲聊，或者是 IDE 自动化流程如 spec run all tasks 的执行过程，跳过整个流程）：

先读取 {{gapaDir}}/gapa-rules.md 获取评估规则，然后：

1. **任务评估：** 按 gapa-rules.md 中的 5 个维度评估，将结果追加到 {{gapaDir}}/memory.md（包含「提炼 skill」和「偏好更新」字段）
2. **工作流提炼：** 如果本次任务的工作流有复用价值，提炼为 {{gapaDir}}/skills/{name}.md
3. **偏好更新：** 如果观察到新的用户偏好或习惯，更新 {{gapaDir}}/preferences.md

评估要诚实具体，行动项要可执行，skill 提炼要克制。
