# AI Subscription Ledger (Gemini 黑五包年决策账本)

面向个人重度 AI 用户的交互式订阅成本与模型周期率分析工具，采用 Notion 极简白底黑字文档风格，纯原生 HTML/CSS/ES Modules 实现，无需构建步骤，支持离线打开与本地持久化。

## 核心能力

- **12 个月交互式用量日历**：按月自由切换 `Ultra 5x`、`单号 Pro`、`双号 Pro`、`停用`，实时叠加模型生命周期阶段与里拉贬值预测。
- **多区价格与汇率动态折算**：内置土区 App Store 黑五（3,600 TRY）、日区黑五（14,500 JPY）、土区/日区/美区 Ultra 5x 及月付 Pro，支持自定义里拉年化贬值率与 Google 中期二次涨价模拟。
- **模型周期率与期望值 (EV) 引擎**：结合 Gemini 2.5 Pro（至 Claude Sonnet 4.5 约 6 个月、至 Opus 4.5 约 7.5 个月）与 3.1 Pro -> Gemini 4 的实证周期，实时计算盈亏平衡月数、期望净收益与胜率门槛。
- **情景账本对照表与累积成本曲线**：直观对比「现在锁黑五」与「留现金按月买」在 4 种典型剧本下的总支出与差价。

## 本地运行与测试

可直接双击打开 `index.html`，或在项目目录启动任意静态服务：

```bash
# 运行核心账本计算引擎单元测试
node --test tests/calculator.test.mjs

# 启动本地静态预览（可选，需 Python / uv 或 npx serve）
uv run python -m http.server 8765
```
