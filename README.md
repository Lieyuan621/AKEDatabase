# AKEDatabase - 明日方舟：终末地数据库

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![Static](https://img.shields.io/badge/Static-HTML%2FCSS%2FJS-blue)
![Last Commit](https://img.shields.io/github/last-commit/nagiyume/akedatabase)

> 《明日方舟：终末地》非官方数据查询与研究站。项目是无后端、无构建步骤的静态 HTML/CSS/JavaScript 应用；网站代码与游戏数据分离，游戏数据由 Cloudflare R2 提供。

AKEData 面向日常查询、攻略研究和游戏机制分析，当前公开模块以 v3 为主。v3 从完整 `TableCfg` 和 `public/Json` 动态建立实体关系，同时复用经过验证的 v2 页面控制器和样式。

在线站点：[https://www.akedata.wiki](https://www.akedata.wiki)（原 `akedata.top` 已重定向至此）

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
- 首页数据更新时间倒计时、可重复查看的多语言网站公告和公告版本更新自动提醒
- 首页底部展示工信部备案号并链接至备案管理系统

## 当前模块

`plugin/manifest.json` 是模块注册表。`priority` 越小越靠前；`hidden: true` 的模块默认不显示，但可在设置中开启；`disabled: true` 的模块不会进入运行时模块列表。

### 公开模块

| ID | 模块 | 主要数据源 |
|---|---|---|
| `v3_cc` | 危机合约 | TableCfg、SpawnerConfig、BuffData |
| `season_tower` | 战争回响 | SeasonTower、Dungeon、GameMechanic、Reward、Enemy 等 TableCfg，SpawnerConfig、BuffData |
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
├─ ake-sw.js                      # 图片逻辑路径到 R2 的根作用域网络代理
├─ version.json                   # 应用、公告版本、数据域和下次更新时间配置
├─ plugin/
│  ├─ manifest.json               # 顶层模块注册表
│  ├─ v3_*.html                   # v3 模块 DOM 壳
│  ├─ v2_*.html                   # v2 模块 DOM 壳
│  └─ js/
│     ├─ index-app.js             # 模块加载、路由、设置和富文本运行时
│     ├─ ake-data-source.js       # R2 清单、版本选择和逻辑 URL 解析
│     ├─ ake-cache.js             # 按数据域和版本隔离的 fetch 缓存策略
│     ├─ ake-stats.js             # 属性和 modifier 计算
│     ├─ v3-table-data.js         # TableCfg/Json 到 v2 UI 数据契约的适配层
│     └─ <module>.js              # 各模块控制器
├─ theme/
│  ├─ light.css                   # 亮色主题
│  ├─ dark.css                    # 暗色主题
│  ├─ yellow.css                  # 护眼主题
│  └─ <module>.css                # 模块样式
├─ public/
│  ├─ CH/                         # 中文聚合数据、研究文档、i18n、maps 和 tip.md
│  ├─ EN/                         # 英文 i18n、maps 和 tip.md 等语言资源
│  ├─ <语言>/                     # 各语言 i18n.json、maps.json 和网站公告 tip.md
│  └─ TableCfg、Json、images      # 本地开发可保留，但由 .gitignore 排除
├─ tools/
│  ├─ sync-r2.ps1                # 交互式/参数式 R2 发布脚本
│  └─ r2-cors.json               # R2 CORS 配置模板
├─ .kilo/skills/akedatabase/      # Agent 项目知识 skill
├─ .vscode/settings.json          # Live Server 端口配置
├─ LICENSE
└─ README.md
```

## Cloudflare R2 数据发布

生产数据域为 `https://data.akedata.wiki`，Bucket 名称为 `akedatabase`。R2 对象布局如下：

```text
manifest.json
public/
├─ <gameVersion>/<hotfixVersion>/TableCfg/*.json
├─ Json/**
└─ images/**
```

只有 `TableCfg` 按游戏版本和 Hotfix 建立不可变目录；`Json` 与 `images` 始终维护一份当前数据。`manifest.json` 包含所有可选版本、`latest` 指针和共享数据修订号，并在每次发布的最后一步上传。

### 首次配置

1. 在 Cloudflare R2 创建 `akedatabase`，创建仅限该 Bucket 的 Object Read & Write 凭据。
2. 使用 `rclone config` 创建名为 `r2` 的 Cloudflare S3 Remote，并设置 `no_check_bucket = true`。
3. 将 Bucket 自定义源站域绑定到 `r2-origin.akedata.wiki`。
4. 在 Bucket 设置中应用 `tools/r2-cors.json` 对应的 CORS 规则。
5. 在 EdgeOne 添加加速域名 `data.akedata.wiki`，源站设置为 `r2-origin.akedata.wiki`。
6. 在 EdgeOne 为版本化 TableCfg 配置一年节点缓存，为共享 Json/images 配置一天节点缓存，并为 `/manifest.json` 配置不缓存。

凭据只保存在本机 rclone 配置中，不得写入仓库。对象级令牌没有创建 Bucket 的权限，因此脚本始终向 rclone 传递 `--s3-no-check-bucket`。

### 交互式发布

Windows PowerShell 执行策略阻止本地脚本时，使用：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\sync-r2.ps1
```

脚本会提示输入游戏版本、Hotfix、本地数据目录、Remote、Bucket、共享数据同步和 latest 发布选项。正式上传前会显示文件数量、体积和目标路径；默认选择否时只执行 dry-run。

### 参数式发布

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\sync-r2.ps1 `
  -GameVersion 1.4.4 `
  -HotfixVersion 8532974-3-3 `
  -DataRoot .\public `
  -Remote r2 `
  -Bucket akedatabase `
  -SyncShared `
  -PublishLatest `
  -Apply
```

版本目录存在时脚本默认拒绝覆盖。共享目录默认使用增量 `copy`，只有显式传入 `-PruneShared` 才会删除远端多余对象。回滚不需要移动数据，只需重新发布清单并让 `latest` 指向已存在版本。

只修改 `Json` 或 `images` 时使用共享数据模式。该模式不会读取或上传 TableCfg，也不会改变 `latest`；脚本会更新 `sharedRevision`，使网页立即使用新的缓存命名空间：

```powershell
# 先运行并在最后选择“否”，确认 dry-run 计划
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\sync-r2.ps1 -SharedOnly

# 确认无误后正式上传
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\sync-r2.ps1 -SharedOnly -Apply
```

### 本地数据

`version.json` 的 `debugmode` 为 `true` 且版本选择为 `latest` 时，网站使用当前页面同源数据；因此 VS Code Live Server 会读取本地 `/public/TableCfg`、`/public/Json` 和 `/public/images`。本地没有 `manifest.json` 时自动兼容未版本化目录 `/public/TableCfg`。显式选择固定版本时会改用生产数据域中的对应历史版本，并在刷新后保留选择。发布网站前必须将 `debugmode` 恢复为 `false`。

`debugmode` 为 `false` 时，设置弹窗的“请求域名”仍可手动切换数据服务。版本选择默认保存为 `latest`，也可以固定到清单中的某个版本。

## 运行架构

### 应用启动

`index.html` 先以 `no-store` 读取根目录 `version.json`，再以 `appversion` 查询参数依次加载：

1. `plugin/js/index-parse-fallback.js`
2. `plugin/js/i18n.js`
3. `plugin/js/toast.js`
4. `plugin/js/ake-data-source.js`
5. `plugin/js/ake-cache.js`
6. `plugin/js/v3-table-data.js`
7. `plugin/js/index-app.js`

`index-app.js` 读取 `plugin/manifest.json`，过滤禁用模块，按 `priority` 排序，然后生成桌面侧栏和移动端菜单。

设置弹窗中的应用版本和更新时间来自 `version.json`；游戏版本与 Hotfix 来自 R2 `manifest.json` 当前选择的版本。首页不显示版本号，而是读取 `totime` 和 `desc` 显示下次数据更新倒计时及可选更新原因。代码、CSS、模块结构或界面语言文件变化时递增 `appversion`。`debugmode` 为 `true` 时强制使用当前同源本地数据，并在每次刷新时清空持久响应缓存、绕过浏览器缓存。

点击模块后，框架通过 `window.akeFetch` 获取模块 HTML并插入 `#contentArea`。因为动态插入的 `<script>` 不会自动执行，加载器会按 DOM 顺序重新创建脚本节点并等待外部脚本完成。

同一标签页内，模块 HTML、脚本源码和 CSS 按规范化 URL 缓存。再次进入模块时不重复网络获取 JS/CSS，但会从内存源码重新执行控制器以挂载新 DOM。模块 CSS 每个 URL 只创建一次，并按当前模块启用或禁用。

应用资源（模块 HTML、JavaScript、CSS）使用 `appversion` 生成版本 URL，并采用浏览器 `force-cache`。TableCfg 请求解析为当前清单版本的不可变 R2 路径；Json/images 使用 `sharedRevision` 查询参数。网站自身的语言、公告和研究资料继续使用同源 `/public/**` 路径。

### 缓存分层

- localStorage：保存主题、隐藏开关、默认等级、URL 设置、数据域、版本选择和令牌等小型偏好；所有访问都有异常保护。
- 页面内存：缓存模块 HTML、脚本源码、CSS Promise、模块 DOM，以及 v3 已解析的 TableCfg/I18n/maps。
- IndexedDB：数据库 `akedata-data-cache` 使用“数据域 + TableCfg 版本”或“数据域 + sharedRevision”命名空间保存 `akeFetch` 响应；多个版本可以共存。
- Service Worker：根目录 `ake-sw.js` 将绕过 `akeFetch` 的 `/public/images/**` 逻辑请求代理到当前数据域，图片缓存交给浏览器和 EdgeOne。
- HTTP Cache：继续负责版本化的 HTML、JS、CSS 和网络响应。

切换游戏版本不会清空其他版本的 IndexedDB 数据；数据域也属于缓存键，生产数据与本地数据不会混用。IndexedDB、Service Worker 或 localStorage 不可用时，页面自动降级到内存缓存和普通网络请求，不阻止应用启动。`version.json` 与 R2 `manifest.json` 每次启动均使用 `no-store` 请求。

全局设置中的“强制刷新网页缓存”会清空页面内存与 IndexedDB 响应缓存，并以一次性时间戳重新加载当前页面。该操作保留语言、主题、令牌等 localStorage 设置；浏览器 HTTP 缓存通过时间戳 URL 绕过，而不是尝试删除用户的全局浏览器缓存。

Service Worker 首次安装或应用版本更新并取得页面控制权时，会按 `appversion` 在当前会话中执行一次刷新，使 favicon、首页图片等早于缓存脚本发起的 `/public/` 请求也经过 Service Worker。

### 首页公告与倒计时

首页公告和更新倒计时由 `plugin/js/index-app.js` 渲染，配置来自根目录 `version.json`：

| 字段 | 用途 |
|---|---|
| `tipversion` | 公告版本，通常填写公告最后更新时间；值变化后首页自动弹出新公告 |
| `totime` | 下次数据更新时间；未携带时区时按东八区 `UTC+08:00` 解析 |
| `desc` | 数据更新原因；空字符串、纯空格或字段缺失时不显示 |

示例：

```json
{
  "tipversion": "2026-07-16 01:43:08",
  "totime": "2026-07-16 06:30:00",
  "desc": "同步最新游戏数据"
}
```

倒计时每秒以浏览器本地系统时间重新计算。`totime` 可写为不带时区的 `YYYY-MM-DD HH:mm:ss`，此时默认东八区；也可提供 `2026-07-16T06:30:00+08:00` 或带 `Z` 的 ISO 时间。到期后倒计时归零，不显示负数。

每种界面语言从自己的公告文件读取内容：

```text
public/CH/tip.md
public/EN/tip.md
public/<其他语言>/tip.md
```

首页右上角“网站公告”按钮可随时手动打开当前语言公告。浏览器使用 localStorage 键 `akedata-tipversion` 记录已读公告版本；当 `tipversion` 与已读值不同时，进入主页会自动弹出公告，成功加载并显示后才标记为已读。直接通过深链接进入模块时不会立即弹出，返回主页后再检测。

`tip.md` 请求以 `tipversion` 作为 URL 版本参数并保持在网站同源，不进入 R2 游戏数据缓存。更新公告时必须同步更新所有语言的 `tip.md` 并手动修改 `tipversion`；修改倒计时字段不需要改变公告已读状态。

首页底部固定展示备案号 `浙ICP备2026014728号-1`，链接至 `https://beian.miit.gov.cn/#/Integrated/index`。

加载 `/public/**` 数据时，页面顶部按“已加载字节数 / 数据总字节数”显示进度。默认显示进度和总体字节量；开启“显示隐藏模块”后，额外显示当前文件路径、来源（网络、内存或 IndexedDB）以及当前文件字节数。未开启隐藏模块但连续加载超过 3 秒时，也会自动展开这些文件详情。响应尚未提供 `Content-Length` 时显示已加载字节量与不确定进度动画，不再按文件数量估算进度。

Service Worker 位于站点根目录 `/ake-sw.js`，可直接注册根作用域 `/`，Live Server 和生产服务器均无需额外配置 `Service-Worker-Allowed` 响应头。

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
- `public/CH`：简体中文资源目录，包含旧版/v2 聚合数据、研究文档与界面 `i18n.json`。
- `public/EN`：英文界面资源目录。
- `public/TC`：繁体中文资源目录，已补齐独立 `i18n.json` 与 `maps.json`。
- `public/JP`：日文资源目录，已补齐独立 `i18n.json` 与 `maps.json`。
- `public/KR`：韩文资源目录，已补齐独立 `i18n.json` 与 `maps.json`。
- `public/RU`、`MX`、`BR`、`DE`、`FR`、`VN`、`TH`、`ID`、`IT`：其余 TableCfg 语言目录，当前游戏文本已接入对应 `I18nTextTable_*`，但站点界面与枚举的独立本地化仍待完成。
- 每个语言目录的 `tip.md`：首页网站公告正文；公告按钮、倒计时和更新原因标签位于同目录 `i18n.json`。
- `public/images`：模块按固定路径约定组装图片 URL。

副本会通过 `DungeonTable.sceneId` 关联 `LevelData/<sceneId>` 和 `SpawnerConfig/<sceneId>`；SpawnerConfig 中的 `enemyLibrary` 再关联 EnemyTable，出生 Buff 则按 ID 加载 `BuffData/<buffId>.json`。

### i18n 与 Int64

网站界面文案采用显式 key，由每种语言目录下的单一文件统一管理：

```text
public/CH/i18n.json
public/EN/i18n.json
public/<其他语言>/i18n.json
```

这些文件都使用同一套 key 树，并按 `messages.common`、`messages.home`、`messages.version`、`messages.modules.<module>` 等 scope 隔离。启用模块的 HTML 使用 `data-i18n`/`data-i18n-placeholder`，控制器脚本通过 `window.akeI18n.scope('<scope>')` 读取翻译，不再通过中文原文做运行时替换。首页公告按钮使用 `home.announcement`，倒计时和更新原因分别使用 `version.countdown` 与 `version.updateReason`。

游戏 TableCfg 文本与界面文案分离。当前运行时支持以下语言代码：

```text
CH TC EN JP KR RU MX BR DE FR VN TH ID IT
```

其中：

- 对外语言 `CH` 使用 `public/TableCfg/I18nTextTable_CN.json`
- 对外语言 `TC` 使用 `public/TableCfg/I18nTextTable_TC.json`
- 对外语言 `EN` 使用 `public/TableCfg/I18nTextTable_EN.json`
- 其余语言 `XX` 使用 `public/TableCfg/I18nTextTable_XX.json`

其中中文目录名固定为 `CH`，但 TableCfg 后缀仍然是 `CN`。网页完成首次加载后会立即预加载当前语言的 TextTable；`v3-table-data.js` 会复用该 Promise，并为非中文语言的缺失值回退到中文文本。表缓存按语言隔离，避免切换语言后继续复用首次水合的对象。

### 多语言 TODO

- 已完成独立站点翻译：`CH`、`TC`、`EN`、`JP`、`KR`
- 待完成独立站点翻译：`RU`、`MX`、`BR`、`DE`、`FR`、`VN`、`TH`、`ID`、`IT`
- 上述待办语言当前已可加载各自的 `public/TableCfg/I18nTextTable_*` 游戏文本，但 `public/<语言>/i18n.json` 与 `public/<语言>/maps.json` 仍需继续替换为对应语言的独立翻译版本。

TableCfg 文本引用中的 `id` 可能超出 JavaScript 安全整数范围。`v3-table-data.js` 在 `JSON.parse` 前将长整数文本 ID 转为字符串，避免精度丢失，然后递归为 `{ id, text }` 对象填充本地化文本。JSON 中的 `\uXXXX` 会由 `JSON.parse` 自动转换，无需二次解码。

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
- 语言（`CH TC EN JP KR RU MX BR DE FR VN TH ID IT`）
- 是否显示隐藏模块
- 是否显示截图导出按钮
- 角色、武器、敌人和技能默认等级
- 是否保持 URL 同步
- 已解锁的模块令牌
- 已读网站公告版本（`akedata-tipversion`）

保存设置后会广播 `globalConfigChanged`，模块据此刷新筛选和等级显示。语言切换会刷新页面，以重新加载当前语言的模块资源和 TableCfg hydration 缓存。

## 富文本

模块应通过 `window.parseText(text, imageBasePath)` 渲染可能包含游戏标签的文本。

支持的主要格式：

```text
<@styleId>文本</>
<#termId>术语</>
<image="path" scale=1.0>
```

样式和术语分别来自 `public/TableCfg/RichTextStyleTable.json` 与 `public/TableCfg/HyperlinkTextTable.json`。术语文本通过当前语言的 `I18nTextTable` 水合，样式表的 `preDef` 会转换为网页解析器兼容的颜色与图标配置。当前解析器假定数据可信，不应直接用于用户提交的未过滤 HTML。

## 开发新模块

### 注册模块

在 `plugin/manifest.json` 添加：

```json
{
  "id": "your_module",
  "title": "modules.your_module.title",
  "description": "modules.your_module.description",
  "priority": 30,
  "icon": "图标",
  "contentFile": "/plugin/your_module.html",
  "hidden": false
}
```

- `priority` 越小越靠前。
- `hidden: true` 可通过全局设置恢复。
- `disabled: true` 会在加载 manifest 时彻底移除。
- `title` 和 `description` 应填写 i18n key，并在 `public/<语言>/i18n.json` 中统一维护。
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
2. 九个 v3 模块和战争回响专题的列表与详情。
3. 搜索、筛选和默认等级。
4. 合法与非法深链接。
5. 显示隐藏模块后访问 v2 和开发工具模块。
6. 亮色、暗色和护眼主题。
7. 桌面和移动端列表滚动。
8. 副本 SpawnerConfig、波次和 BuffData。
9. 富文本与两层 tooltip。
10. 截图、缓存刷新和 localStorage 设置恢复。
11. 首页倒计时的东八区转换、空 `desc` 隐藏、到期归零。
12. 公告按钮重复查看、`tipversion` 变化自动弹出、各语言 `tip.md` 和移动端右上角布局。

## 已知限制

- v3 是 TableCfg/Json 到 v2 UI 的兼容适配层，数据契约尚无类型或 schema。
- 大型 TableCfg 会整表下载、解析、递归本地化并缓存，首次打开部分模块可能较慢。
- 各语言的 TableCfg 文本已接入，但部分站点界面和枚举仍沿用英文占位翻译。
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
