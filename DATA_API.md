# data.akedata.wiki 数据调用指南

数据站地址为 [data.akedata.wiki](https://data.akedata.wiki)。个人开发者可以通过 HTTP GET 读取静态 JSON 文件和图片，用于资料查询、机器人或其他个人工具。建议从以下两个清单开始，按清单给出的路径获取所需数据，不依赖目录遍历或猜测文件名。

| 入口 | 用途 |
| --- | --- |
| [manifest.json](https://data.akedata.wiki/manifest.json) | TableCfg 版本清单：查询已发布的游戏版本、热更新版本及对应配置表目录 |
| [asset-sync-index.json](https://data.akedata.wiki/asset-sync-index.json) | Json 与图片的统一资产索引：查询文件路径、大小、MD5、资源版本和部分业务元数据 |

## 通过 manifest.json 选择配置表版本

TableCfg 保存物品、角色、商店、任务、文本等结构化配置表。根清单的主要字段如下：

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 清单结构版本，目前为 `1` |
| `latest` | 当前最新已发布版本的 ID，对应 `versions[].id` |
| `versions[]` | 已发布的 TableCfg 版本列表，不应依赖数组顺序选择最新版本 |
| `versions[].id` | 版本唯一标识，通常为 `gameVersion@hotfixVersion` |
| `versions[].gameVersion` / `hotfixVersion` | 游戏版本与热更新版本 |
| `versions[].tableCfgPath` | 该版本配置表的相对目录；应直接使用此字段拼接路径 |
| `versions[].publishedAt` | 该版本的发布时间 |
| `sharedRevision` / `updatedAt` | 共享资源修订标记与根清单更新时间，不等同于游戏版本 |

读取最新配置表的步骤是：找到 `id === manifest.latest` 的版本记录，再请求 `https://data.akedata.wiki/{tableCfgPath}/{表名}.json`。需要固定版本或进行版本对比时，从 `versions` 中选取对应记录，分别使用各自的 `tableCfgPath`。

根清单列出的是版本和目录，并不枚举每张配置表；资产索引也不承担 TableCfg 表目录的职责。表名和关联字段可参考本项目各模块的实际用表，例如 `ItemTable.json`、`CharacterTable.json`、`I18nTextTable_CN.json`。

## 通过 asset-sync-index.json 查找 Json 与图片

Json 和图片共用一份索引，分别位于 `datasets.json` 与 `datasets.images`，不是两份独立的索引文件。

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 索引结构版本，目前为 `2` |
| `revision` / `updatedAt` | 整份资产索引的修订标记与更新时间 |
| `datasets.json.root` | Json 资源根目录，当前为 `public/Json` |
| `datasets.images.root` | 图片资源根目录，当前为 `public/images` |
| `datasets.<类型>.files` | 以相对路径为键的文件记录集合 |
| `files[路径].size` / `md5` | 文件字节数与内容校验值，可用于判断是否需要重新下载 |
| `files[路径].version` | 文件的资源版本标记，用于追踪来源；不是下载路径，也不保证存在同版本历史副本 |
| `files[路径].meta` | 可选的业务元数据；不同类型文件的字段不同，不替代原始 Json |

下载地址按 `数据站地址 + dataset.root + files 中的相对路径` 拼接。保留大小写，并逐段进行 URL 编码。例如，索引中存在 `GameplayConfig/NpcProxyExDataTable.json` 时，其地址为 [NPC 代理扩展数据](https://data.akedata.wiki/public/Json/GameplayConfig/NpcProxyExDataTable.json)。图片使用同样的拼接方式，从 `datasets.images.files` 中选择实际存在的路径。

`datasets.json` 中包括关卡、关卡脚本、任务运行配置及 GameplayConfig 等数据。部分 `meta` 可以帮助筛选资源：例如 `LevelData` 的对话 ID、阅读引用、档案点位，以及 `LevelScriptData` 的阅读引用。阅读引用中的 `typeId` 可能需要先通过 `ReadingPopUpTable` 转换为正文 `contentId`，再读取 `RichContentTable` 或 `RadioTable`。缺少某个元数据字段不代表原始文件没有相关内容，应检查元数据版本或读取原始文件。

## 最小调用示例

下面的 JavaScript 示例只解析清单、构造资源地址；可在支持 `fetch` 的环境中使用。实际项目应缓存清单，避免每次查询都下载完整资产索引。

```js
const base = 'https://data.akedata.wiki';

async function readJson(path) {
    const response = await fetch(`${base}/${path}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
}

function fileUrl(root, path) {
    const encoded = `${root}/${path}`.split('/').map(encodeURIComponent).join('/');
    return `${base}/${encoded}`;
}

const manifest = await readJson('manifest.json');
const selected = manifest.versions.find(row => row.id === manifest.latest);
if (!selected) throw new Error('latest 对应的版本不存在');
const itemTableUrl = fileUrl(selected.tableCfgPath, 'ItemTable.json');

const index = await readJson('asset-sync-index.json');
const jsonDataset = index.datasets.json;
const npcPath = 'GameplayConfig/NpcProxyExDataTable.json';
const npcUrl = jsonDataset.files[npcPath]
    ? fileUrl(jsonDataset.root, npcPath)
    : null;

// 图片同理：从索引选择真实路径，不根据名称猜测。
const imageDataset = index.datasets.images;
const imagePath = Object.keys(imageDataset.files).find(path =>
    path.startsWith('assets/beyond/dynamicassets/gameplay/ui/sprites/') && /\.png$/i.test(path)
);
const imageUrl = imagePath ? fileUrl(imageDataset.root, imagePath) : null;
console.log({ itemTableUrl, npcUrl, imageUrl });
```

使用时请注意：

- **文本 ID 精度**：配置表里的文本 ID 可能是有符号 64 位整数。JavaScript 的 `response.json()` / `JSON.parse()` 可能丢失精度；处理游戏配置正文时，应先读取响应文本，再使用支持无损整数的解析器，或在 Python 等支持大整数的环境中解析。不要在精度丢失后才转为字符串。
- **本地化文本**：名称和描述常以 `{ id, text }` 保存。`text` 为空时，需要通过精确保留的 `id` 查询同版本的 `I18nTextTable_CN` 等语言表，不能直接认定为无文本。
- **版本范围**：`manifest` 的版本选择针对 TableCfg；Json 与图片由共享资产索引管理。选择历史 TableCfg 不会自动获得同版本 Json、图片，跨来源组合时应检查资源记录并处理字段差异。
- **缓存与增量**：缓存下载结果；清单修订变化后再比较文件记录。`size`、`md5` 没变时通常无需重下正文，但 `meta` 仍可能单独更新，因此也应刷新本地保存的索引元数据。
- **请求失败**：检查 HTTP 状态，限制并发并对临时失败适度退避重试；404 不应当作空表，403 也不表示文件不存在。不要高频重复拉取整份索引或全量资源。

数据版权及使用范围见 [README 免责声明](./README.md#免责声明)。
