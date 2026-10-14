# 案例：干员后勤技能的结构化参数

来源：2026-10-14 在 AKEDatabase 本地 TableCfg 中的只读分析。以下是当时的适配证据，不是永久游戏协议；使用前重新查看当前记录、文本和枚举。不要把当时的记录数量固定进程序。

## 关联与素材

| 来源 | 读取内容 |
| --- | --- |
| `SpaceshipCharSkillTable[charId].skillList[]` | `skillId`、`skillIndex`、`unlockHint` |
| `SpaceshipSkillTable[skillId]` | `effectType`、`parameters`、`roomType`、`level`、`name`、`talentName`、`desc`、`icon` |
| `CharacterTable[charId]` | 角色名称及身份 |
| `SpaceshipRoomTypeTable[roomType]` | 舱室名称、图标和颜色 |
| `I18nTextTable_CN[文本id]` | 核对中文名称与描述 |

已有角色模块的参考位置：`plugin/js/v3-table-data.js` 的 `characterManifest`，以及 `plugin/js/v2-character.js` 的后勤技能转换与渲染。当前帝江号数值适配还可查看 `plugin/js/spaceship-skills.js`，但不能把这个适配器当作游戏底层实现的证据。

角色模块使用的素材约定：

- 角色头像：`/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/charroundicon/icon_round_<charId>.png`。
- 后勤技能图标：`/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/spaceship/spaceshipskillicon/<skill.icon>.png`。
- 物品图标：`/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/<item.iconId>.png`，缺少 iconId 时按现有模块约定回退，不另猜命名。

`skillIndex` 可用于识别角色的技能栏位与等级序列。`talentName` 用于技能系列显示，不应单靠显示名称作为稳定去重键。

## 当时核对出的参数位置

表中的参数对象使用 `realType: 0`、`valueType: 0`，数值出现在 `valueFloatList[0]`，部分整数也同时出现在 `valueIntList[0]`。其他类型或列表结构要另行适配。

| effectType | 对照描述得到的含义 | parameters[0] | parameters[1] |
| --- | --- | --- | --- |
| 0 | 全员心情恢复提升 | 比例 | — |
| 1 | 舱室心情消耗降低 | 比例 | — |
| 3 | 培养速度提升 | 比例 | 培养类型 |
| 4 | 线索收集效率提升 | 比例 | — |
| 6 | 指定线索收集概率提升 | 线索编号 | 提升档位 |
| 7 | 制造效率提升 | 比例 | 制造素材类型 |

代表性记录：

- `spaceship_skill_chr_0004_pelica_1_1`：`effectType=0`，参数 `0.08`，文本“所有干员心情恢复提升8%”。
- `spaceship_skill_chr_0020_meurs_2_2`：`effectType=1`，参数 `0.18`，文本“舱室内干员心情消耗降低18%”。
- `spaceship_skill_chr_0005_chen_1_2`：`effectType=7`，参数 `0.2, 2`，文本“武器经验素材的生产效率提升20%”。第二个参数不是额外的 2% 加成。

### 作用对象

- 培养类型可对照 `SpaceshipGrowCabinFormulaShowingTypeTable`，当时 `1/2/3` 分别对应菌类/晶植/矿物。`SpaceshipGrowCabinFormulaTable.type` 也能帮助核对类型与产物关系。
- 线索编号可连接 `SpaceshipClueDataIndex2IdTable`，读取名称、图标和 `roomAttrType`。
- 制造素材类型当时 `1/2` 对应干员/武器经验素材；通过多条技能描述与制造配方的产物、`roomAttrType` 核对，属性表中的对应类型是 `16/17`。这是有来源的显式适配约定，并非技能参数直接写了属性表外键。
- `SpaceshipRoomAttrTypeTable` 的 `type`、`isPercent`、`showRate` 用于舱室属性显示，不能把它的 type 与技能 effectType 按相同数字直接连接，也不能无依据把 showRate 乘到技能加成上。

### 线索概率边界

当时 `SpaceshipConst.collectClueXRateIncreaseList` 为 `[0.1, 0.15]`，技能参数的档位为 `1/2`，描述对应“小幅提升/提升”。

这提示可能存在“档位 → 常量数组”的关联，但没有查看调用代码就不能确认：

- 数组是否使用 `档位 - 1` 索引；
- 数值是概率增量、相对倍率还是抽取权重；
- 最终概率如何归一化或受其他加成影响。

在这些问题未确认前，可按线索编号筛选、按档位排序；不要把档位 1/2 直接展示成最终概率提升 10%/15%。

## 只读核对示例

在允许读取和聚合本地数据时，可用 PowerShell 7 的 `ConvertFrom-Json -AsHashtable` 保留整数文本键并按类型查看样本。先确认当前解析环境保留 Int64；若不确定，改用支持精确整数的解析方式。

```powershell
$skills = Get-Content -Raw -LiteralPath 'public/TableCfg/SpaceshipSkillTable.json' | ConvertFrom-Json -AsHashtable
$texts = Get-Content -Raw -LiteralPath 'public/TableCfg/I18nTextTable_CN.json' | ConvertFrom-Json -AsHashtable
$skills.Values | Group-Object effectType | ForEach-Object {
    $sample = $_.Group[0]
    [pscustomobject]@{
        effectType = $_.Name
        count = $_.Count
        id = $sample.id
        description = $texts[[string]$sample.desc.id]
        parameters = $sample.parameters
    } | ConvertTo-Json -Depth 8 -Compress
}
```

这段只用于定位类型和参数形状。得出映射前还要检查各类型下不同参数长度、作用对象、等级和缺失字段，不能把每组首条样本当作全面核对。
