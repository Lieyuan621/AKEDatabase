# AKEDatabase - 明日方舟：终末地 数据库

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![Static Badge](https://img.shields.io/badge/Static-HTML%2FCSS%2FJS-blue)
![Last Commit](https://img.shields.io/github/last-commit/nagiyume/akedatabase)

> 《明日方舟：终末地》非官方数据查询工具，纯前端实现，动态加载，响应式设计。
> 注意：本项目大量使用了AI工具辅助编写代码。

## 项目简介

AKEData 是一个专为《明日方舟：终末地》玩家制作的数据查询网站。它采用模块化设计，无需后端，所有数据通过静态 JSON 文件提供，支持主题切换、隐藏模块显示、等级筛选、超链接浮窗、截图导出等功能。界面简洁，数据详尽，适合用于攻略查阅和游戏研究。

**项目特点：**
- **主题切换** – 亮色/暗色/护眼三种主题，保护视力
- **模块化加载** – 根据 `manifest.json` 动态加载武器、角色、敌人、装备、物品等模块
- **多维筛选** – 支持按稀有度、类型、属性、职业等筛选数据
- **超链接浮窗** – 点击游戏内标签（`<#tag>`）显示详细说明，双层浮窗支持
- **导出长图** – 一键截图当前内容，分享攻略
- **响应式布局** – 适配手机、平板、PC 端
- **全局设置** – 控制隐藏内容、默认显示等级、导出按钮、URL同步等
- **URL路由** – 支持通过URL参数直接跳转到指定模块和条目，方便分享和收藏

## 在线预览

你可以通过以下方式体验：
- 本地运行（见下方快速开始）
- 或访问[在线网站](https://akedata.top)

## 项目结构

```
AKEData/
├── index.html               # 主入口
├── plugin/                  # 模块 HTML 文件
│   ├── manifest.json        # 模块清单
│   ├── weapon.html
│   ├── character.html
│   ├── enemy.html
│   ├── equip.html
│   ├── achievement.html
│   ├── dungeon.html
│   ├── item.html
│   └── about.html
│   └── ...
├── theme/                   # 主题样式
│   ├── light.css
│   ├── dark.css
│   ├── yellow.css           # 护眼模式
│   ├── hyperlink.json       # 超链接标签配置
│   ├── textstyle.json       # 样式标签配置
│   └── [module].css         # 各模块专用样式
└── public/                  # 静态资源
    ├── images/              # 通用图片（游戏内素材）
    └── CH/                  # 中文数据（游戏数据，多语言预留）
        ├── weapon/
        ├── character/
        ├── enemy/
        ├── equip/
        ├── achievement/
        ├── dungeon/
        └── item/
        └── ...
```


## 快速开始

### 本地运行
1. 克隆仓库：
   ```bash
   git clone https://github.com/nagiyume/AKEDatabase.git
   cd AKEDatabase
   ```
2. 使用任意 HTTP 服务器运行，如LiveServer（由于 fetch 本地文件，必须通过服务器）
3. 浏览器访问 `http://localhost:8080`（或对应端口）

### 数据更新

如需更新游戏数据，替换 `public/CH/` 对应目录下的 JSON 文件即可。请确保数据结构与模块解析逻辑匹配。

本项目的数据由NaGiYuMebot自动维护，确保始终与游戏最新数据保持一致

## URL路由

AKEData 支持通过 URL 查询参数直接访问指定模块和条目，方便用户收藏和分享特定内容。

### 基本格式

```
http://localhost:5501/?plugin=<模块ID>
http://localhost:5501/?plugin=<模块ID>&id=<条目ID>
```

### 示例

| URL | 说明 |
|---|---|
| `/?plugin=v2_character` | 打开角色模块 |
| `/?plugin=v2_character&id=chr_0002_endminm` | 打开角色模块并定位到管理员 |
| `/?plugin=skill_v2&id=buff_abilityentity_interact_bomb_passive` | 打开Skill模块并定位到指定条目 |
| `/?plugin=v2_weapon&id=wpn_0001_sword` | 打开武器模块并定位到指定武器 |

### 支持的模块ID

| 模块ID | 模块名称 | 条目ID示例 |
|---|---|---|
| `v2_character` | 角色 | `chr_0002_endminm` |
| `v2_weapon` | 武器 | `wpn_0001_sword` |
| `v2_enemy` | 敌人 | 敌人templateId |
| `v2_equip` | 装备 | 装备suitID |
| `v2_item` | 物品 | 物品itemId |
| `v2_dungeon` | 副本 | 副本templateId |
| `skill_v2` | Skill (V2) | 技能id |
| `buff` | Buff | buff id |
| `character` | 角色（旧版） | `chr_0002_endminm` |
| `weapon` | 武器（旧版） | 武器weaponId |
| `enemy` | 敌人（旧版） | 敌人templateId |
| `equip` | 装备（旧版） | 装备suitID |
| `item` | 物品（旧版） | 物品itemId |
| `dungeon` | 副本（旧版） | 副本templateId |
| `skill` | Skill（旧版） | 技能id |
| `activity` | 活动 | 活动activityId |
| `achievement` | 奖章 | 奖章categoryId |
| `spawn` | 生成 | 生成组id |

条目ID来自各模块manifest.json中的对应字段（如`charId`、`suitID`、`templateId`、`itemId`、`weaponId`、`id`等），或对应contentFile路径中的文件名（不含`.json`扩展名）。

### URL同步设置

在全局设置中，「保持URL完整」选项控制地址栏行为：

- **开启（默认）**：点击模块和条目时，地址栏URL会随之更新，方便复制当前页面链接分享
- **关闭**：地址栏始终显示干净的根路径，不显示查询参数；但通过URL直接访问的内容仍会正常加载

## 模块开发指南
如果你希望扩展新模块，请遵循以下规范：

1. 在 `plugin/manifest.json` 中添加模块条目，包含 `id`、`title`、`contentFile`、`priority`、`hidden`（可选） 等字段。
2. 创建模块 HTML 文件（如 `plugin/yourmodule.html`），结构参考已有模块。
3. 编写模块专用 CSS 文件（`theme/yourmodule.css`），使用 CSS 变量以保证主题适配。
4. 在模块脚本中遵循 IIFE 模式，监听 `globalConfigChanged` 事件，实现筛选、搜索、等级控制等功能。
5. 所有可能包含标签的文本必须通过 `window.parseText(text, baseImagePath)` 处理，以支持超链接浮窗。

## 开源许可证
本项目代码采用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 许可证。
>AGPL 是强 copyleft 许可证，要求任何基于本项目的网络服务也必须公开其源代码。
>你可以自由使用、修改、分发本项目代码，但必须遵守 AGPL-3.0 的条款，包括保留版权声明、修改声明，并在提供网络服务时发布完整源代码。

#### 数据与图片版权声明：

项目内所有游戏数据（`public/CH/` 、 `public/Json/` 、 `public/Json/` 目录下的 JSON 文件）及游戏相关图片（`public/images/`）版权归 **鹰角网络** 所有。

本项目仅供学习交流，严禁用于商业用途。数据来源于游戏正式服客户端，未经官方授权，请勿用于非法用途。

详见 [LICENSE](./LICENSE) 文件

## 数据合作

本项目同时也为以下工具/网站提供数据支持：

[Perlica Bot](https://bot.perlica.tech/) – QQ机器人，《明日方舟:终末地》游戏助手。
[终末地地图集](https://opendfieldmap.cn/) – 《明日方舟:终末地》地图工具。
[CEP 终末地基质规划器](https://end.canmoe.com/) – 《明日方舟:终末地》基质刷取、角色攻略资源站。
[排轴终端 - Endaxis](https://www.end-axis.com/) – 《明日方舟:终末地》排轴模拟器。
[终末地战斗日志](https://zmdlogs.com/) – 《明日方舟:终末地》战斗数据记录工具，竞速排行网站。

## 赞助支持

您的赞助将用于服务器维护，功能开发，内容创作。

| 支付宝 | 微信赞赏码 |
| --- | --- |
| ![](https://github.com/NagiYume/AKEDatabase/blob/main/public/images/about/alipay.png) | ![](https://github.com/NagiYume/AKEDatabase/blob/main/public/images/about/wechat.png) |

## 联系方式
- Bilibili：[@渚汐奏梦](https://space.bilibili.com/694452100)
- 用户反馈群：1091817282
- 项目地址：[GitHub](https://github.com/nagiyume/AKEDatabase)

## 免责声明
本网站为同好爱好者项目，与鹰角网络和 Gryphline 官方无关。所有商标权利均归属其各自所有者。数据仅供参考，如有错误欢迎反馈。 
