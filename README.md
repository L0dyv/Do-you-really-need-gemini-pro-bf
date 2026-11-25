# Do You Really Need Gemini Pro Black Friday?

> **AI 黑五包年决策账本** — Do you really need the Gemini Pro Black Friday deal?
>
> 面向个人重度 AI 用户的交互式订阅成本与模型周期率分析工具。采用原生 Notion 极简白底文档风格，零外部构建依赖，支持离线双击运行与本地持久化。

Repository: [`L0dyv/do-you-really-need-gemini-pro-bf`](https://github.com/L0dyv/do-you-really-need-gemini-pro-bf)

## 核心能力

- **5 步向导式决策流**：方案选择 -> 12 个月不买 vs 买黑五并排对照 -> 续费/汇率/附带权益核对 -> 模型周期率与期望值评估 -> 最终账本与导出。
- **Notion Database 风格 12 个月对照表**：左侧单列编辑「不买黑五时的原方案」（支持致空闲 Plan、三大厂多区月付订阅、自定义币种及 6 月调价追汇率），右侧一键开关展开「买黑五后」全年 12 个月黑五 Pro 生效取代与空闲状态；支持鼠标框选、Shift 连选、点空白处或 `Esc` 取消勾选。
- **多币种与里拉贬值引擎**：内置土区 App Store 黑五（3,600 TRY）、日区黑五（14,500 JPY）与自定义多币种年费，按月复利模拟里拉贬值与单订阅年中调价。
- **模型周期率与期望值 (EV)**：结合 Gemini 2.5 Pro -> 3.1 Pro -> Gemini 4 的历史实证周期，计算盈亏平衡月数、期望净收益 (EV)、赔率比与主观把握 vs 数学盈亏线。
- **高清导出套件**：支持直接复制 3x 超清 PNG 图片到剪贴板、导出矢量 SVG 决策卡片、导出可离线分享的单文件 HTML 报告以及纯文本摘要。

## 本地运行与测试

可直接双击打开 `index.html`，或在项目目录启动本地静态服务：

```bash
# 运行核心计算引擎与导出单元测试
node --test tests/calculator.test.mjs

# 启动本地静态预览
uv run python -m http.server 8765
```
