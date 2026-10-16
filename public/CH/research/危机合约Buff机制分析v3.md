# 危机合约 Buff 机制分析 v3

> 本文接续研究模块的《危机合约Buff机制分析v2》，重点分析 v2 未收录的 Buff 及其实现链路。
> 整理日期：2026-10-15。依据本地 TableCfg 与 BuffData 静态配置；未进行游戏内实测。

## 一、这次新增的是什么

v2 的重点是寒冷附着、冻结、技能伤害削减和若干尚无正式词条入口的机制。当前本地数据出现了更复杂的技能轮转约束：封印会在队伍中传递，连携技可以被计数、锁定或追加触发，敌方则出现了按技能次数破除的护盾、异常免疫轮换以及失衡节点强化。

这里的“新增”严格指 **v2 文中未出现的 Buff ID**，不等于“本次游戏更新首次加入”，也不等于“当前赛季全部实装”。同一机制往往拆成主 Buff、计数器、延迟结算和表现标记，不能把文件数当作独立词条数。

| 对照项目 | 本次本地读取结果 | 解释 |
|---|---|---|
| `public/Json/BuffData/buff_cc*.json` | 306 个 | 包括 `buff_cc02*`；不把仅在名称中间含有 cc 的普通 Buff 混入统计 |
| v2 已出现、当前仍存在的 ID | 97 个 | 作为旧机制基线，不再逐条重写 |
| v2 未出现的 ID | 209 个 | 包括新机制、旧机制变体、敌人专属标记和内部子 Buff |
| `CcTagTable` | 46 条 | 当前本地记录没有 `tagTerms`，不能由此取得 Buff 外键和词条覆盖值 |
| `GlobalBuffData` | 本地未提供 | Buff 内可以读到 Global Buff 引用，但无法继续核对其分发与参数 |

**数值读法：**下文标注“默认”的数值来自 BuffData。创建子 Buff 时的显式传参优先于子 Buff 自己的默认值；若关卡、词条或 Global Buff 还有覆盖，必须继续以实际入口为准。当前不能确认的数据不补成正式词条数值。

**证据读法：**章节标题是机制归纳，除明确注明的表内名称外，不是拟造的游戏词条名。事件编号、标签与目标选择器没有完整枚举时，只描述能读出的筛选、赋值和关联，不把文件名当作行为证据。JSON 中多个事件块也不代表它们按文件排列顺序连续执行。

## 二、封印：队伍计数、传递与附加惩罚

### 2.1 封印由队伍计数触发

**主要入口：**`buff_cc_chr_seal_listener`、`buff_cc_seal_point`、`buff_cc_chr_seal`。

监听器筛选技能类型 `[2,6,7]`，随后对队伍成员增加 `buff_cc_seal_point`。检查持有者的计数达到 4 后，创建 `buff_cc_chr_seal`，并清除队伍中的计数标记。

这条链路的关键是：**计数标记分发给队伍，而封印先落到本次触发对应的持有者。**不能据此写成“四名干员各自放四次技能”，也不能直接写成每次施放都会封印全队。技能事件实际触发时点及一项技能是否触发多次，需要结合运行事件确认。

封印入口默认 `delay=1.5`，后续关联 `buff_cc_chr_seal_instance`。这是入口延迟参数，不是“封印只持续 1.5 秒”：实际效果 Buff 的生命周期另外配置。

### 2.2 解除条件会受同类型、同职业与相邻槽位影响

**关联文件：**`buff_cc_chr_seal_coseal`、`buff_cc_chr_seal_disable_same_type`、`buff_cc_chr_seal_disable_same_profession`、`buff_cc_chr_seal_extra_nextslot`。

封印主逻辑会遍历其他队员，并清理符合分支条件的旧封印。启用同类型或同职业标记后，会分别读取双方的角色类型或职业，再比较是否允许清理。相邻槽位分支使用 `SaveSquadSlot` 和 `GetNextAliveBySquadSlot`，将共同封印关联到下一名存活队员。

因此，封印轮转不只是技能冷却问题，也可能受到编队属性与站位顺序影响。“下一槽位”有存活筛选，不宜理解为固定编号的角色；同类型字段也不能不经枚举核对就替换成某个具体职业或元素名。

### 2.3 封印本体与沉默附加项

**主要效果：**`buff_cc_chr_seal_instance`。

封印本体的伤害处理器写入 `ProdCalcZone`，默认修正约为 `-0.9`；另有 `SlowAction(rate=0.5)`。按配置意图，它同时压低输出并限制移动，但与其他乘区叠加后的最终伤害不由这一个数值决定。

本体还按标记选择附加子 Buff：

| 附加项 | 可直接确认的行为 | 需要避免的误读 |
|---|---|---|
| `seal_slience_01_instance` | 施加两个限制标签 | 没有完整标签映射，不能仅凭文件名列出全部被禁用操作 |
| `seal_slience_02_instance` | 施加更多限制标签，并创建 `buff_common_stunned`；另外监听 `buff_common_dash` 相关事件 | 强限制分支还包含眩晕处理，不只是简单延长技能 CD |
| `seal_hp_drain_instance` | 周期扣血、累计记录、结束时治疗 | 不是只有扣血、没有回收逻辑的永久损失 |

源码中的 `slience` 拼写按文件原样保留，检索时不要改成 `silence`。

### 2.4 掉血可以在封印结束后返还

`buff_cc_chr_seal_hp_drain_instance` 每 1 秒触发一次，以最大生命相关属性乘以 `rate` 构造伤害；同时累计 `drained`。退出时读取治疗相关属性，对累计值作除法补偿，再调用 `HealAction`。

重点在于实际创建链的覆盖：

| 来源 | 传入 `rate` | 对应含义 |
|---|---|---|
| `seal_hp_drain_01` 分支 | 约 0.01 | 每次按最大生命值 1% 计入该机制 |
| `seal_hp_drain_02` 分支 | 约 0.03 | 每次按最大生命值 3% 计入该机制 |
| 只看子 Buff 默认 | 0.03 | 会漏掉第一档的 1% 覆盖 |

返还依据是脚本累计值，不是逐次读取实际损失血量的结果；实际伤害、生命下限、治疗修正及提前移除，都可能影响最后可见的血量变化。因此可确认“存在返还治疗”，不能保证任何情况下都原样回满。

### 2.5 闪避也可能参与封印计数

`buff_cc_chr_seal_affix_perfectdodge` 在事件 145 上执行 `ObtainCostAction(costType=1,costValue=-50)`，并复用“队伍增加封印点数 → 达到 4 点 → 施加封印 → 清空点数”的流程。

这里的动作值是负数，不能读成“闪避奖励 50 技力”。文件名指向完美闪避附加项；事件 145 的精确语义和资源扣除边界仍需运行枚举或实测确认。

## 三、连携技：次数、冷却和技力成为独立约束

### 3.1 累计触发后的队伍锁定

**链路：**`buff_cc_chr_combo_lock` → `combo_lock_stack` → `combo_lock_instance`。

主 Buff 监听技能类型 6，读取计数并加 1。达到默认 `max_stack=2` 后，清理队伍计数、给队伍创建默认 10 秒的锁定标记，并调用 `ComboLockAction(duration)`。未达阈值时则给队伍增加计数标记；已有锁定标记时有额外检查。

这与 v2 的“连携技冷却增加若干秒”不同：这里存在独立的队伍锁定窗口。源码还显式排除 `chr_0028_wulfa_combo_2_skill`，不能把这个角色的后续段机械地算成一次新的完整连携。

### 3.2 使用次数推动冷却倍率增长

**链路：**`buff_cc_chr_combo_skill_cd_up_scale_counter_base`、`counter_stack`、`cd_up_scale_stack`、`cd_up_scale`。

计数入口同时处理计数标记、队伍选择和 Global Buff 增删。它提供 `count_max=4`、`stack_max=4` 等默认参数，但由于 GlobalBuffData 缺失，不能据此补写完整词条周期。

实际倍率子 Buff 的计算是明确的：读取 `cd_up_scale_stack` 层数，再计算 `cd = 1 + cd_per_stack × stack`，默认每层系数 0.25，然后刷新属性修正。

| 读到的层数 | 计算出的 `cd` |
|---|---|
| 0 | 1.00 |
| 1 | 1.25 |
| 2 | 1.50 |
| 4 | 2.00 |

这是该字段的运算示例，不是承诺“每放一次连携就增加 25%”，也不把 4 层直接当作所有入口的永久上限。

### 3.3 连携技额外消耗技力

`buff_cc_chr_combo_skill_cost_atb` 通过技能与 Buff 状态判断创建 `buff_cc_chr_combo_skill_cost_atb_effect`。效果文件将默认 `atb=25` 写入属性 107，并监听奖励连携状态的相关 Buff 事件进行清理。

因此这套设计把连携技与技力资源关联起来，并为追加连携设置了例外流程；不能只看到 25 就断言每一段连携动画、每一次追加触发都固定扣除 25。

另一个 `buff_cc_chr_combo_cost_atb` 当前没有相同的执行动作，不能仅凭名字把它与上述链路视为同一个入口。

### 3.4 额外次数、重置 CD、再次触发不是同一个动作

| 文件组 | 主要动作 | 机制区别 |
|---|---|---|
| `combo_skill_extra_time` 与 `extra_time_do_delay` | 计数、重设技能 CD、触发连携 | 带角色专用计数分支，不能概括成所有角色统一多放两次 |
| `combo_skill_extra_trigger` 与 `extra_trigger_do_delay` | 计数后创建短延迟 Buff，再执行 `TriggerComboSkillAction` | 重新触发连携条件，不等于直接执行一次技能伤害 |
| `combo_skill_reset_cd` 与其三个派生文件 | CD 重置、奖励连携状态、延迟触发 | 除 CD 外还维护奖励状态与退出条件 |

这些入口常见默认 `max_cast=2`，延迟文件常见 0.033 秒或 0.033333 秒；`reset_cd` 的部分创建分支还将延迟显式覆盖为约 0.06666 秒。该延迟用于拆分结算窗口，不能把它当作“每 0.033 秒永久自动释放一次连携”。

`combo_skill_reset_cd_extra_state` 中还有一条重新创建技力消耗效果的动作，但 `isEnable=false`。正文不将这条禁用动作计入当前效果。

### 3.5 连携伤害增益与失衡路线偏置

`buff_cc_chr_combo_skill_dmg_up` 以“连携伤害标记”或“当前技能类型为连携”作为条件，向 `ProdCalcZone` 写入默认 `dmg_add=1`。它并非无条件全伤害提升。

另外三种 `poise_except_*` 文件专门修改失衡结算：`comboskill`、`normalskill`、`lastcombo` 分别使用不同伤害掩码判断。其中战技与连携版本同时含默认 `low_rate=-0.6`、`up_rate=2`，重击版本只有默认 `lowerRate=-0.6` 的分支。

它们作用于 `poiseModifier`，不能拿这些数字计算生命伤害。`up_rate=2` 所在的属性运算项与负向分支不同，也不能不看公式就翻译成“失衡效率增加 200%”。

## 四、技能轮转限制与资源联动

### 4.1 同属性技能不能连续作为同一种循环使用

`buff_cc_chr_disable_same_skill_damge_type` 筛选技能类型 `[2,6,7]`，再按伤害类型分支处理：清除队伍原有的五类限制 Buff，然后创建本次伤害类型对应的限制。

五个实际引用分别是 `disable_physical_skill`、`disable_fire_skill`、`disable_pulse_skill`、`disable_cryst_skill`、`disable_natural_skill`。效果文件通过标签表达限制。

这条链路呈现“最后使用的技能伤害类型决定下一轮限制”的结构，而不是五种类型同时永久封锁。实际禁用哪些按钮、特殊技能的伤害类型如何归类，需要由标签和技能定义共同确认。

### 4.2 同一角色与战技轮换

`buff_cc_chr_disable_same_chr_skill` 与 `buff_cc_chr_disable_same_normal_skill` 都会寻找其他队员、统计人数及状态，再创建或清除限制 Buff。它们与按伤害类型限制属于不同维度。

下游 `buff_cc_chr_disable_normal_skill` 包含 `DisableNormalSkillWithUI`，说明限制同时有战技界面处理；`disable_active_skill` 则主要施加多个标签。不能把这些机制都简化为 v2 的固定 8 秒战技公共冷却。

`buff_cc_chr_normal_skill_cd` 虽有默认 `cd=10`，但本地文件没有独立施加冷却的动作；仍需找到读取它的调用方，才能确认该值如何生效。

### 4.3 终结技会干预其他队员的能量获取

`buff_cc_chr_ult_skill_usp_clear` 筛选终结技类型 7，寻找除自身外的队员，再要求目标也持有该 Buff，随后执行 `RefrainObtainUsp(clearUspOnEnd=true)`。

可确认的是“其他满足条件的队员受到能量获取抑制，并配置结束时清理能量”。它没有直接写出“按下终结技按钮的一瞬间，全队所有人的能量立即归零”；清理时点应按该动作的生命周期理解。

### 4.4 技力补发比例

`buff_cc_chr_set_skill_atb_recover_ratio` 监听技力获取事件，筛选获取方式与来源，保存本次值，乘以默认 `skill_ratio=0.5`，再调用 `ObtainCostAction`。

结构上这是对一次获取事件计算附加量，不能仅凭文件名写成“自然回复变为 50%”。当前来源筛选为枚举 `[3,0]`，与 v2 旧入口也不完全相同；补发是否再次进入监听、系统如何阻止重复触发，需要运行语义佐证。

## 五、重击、闪避与主控生存

### 5.1 重击间隔过长，停止技力自然回复

**表内名称：队列：重负。**当前 `CcTagTable` 的 103401 文案为“主控干员12秒内未对敌人造成重击时，暂停技力自然恢复”。这是 v2 正文未出现的词条名称。

对应机制候选为 `buff_cc_chr_no_lastcombo_stop_atb_recover`、`pre`、`countdown`。倒计时文件显式使用字符串事件 `OnBuffFinish`，先检查主控身份，再创建 `global_buff_cc_chr_atb_recoverspeed_down`，传入默认 `ratio=-1`；计时默认 12 秒。主逻辑在符合攻击条件后清理该全局效果。

文案与这条链路相互吻合，但本地表没有 Buff 外键，因此这里标记为**文案与行为对应的候选关联**，不冒充由 `tagTerms` 确认的正式映射。Global Buff 对自然回复的最终处理也不在本地输入中。

### 5.2 不重击还可能逐步积累弱化

另一组 `buff_cc_chr_no_lastcombo_weak`、`pre`、`countdown`、`stack` 使用不同机制：默认倒计时 8 秒，默认最大层数 3；满足主控与伤害掩码条件后，清除队伍的弱化层数并重设倒计时。

主入口传递 `weak_rate=0.3`，子 Buff 自己默认却是 0.2。实际从该入口创建时必须优先读 0.3，不能把子文件的 0.2 当作实际档位。效果落在属性 62 的指定公式项，本文不据此推导未经确认的最终输出损失。

### 5.3 闪避次数限制与定期恢复

`buff_cc_chr_dash_point` 创建 `dash_point_effect`。后者调用 `LimitAndSplitDashCount`，默认次数上限 3，并用 `BlockRecoverDashEnergy` 限制恢复来源，保留允许的恢复标签。

`buff_cc_chr_dash_recover_interval` 则结合闪避次数及 Global Buff 状态检查，触发另一个全局入口；默认参数为 `interval=10`、`recover_count=1`。

这说明“可用次数”和“怎样恢复”是两条独立规则。由于恢复的 Global Buff 缺失，不能直接承诺所有情况下每 10 秒稳定补 1 次，也不能将其解释为 v2 的“禁止冲刺”。

### 5.4 主控受伤后的治疗修正

`buff_cc_chr_main_heal_down_after_take_damage` 在受伤相关事件上检查主控身份，并创建 `buff_cc_chr_heal_down`，传入默认 `heal_scale=-0.9`、`countdown=6`。

子 Buff 通过 `healModifier` 中的 `ModifyHealCalcResult` 修改治疗结算。可确认存在 6 秒计时和 -0.9 修正；治疗修正的作用侧枚举为 0，本文不把它直接扩大为“全队受到的全部治疗都降低 90%”。护盾也不是这条动作明确处理的治疗量。

### 5.5 受伤压低生命上限的新入口

`buff_cc_chr_dmg_reduce_maxhp_enemy_source` 不是全新概念：v2 已分析受伤后降低生命上限，这里补充新增的来源筛选与武器分支。

该入口先检查对象类型与剩余生命，保存伤害上下文；符合武器类型条件时使用默认 `hp_down_ratio_melee=0.3`，其他分支使用 `hp_down_ratio=0.5`。计算出的负值传给旧的 `buff_cc_chr_dmg_reduce_maxhp_instance`，并通过 `SetHpFloor` 包裹创建动作。

当前“队列：衰竭”文案也区分近战与远程的伤害转化率，但参数仍是占位表达式。这里可写出两个默认分支，不能把文案占位符当作已经取得正式关卡数值。

## 六、自然附着与腐蚀的新变体

### 6.1 战技与连携引发自然附着

`buff_cc_chr_normal_skill_natural_inflict` 与 `combo_skill_natural_inflict` 分别筛选对应技能类型，使用计数子 Buff 和定时标记，在达到条件后调用 `SpellInflictionOnChar`。两者均有默认 `times=1`、`cd=3`。

它们与 v2 的寒冷附着路线类似，但对应的是另一套附着动作。计数门槛和触发间隔需要分别阅读；“每次施放都计数”不等于“每次施放都无间隔追加附着”。

`buff_cc_chr_natural_inflict_extend` 明确匹配 `buff_common_enemy_spell_natural_attached`，将该目标 Buff 的持续时间设为 30 秒。自己的 `duration=9999` 不是附着时长。

### 6.2 腐蚀被替换为带移动惩罚的状态

**链路：**`buff_cc_chr_corruptonchar_mobility_listener` → `mobility_triggered` → `mobility_status`。

监听器检查原状态与主控条件，终止原 Buff 的添加，再创建替代状态。因此它是替换流程，不能把旧腐蚀效果和新效果无条件相加。

替代状态默认 `duration=6`、`def_decrease=-0.2`、`movespeed_scale=0.8`，并创建移动状态子 Buff。子状态每秒在条件满足时将移动系数减少约 0.0333333，再刷新属性；它同时包含一个伤害动作，但该动作 **`isEnable=false`**，不能据此宣称额外持续伤害。

该文件还存在黑板 `duration=20` 与未引用黑板的顶层 `duration=11`。加上父动作的生命周期管理，单看任意一个数值都不足以断言“减速固定持续 20 秒”。

另外，`buff_cc_chr_corruptonchar_extend` 是设置已有状态持续时间的另一入口，默认 15 秒；不应与替换状态的 6 秒混成一个机制。

## 七、敌方异常：适应、轮换与持续时间改写

### 7.1 施加某种异常后，获得对应类型免疫

`buff_cc_eny_immune_same_abnormal` 按异常标签创建相应免疫子 Buff；分支覆盖冻结、燃烧、导电、腐蚀、击飞、击倒、猛击、碎甲，子 Buff 默认持续 20 秒。

这与 v2 的“限制破防或附着的施加频率”不同：此处使用的是**异常结果类型**的免疫标记。附着层数和异常结果不是同一个状态，不能混写成“这 20 秒所有元素附着都无法施加”。

### 7.2 达到计数后清除整组免疫

`buff_cc_eny_immune_same_abnormal_has_max_num` 使用更长的默认 `duration=99`。每个对应事件创建免疫后给 `num` 加 1，达到阈值后将计数归零，并移除八种免疫子 Buff。

这里有一个值得保留的数据细节：虽然黑板包含 `max_num=3`，各分支比较动作实际使用的是**直接数值 3**，不是对 `max_num` 的引用。修改黑板变量本身未必能改变这个门槛。

计数对象是匹配事件，不是源码明确维护的“不同异常种类集合”。实际可能鼓励轮换异常，但不能把它严格表述为“必须三种不同异常才能解除”。

### 7.3 附着设时与异常延时是两条链

`buff_cc_eny_inflict_set_duration` 为多种附着标签执行 `SetBuffDurationAction(operationType=0)`，默认目标值 5 秒。这里是设置时长，不是额外增加 5 秒。

`buff_cc_eny_abnormal_refresh_duration` 则修改异常 Buff 的黑板参数，并创建短延迟的 `abnormal_refresh_duration_instance`。后者读取目标异常的 `duration`，再写回实际计时；默认延长参数为 `extend_duration=5`。

两者一个处理附着计时，一个处理异常参数与实际计时的同步。不能根据“都有 5”就认为它们等价，也不能将 0.1 秒延迟理解成异常本身只持续 0.1 秒。

### 7.4 控制状态下反而减伤

`buff_cc_eny_immobilized_dmg_taken_down` 在指定控制标签满足，或持有 `buff_chr_0027_tangtang_ultskill_debuff` 时，对受伤侧施加默认 `dmg_taken_down=-0.5`，并改变伤害文字样式。

这是一项条件减伤，不是常驻抗性，也不能因为名称含“不能移动”就只检查移动速度是否为零。它的判定来自标签集合及明确列出的角色 Buff。

## 八、敌方回血：持续压制与保命结算

### 8.1 没有指定附着状态时开始倒计时回血

**链路：**`buff_cc_eny_heal_no_inflict` → `countdown` → `do_heal`。

主 Buff 监听两组标签的添加与移除。相关状态出现时，清掉回血与倒计时；相关状态全部消失时，创建倒计时。默认倒计时 5 秒，结束后转入每秒一次、默认按最大生命值 5% 的治疗。

它与 v2 的“数秒没受伤就回血”不能混为一谈：这里的阻断条件是匹配状态，而非任意伤害命中。单纯持续造成伤害，未必能切断这条恢复链。

创建参数也存在差别：初始创建倒计时时传递 `countdown` 和 `hp_ratio`，状态消失分支只传递 `hp_ratio`。如果上游覆盖倒计时长度，后一个分支仍可能回落到子文件的 5 秒默认值。

主文件还专门检查 `buff_eny_0112_jzmonk_cc_wudi`，满足时清理这一套机制。它不是对所有敌人完全相同的一条无条件循环。

### 8.2 保留 1 点生命后分次回复

**链路：**`buff_cc_eny_heal_on_dead` → `undeadable` 与 `do_heal`。

保命子 Buff 调用 `SetHpFloor(floorValue=1)`。主 Buff 在生命达到低值条件且 `do_heal` 尚未置位时，记录已经触发，并创建治疗子 Buff。

治疗子 Buff 先执行 `ratio = ratio / heal_times`，再以每秒一次、最多 `heal_times` 次的形式治疗，结束时移除保命 Buff。

主入口默认传入 `ratio=0.5`、`heal_times=1`，因此不能拿子文件自己的 `heal_times=5` 推导成“默认五次、每次回复 50%”。若某入口传入次数 5，配置意图才是把总比例 0.5 拆成每次 0.1。

`buff_cc_eny_fullhp_on_dead` 当前同样默认传入 `ratio=0.5`，没有因为文件名写着 `fullhp` 就把比例变成 1。它们也不是“每次死亡都无限复活”：主 Buff 有 `do_heal` 防重复标记，重挂后的行为另论。

## 九、次数盾：按技能施放去重

### 9.1 一次技能多段命中，不等于多次扣盾

`buff_cc_eny_numshield` 创建 `buff_cc_eny_numshield_instance`。实例初始化 `shield_num`，匹配伤害掩码后依次检查并保存 `DamageSkillCastId`，再减去一层，刷新次数盾 UI；计数归零时移除自身。

**主要结论：计数带有技能施放标识去重。**同一次施放的连续多段伤害，不能仅凭段数预计破盾速度。真正的计数单位取决于产生的施放标识，独立追加技能是否使用新标识也需要单独核对。

减伤分支使用掩码 8960 和受伤侧 `ProdCalcZone=-9999`。这是针对匹配伤害的强抑制配置，不是“任意来源的全部伤害永久无效”。移除盾的那一次伤害如何结算，还涉及引擎处理顺序。

实例默认一层，主入口默认 `shield_num_max=2`。计算时仍需沿创建动作看实际覆盖，不能只取实例默认。

### 9.2 死亡触发的次数盾扩散

`buff_cc_eny_numshield_on_dead` 在对应事件中寻找其他敌人，创建 `numshield_on_dead_delay`，默认 `add_layers=3`。延迟文件约 0.05 秒后再执行分发；`numshield_on_dead_inst` 负责计数、UI 与再次创建相关效果。

这里存在前后两次目标选择，不能简单描述为“原地生成一个三层盾”。它的设计意图是敌人之间传递或补充次数盾，实际覆盖对象须按两次选择器及当前存活实体计算。

### 9.3 `cc02` 版本不要混算

`buff_cc02_eny_numshield` 使用主控条件、伤害掩码和定时标记，并包含失衡属性处理。它与上面的技能施放标识去重版本并非同一结构。

因此本文保留它作为独立变体；不能将某一版本的扣层规则直接套到所有名字包含 `numshield` 的文件。

## 十、失衡节点与敌人专属强化

### 10.1 节点数量会进入最大失衡值计算

**核心链：**`buff_cc_eny_poise_knot_num` → `poise_knot_override` → `poise_knot_override_effect` → `poise_knot_max_poise_enhance`。

入口读取节点标记数量并传给效果文件。效果计算 `max_poise_enhance = max_poise_enhance_rate × knot_num`，默认系数 0.2，再作为 `poise_enhance` 传给最大失衡值属性修正。

例如读取到 3 个节点时，传入值为 0.6。这只能说明该修正项的输入，不足以跨越其他公式项直接断言最终失衡槽一定是基础的 1.6 倍。

`poise_knot_break`、`poise_knot_break_effect` 与 `knot_break_enhance` 还关联破节点后的表现、霸体和敌人专属技能强化。所以新增节点不是单纯让失衡槽变长，也可能改变后续攻击行为。

### 10.2 敌人专属入口已关联到公共机制

| 文件组 | 本地能确认的关联 | 尚需继续读取的部分 |
|---|---|---|
| `0097_hsmino2` | 出生入口、节点增量、半血技能、节点破坏强化、距离减伤；另有默认 0.4 的最大失衡值增量入口 | `enhance_skill09_*` 等标记如何改变技能执行 |
| `0113_jzogre` | 出生入口、半血技能、节点增量、距离减伤；半血额外分支引用公共生命流失 Buff | `water_*` 与 `enhance_skill06_*` 的具体技能参数 |
| `0118_klhog` | 出生入口关联节点覆盖与破节点强化 | `enhance_skill04_01` 和 `inskill` 的外部读取方 |
| `0124_kldcap` / `0124_kltdcap` | 出生入口关联距离减伤及节点数量，另有节点增加与破坏强化 | 两种拼写按真实引用保留，不自行统一 ID |
| `0128_babyents` | 出生入口关联节点覆盖与破节点强化；次数盾实例另有其原生次数盾 UI 兼容分支 | 专属技能强化标记的具体执行效果 |
| `0120_klbear` | 多个电场、怒气、咆哮与召唤相关标记文件存在 | 这些文件自身没有相应动作，不能据名称编写倍率或攻击次数 |

“没有内嵌动作”并不意味着无效：技能或关卡脚本可能读取该标记。但在没有追到读取方之前，本文只报告关联，不把标记名翻译成已证实的完整技能效果。

### 10.3 半血清理、控制免疫与多次打断标记

`half_hp_clear_inflict_and_abnormal` 一组包含触发标记、计数、图标与执行文件；真正的清理应看 `effect` 和公共 `clear_inflict_and_abnormal` 的 `FinishBuffAdvanced`，不能只读空的入口标记。

`control_immune_abnormal` 与 `control_immune_full` 也不是同一强度的别名，后者还包含状态检查与清理动作。

`buff_cc_eny_set_multi_times_weakness` 仅提供默认 `interrupt_times=2`，本地文件自身没有消费这一参数的动作。因此当前只能认定它是候选的多次打断配置，不能宣布“所有敌人都必须打断两次”。

## 十一、距离、分组、抗性与环境

### 11.1 主控离开范围后，敌人获得减伤

`buff_cc_eny_mainchar_outzone_dmg_taken_down_effect` 使用队伍查找、主控筛选与距离判断，配合 `delay`、`active`、`icon` 三个子文件。

默认 `check_distance=5`、延迟 1 秒、减伤修正 `dmg_taken_down=-0.9`。另有 `effect_radius=10`，它不应直接替代真正判断用的 5 米参数。状态开启、清理与延迟确认分离，意味着跨边界时不一定立即完成切换。

这条规则检查的是主控位置；不能只用正在造成伤害的队友与敌人的距离判断是否减伤。

### 11.2 距离降伤的新变体

`buff_cc_chr_dmg_down_by_distance_squad` 沿用距离线性插值结构：`dmgdown_scale = dmgdown_max × clamp((d-distance_min)/(distance_max-distance_min),0,1)`。

默认近端 4、远端 10、最大修正 -0.9，因此纯计算上距离 7 时修正为 -0.45。目标不存在时另有归零分支。

这是 v2 已分析机制的新增实现变体，不能再算一种全新“远距离惩罚”。文件使用目标来源枚举 5、6，未经当前枚举定义确认，不能仅由后缀 `squad` 推断距离一定是“主控到队友”。

### 11.3 队伍分组与敌方标记匹配

`buff_cc_chr_set_team_base` 遍历队员并创建 `set_team_1`、`set_team_2`。两个效果文件分别检查敌方相应组标记，再修改伤害结算及文字样式。

主入口默认传递 `dmg_scale=-0.9`，而两个效果文件各自默认是 -0.99。正常沿这个入口读取时，应先采用传入的 -0.9；不应只看末端文件就写成 99% 降伤。

这是一套“我方分组与敌方标记配对”的框架，不是名称意义上的敌我阵营转换；哪组应该攻击哪组仍须完整读取判断条件和关卡分发。

### 11.4 抗性覆盖与无视护盾

`buff_cc_eny_damage_resist` 使用 `OverrideRawAttributeAction`，将五项属性 94、98、96、97、95 覆盖为默认 20。`pre_poisebreak_resist` 使用默认 30，并在事件 21 中移除自身。

这里的动作是**覆盖原始属性**，不能写成在原抗性上统一“再加 20%”。事件 21 的运行含义仍需当前枚举确认，文件名指向失衡前的抗性状态。

`buff_cc_enemy_damage_ignore_shield` 则直接在伤害处理器中挂载 `IgnoreShieldProcessor`。它不通过削减护盾量实现，也不能等同于“伤害是真实伤害”：是否绕过护盾与伤害类型是两个不同维度。

### 11.5 毒雾、陷阱与场地交互

`buff_cc_level_poisen_fog` 具备对象类型、主控与 Buff 状态检查，周期伤害默认参数 `cd=1`、`dmg_ratio=0.05`；`level_immune_poisen_fog` 是相关标记。正文不因存在 5% 就宣称场上所有角色每秒无条件掉血。

`buff_cc_enemy_bananatrap_periodic` 通过随机点查找和 `SpawnAbilityEntity` 生成实体，默认 `interval=5`、`radius_min=3`、`radius=5`。实体碰撞与实际效果还需继续追其定义。

`level_klcommon_mech_listener`、`sign_common`、`sign_klbear` 会检查标记、终止部分 Buff 添加，并根据 Global Buff 状态分支生成实体或发射投射物。`buff_cc_chr_clear_klball` 则包含目标查找与结束实体动作。这些是场地机制链，不能只按普通角色属性 Buff 解释。

`0054_hsmino_ground_area_*` 还存在区域效果、延迟退出和伤害文件：区域入口参数可以覆盖效果文件的默认值；离开后是否延续、实际覆盖目标，都应按延迟文件和目标检查读取。

## 十二、哪些只是 v2 旧机制的补充

| 当前新增文件或表内名称 | 与 v2 的关系 | 本文处理 |
|---|---|---|
| `enemy_inflict_stack_dmg_down*` | v2 已分析“改写：裹附”的按附着层数降低对应伤害 | 新文件拆成五种类型、层数监听和延迟同步，不算首次发现该玩法 |
| `chr_dmg_down_after_consume_inflict` 与 `delay` | v2 已有消耗附着后的伤害降低 | 补充延迟派发结构，不直接采用默认 -0.9 作为正式档位 |
| `chr_dmg_reduce_maxhp_enemy_source` | v2 已有受伤降低生命上限 | 重点补充来源筛选与近远程比例分支 |
| `chr_dmg_down_by_distance_squad` | v2 已有距离越远伤害越低 | 公式近似，但目标来源需要重新确认 |
| 表内“改写：热量汲取” | v2 已讨论寒冷附着触发冻结的内部数据 | 是正式名称与旧机制的比对线索，不因名称未出现就算全新机制 |
| 表内“环境：再构成” | 文案描述特定波次敌人替换 | 属于关卡编成信息，不硬归为新增普通 Buff |
| `chr_atb_recoverspeed_down_icon`、部分 `*_stack` / `*_count` / `*_icon` | 表现或内部状态文件 | 保留索引，不能逐个包装为独立玩家词条 |

附着减伤新链路由 `enemy_inflict_stack_dmg_down` 创建监听器，按类型创建短延迟文件，再读取对应层数、移除旧效果并重建。这里尤其需要区分“状态变化事件”与“延迟后的层数快照”，不能把两者当作严格同步发生。

## 十三、结论与仍待确认的边界

新增机制最明显的变化，是从“降低某项数值”扩展为“限制行动顺序与状态窗口”：封印看队伍计数与传递，连携看追加状态与锁定，次数盾看技能施放标识，异常免疫看分类事件，失衡节点会继续牵动敌人技能强化。

阅读这批数据时，尤其要避免四种误判：把子 Buff 默认值当成实际入口值，把文件名当成最终效果，把禁用动作算入机制，以及把多个事件块的排列当作真实执行顺序。

本文仍未确认的部分包括：缺失的 Global Buff 分发与正式词条覆盖、数字枚举的完整含义、敌人标记的技能读取方、伤害与移除状态的同帧结算顺序，以及实际游戏中的叠加结果。以上边界不影响本文列出的文件、字段和显式引用事实，但限制了对上线范围与最终数值的推断。

## 附录：v2 未出现的 Buff 文件索引

以下索引按当前目录与 v2 正文的完整 ID 对照生成，保留全部 209 个文件，供复查遗漏。它是文件级差异清单，不是 209 条已实装词条。仅按文件名前缀分组便于查找，不以分组名称证明业务归属；实际关联以正文和文件内引用为准。

### 关卡及其他文件（7 个）

- `buff_cc02_eny_numshield`
- `buff_cc_level_immune_poisen_fog`
- `buff_cc_level_klcommon_mech_listener`
- `buff_cc_level_klcommon_mech_sign_common`
- `buff_cc_level_klcommon_mech_sign_klbear`
- `buff_cc_level_poisen_fog`
- `buff_cc_seal_point`

### 干员相关文件（81 个）

- `buff_cc_chr_atb_recoverspeed_down_icon`
- `buff_cc_chr_clear_klball`
- `buff_cc_chr_combo_cost_atb`
- `buff_cc_chr_combo_lock`
- `buff_cc_chr_combo_lock_instance`
- `buff_cc_chr_combo_lock_stack`
- `buff_cc_chr_combo_skill_cd_up_scale`
- `buff_cc_chr_combo_skill_cd_up_scale_counter_base`
- `buff_cc_chr_combo_skill_cd_up_scale_counter_stack`
- `buff_cc_chr_combo_skill_cd_up_scale_stack`
- `buff_cc_chr_combo_skill_cost_atb`
- `buff_cc_chr_combo_skill_cost_atb_effect`
- `buff_cc_chr_combo_skill_dmg_up`
- `buff_cc_chr_combo_skill_extra_time`
- `buff_cc_chr_combo_skill_extra_time_do_delay`
- `buff_cc_chr_combo_skill_extra_trigger`
- `buff_cc_chr_combo_skill_extra_trigger_do_delay`
- `buff_cc_chr_combo_skill_natural_inflict`
- `buff_cc_chr_combo_skill_natural_inflict_stack`
- `buff_cc_chr_combo_skill_reset_cd`
- `buff_cc_chr_combo_skill_reset_cd_delay_trigger`
- `buff_cc_chr_combo_skill_reset_cd_do_delay`
- `buff_cc_chr_combo_skill_reset_cd_extra_state`
- `buff_cc_chr_corruptonchar_extend`
- `buff_cc_chr_corruptonchar_mobility_listener`
- `buff_cc_chr_corruptonchar_mobility_status`
- `buff_cc_chr_corruptonchar_mobility_triggered`
- `buff_cc_chr_dash_point`
- `buff_cc_chr_dash_point_effect`
- `buff_cc_chr_dash_recover_interval`
- `buff_cc_chr_disable_active_skill`
- `buff_cc_chr_disable_cryst_skill`
- `buff_cc_chr_disable_fire_skill`
- `buff_cc_chr_disable_natural_skill`
- `buff_cc_chr_disable_normal_skill`
- `buff_cc_chr_disable_physical_skill`
- `buff_cc_chr_disable_pulse_skill`
- `buff_cc_chr_disable_same_chr_skill`
- `buff_cc_chr_disable_same_normal_skill`
- `buff_cc_chr_disable_same_skill_damge_type`
- `buff_cc_chr_dmg_down_after_consume_inflict`
- `buff_cc_chr_dmg_down_after_consume_inflict_delay`
- `buff_cc_chr_dmg_down_by_distance_squad`
- `buff_cc_chr_dmg_reduce_maxhp_enemy_source`
- `buff_cc_chr_heal_down`
- `buff_cc_chr_inflict_dmg_down`
- `buff_cc_chr_main_heal_down_after_take_damage`
- `buff_cc_chr_natural_inflict_extend`
- `buff_cc_chr_no_lastcombo_stop_atb_recover`
- `buff_cc_chr_no_lastcombo_stop_atb_recover_countdown`
- `buff_cc_chr_no_lastcombo_stop_atb_recover_pre`
- `buff_cc_chr_no_lastcombo_weak`
- `buff_cc_chr_no_lastcombo_weak_countdown`
- `buff_cc_chr_no_lastcombo_weak_pre`
- `buff_cc_chr_no_lastcombo_weak_stack`
- `buff_cc_chr_normal_skill_cd`
- `buff_cc_chr_normal_skill_natural_inflict`
- `buff_cc_chr_normal_skill_natural_inflict_stack`
- `buff_cc_chr_poise_except_comboskill`
- `buff_cc_chr_poise_except_lastcombo`
- `buff_cc_chr_poise_except_normalskill`
- `buff_cc_chr_seal`
- `buff_cc_chr_seal_affix_perfectdodge`
- `buff_cc_chr_seal_coseal`
- `buff_cc_chr_seal_disable_same_profession`
- `buff_cc_chr_seal_disable_same_type`
- `buff_cc_chr_seal_extra_nextslot`
- `buff_cc_chr_seal_hp_drain_01`
- `buff_cc_chr_seal_hp_drain_02`
- `buff_cc_chr_seal_hp_drain_instance`
- `buff_cc_chr_seal_instance`
- `buff_cc_chr_seal_listener`
- `buff_cc_chr_seal_slience_01`
- `buff_cc_chr_seal_slience_01_instance`
- `buff_cc_chr_seal_slience_02`
- `buff_cc_chr_seal_slience_02_instance`
- `buff_cc_chr_set_skill_atb_recover_ratio`
- `buff_cc_chr_set_team_1`
- `buff_cc_chr_set_team_2`
- `buff_cc_chr_set_team_base`
- `buff_cc_chr_ult_skill_usp_clear`

### 敌方通用文件（71 个）

- `buff_cc_enemy_bananatrap_periodic`
- `buff_cc_enemy_common_hp_up_mult`
- `buff_cc_enemy_damage_ignore_shield`
- `buff_cc_enemy_inflict_stack_dmg_down`
- `buff_cc_enemy_inflict_stack_dmg_down_cryst`
- `buff_cc_enemy_inflict_stack_dmg_down_fire`
- `buff_cc_enemy_inflict_stack_dmg_down_natural`
- `buff_cc_enemy_inflict_stack_dmg_down_phy`
- `buff_cc_enemy_inflict_stack_dmg_down_pulse`
- `buff_cc_enemy_inflict_stack_dmg_down_stack_changed_listener`
- `buff_cc_enemy_inflict_stack_dmg_down_sync_delay`
- `buff_cc_enemy_inflict_stack_dmg_down_sync_delay_cryst`
- `buff_cc_enemy_inflict_stack_dmg_down_sync_delay_fire`
- `buff_cc_enemy_inflict_stack_dmg_down_sync_delay_natural`
- `buff_cc_enemy_inflict_stack_dmg_down_sync_delay_phy`
- `buff_cc_enemy_inflict_stack_dmg_down_sync_delay_pulse`
- `buff_cc_eny_abnormal_refresh_duration`
- `buff_cc_eny_abnormal_refresh_duration_instance`
- `buff_cc_eny_clear_inflict_and_abnormal`
- `buff_cc_eny_control_immune_abnormal`
- `buff_cc_eny_control_immune_full`
- `buff_cc_eny_damage_resist`
- `buff_cc_eny_enhance_poise_knot`
- `buff_cc_eny_fullhp_on_dead`
- `buff_cc_eny_half_hp_clear_inflict_and_abnormal`
- `buff_cc_eny_half_hp_clear_inflict_and_abnormal_count`
- `buff_cc_eny_half_hp_clear_inflict_and_abnormal_effect`
- `buff_cc_eny_half_hp_clear_inflict_and_abnormal_icon`
- `buff_cc_eny_heal_no_inflict`
- `buff_cc_eny_heal_no_inflict_countdown`
- `buff_cc_eny_heal_no_inflict_do_heal`
- `buff_cc_eny_heal_on_dead`
- `buff_cc_eny_heal_on_dead_do_heal`
- `buff_cc_eny_heal_on_dead_undeadable`
- `buff_cc_eny_hide_head_bar`
- `buff_cc_eny_hp_half_skill`
- `buff_cc_eny_hp_half_skill_effect`
- `buff_cc_eny_immobilized_dmg_taken_down`
- `buff_cc_eny_immune_same_abnormal`
- `buff_cc_eny_immune_same_abnormal_airborne`
- `buff_cc_eny_immune_same_abnormal_burning`
- `buff_cc_eny_immune_same_abnormal_conduct`
- `buff_cc_eny_immune_same_abnormal_corrupt`
- `buff_cc_eny_immune_same_abnormal_crush`
- `buff_cc_eny_immune_same_abnormal_fracture`
- `buff_cc_eny_immune_same_abnormal_frozen`
- `buff_cc_eny_immune_same_abnormal_has_max_num`
- `buff_cc_eny_immune_same_abnormal_instance`
- `buff_cc_eny_immune_same_abnormal_knockdown`
- `buff_cc_eny_inflict_set_duration`
- `buff_cc_eny_knot_break_enhance`
- `buff_cc_eny_mainchar_outzone_dmg_taken_down`
- `buff_cc_eny_mainchar_outzone_dmg_taken_down_active`
- `buff_cc_eny_mainchar_outzone_dmg_taken_down_delay`
- `buff_cc_eny_mainchar_outzone_dmg_taken_down_effect`
- `buff_cc_eny_mainchar_outzone_dmg_taken_down_icon`
- `buff_cc_eny_numshield`
- `buff_cc_eny_numshield_instance`
- `buff_cc_eny_numshield_on_dead`
- `buff_cc_eny_numshield_on_dead_delay`
- `buff_cc_eny_numshield_on_dead_inst`
- `buff_cc_eny_poise_knot_break`
- `buff_cc_eny_poise_knot_break_effect`
- `buff_cc_eny_poise_knot_max_poise_enhance`
- `buff_cc_eny_poise_knot_num`
- `buff_cc_eny_poise_knot_override`
- `buff_cc_eny_poise_knot_override_effect`
- `buff_cc_eny_pre_poisebreak_resist`
- `buff_cc_eny_set_multi_times_weakness`
- `buff_cc_eny_set_team_1`
- `buff_cc_eny_set_team_2`

### 敌人专属文件（50 个）

- `buff_cc_eny_0054_hsmino_ground_area_corrupt`
- `buff_cc_eny_0054_hsmino_ground_area_corrupt_delay_finish`
- `buff_cc_eny_0054_hsmino_ground_area_corrupt_effect`
- `buff_cc_eny_0054_hsmino_ground_area_dmg`
- `buff_cc_eny_0097_hsmino2_born`
- `buff_cc_eny_0097_hsmino2_enhance_faster`
- `buff_cc_eny_0097_hsmino2_enhance_shooting`
- `buff_cc_eny_0097_hsmino2_enhance_skill09_01`
- `buff_cc_eny_0097_hsmino2_enhance_skill09_02`
- `buff_cc_eny_0097_hsmino2_enhance_skill09_03`
- `buff_cc_eny_0097_hsmino2_enhance_stronger`
- `buff_cc_eny_0097_hsmino2_faster_cd`
- `buff_cc_eny_0097_hsmino2_hp_half_skill`
- `buff_cc_eny_0097_hsmino2_immune_poise`
- `buff_cc_eny_0097_hsmino2_knot_break_enhance`
- `buff_cc_eny_0097_hsmino2_maxpoise_up`
- `buff_cc_eny_0097_hsmino2_maxpoise_up_effect`
- `buff_cc_eny_0097_hsmino2_poise_knot_add`
- `buff_cc_eny_0113_jzgore_knot_break_enhance`
- `buff_cc_eny_0113_jzogre_born`
- `buff_cc_eny_0113_jzogre_enhance_skill06_01`
- `buff_cc_eny_0113_jzogre_enhance_skill06_02`
- `buff_cc_eny_0113_jzogre_extra`
- `buff_cc_eny_0113_jzogre_extra_half_hp`
- `buff_cc_eny_0113_jzogre_hp_half_skill`
- `buff_cc_eny_0113_jzogre_poise_knot_add`
- `buff_cc_eny_0113_jzogre_water_01`
- `buff_cc_eny_0113_jzogre_water_02`
- `buff_cc_eny_0118_klhog_born`
- `buff_cc_eny_0118_klhog_enhance_skill04_01`
- `buff_cc_eny_0118_klhog_inskill`
- `buff_cc_eny_0118_klhog_knot_break_enhance`
- `buff_cc_eny_0118_klhog_poise_knot_add`
- `buff_cc_eny_0120_klbear_electric_enhance_anger_01`
- `buff_cc_eny_0120_klbear_electric_enhance_anger_02`
- `buff_cc_eny_0120_klbear_electric_enhance_anger_03`
- `buff_cc_eny_0120_klbear_electric_field_01`
- `buff_cc_eny_0120_klbear_electric_field_02`
- `buff_cc_eny_0120_klbear_enhance_roar_01`
- `buff_cc_eny_0120_klbear_enhance_roar_02`
- `buff_cc_eny_0120_klbear_summon_klhound`
- `buff_cc_eny_0124_kldcap_enhance_skill_01`
- `buff_cc_eny_0124_kldcap_enhance_skill_02`
- `buff_cc_eny_0124_kldcap_knot_break_enhance`
- `buff_cc_eny_0124_kldcap_poise_knot_add`
- `buff_cc_eny_0124_kltdcap_born`
- `buff_cc_eny_0128_babyents_born`
- `buff_cc_eny_0128_babyents_enhance_skill01_01`
- `buff_cc_eny_0128_babyents_knot_break_enhance`
- `buff_cc_eny_0128_babyents_poise_knot_add`

### 本次输入定位

- 对照文档：`public/CH/research/危机合约Buff机制分析v2.md`。
- 普通 Buff 目录：`public/Json/BuffData/`；上述每个 ID 对应同名 `.json`。
- 词条与文案：`public/TableCfg/CcTagTable.json`、`public/TableCfg/I18nTextTable_CN.json`。
- 本次读取未取得可确认的游戏数据版本号；站点版本号不作为游戏数据版本。
- CcTagTable 文件 SHA-256：`16dab1d93fcb385ec9a4c196ddc911b6202b8adef4bf274bc305892b980d0021`。
- v2 对照文档 SHA-256：`e4045d569e4bf87b8f013e37081575e4174c56f2baf014f04a62390fd5fce994`。
