# AKEDatabase

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![Static](https://img.shields.io/badge/Static-HTML%2FCSS%2FJS-blue)
[![Last Commit](https://img.shields.io/github/last-commit/nagiyume/akedatabase)](https://github.com/nagiyume/AKEDatabase)

> 《明日方舟：终末地》非官方数据查询与研究站。

AKEData 为玩家提供角色、武器、敌人、装备、物品、活动、副本、商店、档案等资料查询，也收录游戏机制研究和一些实用的小工具。项目采用静态 HTML、CSS 和 JavaScript 构建，游戏数据与网站代码分离，并由独立数据域提供。

在线使用：[akedata.wiki](https://www.akedata.wiki)

开发与本地运行说明请参阅 [DEVELOPMENT.md](./DEVELOPMENT.md)。

## 最新版本

当前版本：**1.2.20**

本版本重点更新：

#### 档案库

- 新增“情报采集”档案组视图，可查看组成档案、分析内容与管理员批注，并对这些内容进行版本差异比对。
- 档案详情提供“在 OEM 中查看”入口；情报采集中的档案标题可跳转到原档案，并遵循新标签页打开设置。

#### 数据版本与资产

- 全局设置新增“新增标签数据范围”，可按游戏大版本或热更新版本标记新增内容，也可关闭新增标签；资产模块采用同一范围。
- 资产模块无需 Token 即可访问，游戏地图快速跳转已指向正确的图片目录。
- 修复 IndexedDB 缓存读取，使已缓存的数据不再因数据库打开较慢而反复通过网络获取。

#### 战斗资料

- 战争回响改为选择赛季后再加载对应数据，避免进入模块时一次读取所有赛季。
- 战争回响与副本的怪物属性展示统一采用危机合约的样式，并补齐属性增益来源。
- 危机合约总览补充开放状态与时间信息，优化指标冲突提示。


项目数据由 [data.akedata.wiki](https://data.akedata.wiki) 提供。数据版本会随游戏更新维护。

## 数据合作

AKEData 同时为以下工具和网站提供数据支持：

- [Perlica Bot](https://bot.perlica.tech/)：QQ 机器人与《终末地》游戏助手
- [终末地地图集](https://opendfieldmap.cn/)：地图工具
- [CEP 终末地基质规划器](https://end.canmoe.com/)：基质、精锻和养成规划工具
- [排轴终端 - Endaxis](https://www.end-axis.com/)：排轴模拟器
- [终末地战斗日志](https://zmdlogs.com/)：战斗数据记录和竞速排行
- [终末地一图流](https://ef.yituliu.cn/)：材料价值、性价比、攒抽计算等实用工具

## 赞助支持

赞助将用于服务器维护、功能开发和内容创作。支付宝渠道无法稳定获取赞助者信息，如需署名或添加备注，请通过任意联系方式补充赞助截图。

| 支付宝                                                                    | 微信赞赏码                                                              |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ![支付宝赞赏码](https://data.akedata.wiki/public/images/about/alipay.png) | ![微信赞赏码](https://data.akedata.wiki/public/images/about/wechat.png) |

赞助名单会在网站“关于”页面中手动更新。

## 联系方式

- Bilibili：[@渚汐奏梦](https://space.bilibili.com/694452100)
- 用户反馈群：1091817282
- 项目地址：[nagiyume/AKEDatabase](https://github.com/nagiyume/AKEDatabase)

## 致谢

本项目的建立与完善离不开以下用户/组织的参与：

- [@MoeYinLo](https://github.com/moeyinlo/)：数据解析与运维
- [@ZianTT](https://github.com/ZianTT/)：网站部署及token支持
- [@Lieyuan621](https://github.com/Lieyuan621/)：网站前端UI美化
- [@逻辑元](https://github.com/Arknights-yituliu/)：宣发支持
- [@ZeroAsh](https://github.com/Deliay)：网站语音数据/反向索引数据支持

项目由[CloudFlare](https://www.cloudflare.com/)提供部署支持，并由[EdgeOne](https://cloud.tencent.com/product/teo)提供免费的国内CDN支持

项目使用的AI工具有（按照使用先后顺序排序）：

- [Deepseek](https://www.deepseek.com/): v4
- [Xiaomi-Mimo](https://mimo.mi.com/): v2.5
- [ChatGPT](https://chatgpt.com/)：5.6-luna, 5.6-sol, 6-astra

## 免责声明

本项目是玩家同好项目，与鹰角网络、Gryphline 官方无关。所有商标归各自权利方所有。

项目中的游戏配置、运行数据和相关图片版权归鹰角网络及相关权利方所有。本项目仅供学习、交流和研究，不得用于侵犯权利方权益或其他非法用途。

项目开发中使用了 AI 工具辅助编程，数据和实现可能存在错误，请以游戏内实际表现为准。

项目代码采用 [GNU Affero General Public License v3.0](./LICENSE)。
