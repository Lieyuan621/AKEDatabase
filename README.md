# AKEDatabase - 明日方舟：终末地数据库

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![Static](https://img.shields.io/badge/Static-HTML%2FCSS%2FJS-blue)
![Last Commit](https://img.shields.io/github/last-commit/nagiyume/akedatabase)

> 《明日方舟：终末地》非官方数据查询与研究站。项目是无后端、无构建步骤的静态 HTML/CSS/JavaScript 应用，浏览器直接读取仓库中的游戏配置、运行数据和图片资源。

AKEData 面向日常查询、攻略研究和游戏机制分析，当前公开模块以 v3 为主。v3 从完整 `TableCfg` 和 `public/Json` 动态建立实体关系，同时复用经过验证的 v2 页面控制器和样式。

在线站点：[https://akedata.top](https://akedata.top)

## 功能

- 角色、武器、敌人、装备、物品、副本、活动、奖章和危机合约查询
- 名称、ID、稀有度、类型、职业、元素等多维搜索和筛选
- 角色、武器和敌人的等级属性展示
- 副本波次、生成器、出生位置和 Buff 属性计算
- 游戏富文本、术语链接和双层说明浮窗
- 亮色、暗色、护眼三种主题
- 隐藏模块、默认等级、URL 同步和截图导出设置
- 模块和实体深链接
- 桌面与移动端响应式布局

## 当前模块

`plugin/manifest.json` 是模块注册表。`priority` 越小越靠前；`hidden: true` 的模块默认不显示，但可在设置中开启；`disabled: true` 的模块不会进入运行时模块列表。

### 公开模块

| ID | 模块 | 主要数据源 |
|---|---|---|
| `v3_cc` | 危机合约 | TableCfg、SpawnerConfig、BuffData |
| `research` | 研究 | `public/CH/research` Markdown |
| `v3_character` | 角色 | TableCfg、`public/CH/maps.json` |
| `v3_weapon` | 武器 | TableCfg |
| `v3_enemy` | 敌人 | TableCfg |
| `v3_equip` | 装备 | TableCfg、`public/CH/maps.json` |
| `v3_activity` | 活动 | TableCfg |
| `v3_item` | 物品 | TableCfg、`public/CH/maps.json` |
| `v3_dungeon` | 副本 | TableCfg、LevelData、SpawnerConfig、BuffData |
| `v3_achievement` | 奖章 | TableCfg |
| `about` | 关于 | 静态内容、赞助信息 |

### 隐藏模块

- `v2_cc`、`v2_character`、`v2_weapon`、`v2_enemy`、`v2_equip`、`v2_item`、`v2_dungeon`：v2 聚合数据版本，保留用于回归和数据对照，优先级低于 v3。
- `buff`：BuffData 浏览和调试。
- `skill_v2`：SkillData 全量动作节点与时间线调试。
- `spawn`：SpawnerConfig、敌人库和波次调试。
- `hidden-example`：隐藏模块行为测试。

旧版 v1 模块和旧 Skill 模块仍保留文件，但目前在 manifest 中禁用。

## 项目结构

```text
AKEDatabase/
├─ index.html                     # 应用外壳、设置弹窗和全局脚本入口
├─ plugin/
│  ├─ manifest.json               # 顶层模块注册表
│  ├─ v3_*.html                   # v3 模块 DOM 壳
│  ├─ v2_*.html                   # v2 模块 DOM 壳
│  └─ js/
│     ├─ index-app.js             # 模块加载、路由、设置和富文本运行时
│     ├─ ake-cache.js             # 基于版本标记的 fetch 缓存策略
│     ├─ ake-stats.js             # 属性和 modifier 计算
│     ├─ v3-table-data.js         # TableCfg/Json 到 v2 UI 数据契约的适配层
│     └─ <module>.js              # 各模块控制器
├─ theme/
│  ├─ light.css                   # 亮色主题
│  ├─ dark.css                    # 暗色主题
│  ├─ yellow.css                  # 护眼主题
│  ├─ hyperlink.json              # `<#tag>` 术语说明
│  ├─ textstyle.json              # `<@style>` 文本样式
│  └─ <module>.css                # 模块样式
├─ public/
│  ├─ TableCfg/                   # 全量游戏配置表，v3 主事实源
│  ├─ Json/
│  │  ├─ BuffData/                # Buff 运行数据
│  │  ├─ SkillData/               # 技能动作、时间线和黑板参数
│  │  ├─ SpawnerConfig/           # 场景生成器、敌人库和波次
│  │  └─ LevelData/               # 场景与关卡详细数据
│  ├─ CH/                         # 旧版/v2 中文聚合数据、研究文档和 maps.json
│  ├─ EN/                         # 有限的英文资源，尚非完整语言镜像
│  └─ images/                     # 游戏图片素材
├─ .kilo/skills/akedatabase/      # Agent 项目知识 skill
├─ .vscode/settings.json          # Live Server 端口配置
├─ LICENSE
└─ README.md
```

## 运行架构

### 应用启动

`index.html` 依次加载：

1. `plugin/js/index-parse-fallback.js`
2. `plugin/js/toast.js`
3. `plugin/js/ake-cache.js`
4. `plugin/js/index-app.js`

`index-app.js` 读取 `plugin/manifest.json`，过滤禁用模块，按 `priority` 排序，然后生成桌面侧栏和移动端菜单。

点击模块后，框架通过 `window.akeFetch` 获取模块 HTML并插入 `#contentArea`。因为动态插入的 `<script>` 不会自动执行，加载器会按 DOM 顺序重新创建脚本节点并等待外部脚本完成。

### v3 数据适配

v3 当前采用兼容层设计，而不是重复实现九套 UI：

1. `plugin/v3_<module>.html` 加载 `v3-table-data.js`。
2. 页面调用 `window.AKEV3.activate('<module>')`。
3. 对应 v2/旧版控制器照常请求 manifest 和详情。
4. v3 请求拦截器动态读取完整 TableCfg 和 Json 数据，生成内存中的兼容响应。
5. 既有控制器负责筛选、渲染、交互和深链接。

虚拟详情路径形如：

```text
/__v3/character/chr_0002_endminm.json
/__v3/enemy/eny_0045_agtrinit.json
/__v3/dungeon/indie_group_ccdg.json
```

这些 URL 不对应磁盘文件，由 `v3-table-data.js` 返回内存 `Response`。

### 数据职责

- `public/TableCfg`：角色、物品、副本、活动、奖励、技能补丁等完整结构化表。
- `public/Json`：TableCfg 无法完整表达的 Buff、SkillData、SpawnerConfig 和 LevelData。
- `public/CH`：旧版/v2 的预聚合中文数据；v3 仍使用 `maps.json` 的枚举和属性映射。
- `public/images`：模块按固定路径约定组装图片 URL。

副本会通过 `DungeonTable.sceneId` 关联 `LevelData/<sceneId>` 和 `SpawnerConfig/<sceneId>`；SpawnerConfig 中的 `enemyLibrary` 再关联 EnemyTable，出生 Buff 则按 ID 加载 `BuffData/<buffId>.json`。

### 中文与 Int64

v3 默认使用：

```text
public/TableCfg/I18nTextTable_CN.json
```

TableCfg 文本引用中的 `id` 可能超出 JavaScript 安全整数范围。`v3-table-data.js` 在 `JSON.parse` 前将长整数文本 ID 转为字符串，避免精度丢失，然后递归为 `{ id, text }` 对象填充中文。JSON 中的 `\uXXXX` 会由 `JSON.parse` 自动转换，无需二次解码。

目前尚未实现运行时语言切换，也未合并 `I18nHotFix.json`。

## 本地运行

项目没有 npm 依赖和构建步骤。由于模块和数据使用 `fetch`，必须通过 HTTP 服务运行，不能直接使用 `file://` 打开。

### VS Code Live Server

仓库的 `.vscode/settings.json` 将端口设为 `5501`。从仓库根目录启动 Live Server 后访问：

```text
http://localhost:5501/
```

### Python

```powershell
python -m http.server 5501
```

然后访问：

```text
http://localhost:5501/
```

必须以仓库根目录作为站点根。项目大量使用 `/plugin/...`、`/theme/...` 和 `/public/...` 根绝对路径，不支持未经配置的子路径部署。

截图功能通过 CDN 加载 `html2canvas`；离线环境下普通查询仍可使用，但截图可能不可用。

## URL 路由

```text
/?plugin=<模块ID>
/?plugin=<模块ID>&id=<条目ID>
```

示例：

| URL | 说明 |
|---|---|
| `/?plugin=v3_character` | 打开角色模块 |
| `/?plugin=v3_character&id=chr_0002_endminm` | 定位到管理员 |
| `/?plugin=v3_enemy&id=eny_0045_agtrinit` | 定位到三位一体 |
| `/?plugin=v3_cc&id=indie_contract001` | 打开危机合约赛季 |
| `/?plugin=v3_dungeon&id=indie_group_ccdg` | 打开危机合约副本系列 |

路由使用 `history.replaceState`。设置中的“保持 URL 完整”关闭后，初始深链接仍能读取，但页面会清理地址栏参数。

## 全局设置

主设置入口是 `index.html` 中的设置弹窗，不是 `plugin/settings.html`。

设置通过 localStorage 保存：

- 主题
- 是否显示隐藏模块
- 是否显示截图导出按钮
- 角色、武器、敌人和技能默认等级
- 是否保持 URL 同步
- 已解锁的模块令牌

保存设置后会广播 `globalConfigChanged`，模块据此刷新筛选和等级显示。

## 富文本

模块应通过 `window.parseText(text, imageBasePath)` 渲染可能包含游戏标签的文本。

支持的主要格式：

```text
<@styleId>文本</>
<#termId>术语</>
<image="path" scale=1.0>
```

样式和术语分别来自 `theme/textstyle.json` 与 `theme/hyperlink.json`。当前解析器假定数据可信，不应直接用于用户提交的未过滤 HTML。

## 开发新模块

### 注册模块

在 `plugin/manifest.json` 添加：

```json
{
  "id": "your_module",
  "title": "模块名称",
  "description": "模块说明",
  "priority": 30,
  "icon": "图标",
  "contentFile": "/plugin/your_module.html",
  "hidden": false
}
```

- `priority` 越小越靠前。
- `hidden: true` 可通过全局设置恢复。
- `disabled: true` 会在加载 manifest 时彻底移除。
- `settings` 是保留 ID，不会作为普通模块显示。

### HTML、CSS 和控制器

模块 HTML 通常包含：

```html
<link rel="stylesheet" href="/theme/your_module.css">
<div class="your-module">...</div>
<script src="/plugin/js/your-module.js"></script>
```

控制器建议使用 IIFE，并遵循以下运行时约定：

- 请求资源使用 `window.akeFetch || fetch`，不要绕过缓存和 v3 拦截层。
- 初始化前可等待 `window.configLoaded`。
- 配置变化监听 `globalConfigChanged`。
- 富文本使用 `window.parseText`。
- 数值调试提示使用 `window.renderRawValueTip`。
- 条目导航使用 `window.__akeRouter.updateUrl(moduleId, id)`。
- manifest 加载后处理并清空 `window.__deepLinkId`。
- 同时验证桌面和小于 1000px 的移动端布局。

### 新增 v3 适配器

若继续使用当前 v3 架构：

1. 在 `plugin/js/v3-table-data.js` 实现 manifest 和 detail adapter。
2. 将适配器加入 `adapters`。
3. 扩展请求正则和 `MODULE_ALIASES`。
4. 创建 `plugin/v3_<module>.html`。
5. 确保适配结果严格符合复用控制器的数据契约。
6. 检查关联的 TableCfg、Json 和图片路径。
7. 验证 Int64 文本引用、排序、隐藏项和深链接。

## 验证

仓库当前没有自动测试、lint、打包工具或 CI。提交前至少执行：

```powershell
python -m json.tool "plugin/manifest.json" > $null
git diff --check
git status --short
```

浏览器回归至少覆盖：

1. 公开模块列表顺序。
2. 九个 v3 模块的列表和详情。
3. 搜索、筛选和默认等级。
4. 合法与非法深链接。
5. 显示隐藏模块后访问 v2 和开发工具模块。
6. 亮色、暗色和护眼主题。
7. 桌面和移动端列表滚动。
8. 副本 SpawnerConfig、波次和 BuffData。
9. 富文本与两层 tooltip。
10. 截图、缓存刷新和 localStorage 设置恢复。

## 已知限制

- v3 是 TableCfg/Json 到 v2 UI 的兼容适配层，数据契约尚无类型或 schema。
- 大型 TableCfg 会整表下载、解析、递归本地化并缓存，首次打开部分模块可能较慢。
- 当前中文固定为 CN，没有完整多语言切换。
- 路由使用 `replaceState`，没有完整的浏览器历史导航生命周期。
- 动态模块没有统一卸载钩子，长期运行时需注意全局监听器和动态样式。
- `optionalJson` 对缺少的 LevelData/SpawnerConfig 静默降级为基础 TableCfg 展示。
- 根绝对路径使项目默认要求部署在域名根路径。
- 客户端令牌和隐藏设置仅是 UI 门槛，不是安全边界。

## 许可证与版权

项目代码采用 [GNU Affero General Public License v3.0](./LICENSE)。通过网络提供基于本项目的修改版本时，需要遵守 AGPL-3.0 的源代码公开要求。

项目中的游戏配置和运行数据（`public/TableCfg`、`public/Json`、`public/CH`）以及游戏相关图片（`public/images`）版权归鹰角网络及相关权利方所有。本项目仅供学习、交流和研究，不得用于侵犯权利方权益或其他非法用途。

本项目是同好项目，与鹰角网络和 Gryphline 官方无关。所有商标归各自权利方所有。

## 数据合作

- [Perlica Bot](https://bot.perlica.tech/)：QQ 机器人与《终末地》游戏助手
- [终末地地图集](https://opendfieldmap.cn/)：地图工具
- [CEP 终末地基质规划器](https://end.canmoe.com/)：基质、精锻和养成规划工具
- [排轴终端 - Endaxis](https://www.end-axis.com/)：排轴模拟器
- [终末地战斗日志](https://zmdlogs.com/)：战斗数据记录和竞速排行

## 赞助支持

您的赞助将用于服务器维护，功能开发，内容创作。

| 支付宝 | 微信赞赏码 |
| --- | --- |
| ![](https://github.com/NagiYume/AKEDatabase/blob/main/public/images/about/alipay.png) | ![](https://github.com/NagiYume/AKEDatabase/blob/main/public/images/about/wechat.png) |


## 联系方式

- Bilibili：[@渚汐奏梦](https://space.bilibili.com/694452100)
- 用户反馈群：1091817282
- GitHub：[nagiyume/AKEDatabase](https://github.com/nagiyume/AKEDatabase)

项目开发中大量使用了 AI 工具辅助编程。数据和实现可能存在错误，请以游戏内实际表现为准。
