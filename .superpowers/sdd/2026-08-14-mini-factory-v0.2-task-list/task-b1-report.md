# B1 实施报告：版本化本地存档模块

## 实现

- 新增 `game/app/game/game-save.mjs`：提供版本号、默认状态、JSON 解析/序列化、存储读写与清除原语。
- 新增 `game/app/game/game-save.d.mts`：声明 `GameSaveState`、草稿和存储 API 类型。
- 存档固定包含 `version`、`unlockedLevel`、`bestResults`、`drafts`；草稿限定为设计数据形状。
- 解析失败、空值、版本不兼容、字段类型错误或损坏草稿/成绩都会返回全新的默认状态；Node 环境没有 `localStorage` 时也安全回退。

## TDD 记录

1. 先新增 `game/tests/game-save.test.mjs`，覆盖默认状态、读写往返、清除、缺失/非法 JSON/不兼容版本/损坏字段。
2. 首次运行聚焦测试按预期因 `game-save.mjs` 不存在而失败（`ERR_MODULE_NOT_FOUND`）。
3. 写入最小实现后聚焦测试通过，再移除 lint 报告的未使用常量。

## 验证

- `node --test tests/game-save.test.mjs`：4/4 通过。
- `npm test`：54/54 通过，构建成功。
- `npm run lint`：0 errors、0 warnings。

## 范围

未修改 `MiniFactoryGame.tsx` 或 B2–B4 UI 接入代码。
