# 危机合约机制解析 v4：下一期可能出现的 26 条指标

> 整理日期：2026-10-20。本文根据本地游戏配置，参考「重燃测试作战」指标说明的写法，将机制整理成便于阅读的候选条目。
> **以下 26 条均为机制预测，名称为本文拟定，不是官方预告，也不是已确认的下一期指标清单。**同组条目可能被合并为一条指标的不同档位或附加效果，不代表会同时开放。

## 先看条目会怎样改变战斗

v2、v3 主要回答“配置如何实现”；v4 主要回答“选了这条之后，战斗会发生什么”。正文保留触发条件、作用对象、效果和需要注意的例外，每条末尾列出关联 Buff，参数与详细依据保留在附录。

本文参考的说明结构来自重燃测试作战的游戏文案。例如，“队列：重负”先说明主控连续未打出重击的时间条件，再说明技力自然恢复暂停；“改写：热量汲取”明确把寒冷附着替换成冻结；“环境：再构成”明确指出被替换的波次与敌人。官方也在[重燃测试作战内容更新说明](https://www.taptap.cn/moment/818961036416649861)中列出了这些指标。

下文的“条目说明”是按这种结构拟写的机制摘要。“实战含义”是基于机制的分析，不是实测结论。未取得正式档位的次数、比例和时长不填成定值；附录中的默认参数仅帮助理解规模。

## 一、封印与技能轮转

### 01｜队列：封印轮转（拟名）

**条目说明：**队伍施放战技、连携技或终结技会累计封印计数。达到规定次数时，对触发封印的干员施加封印，并清空队伍计数。被封印的干员造成的伤害降低，移动受到限制。

**实战含义：**需要安排谁来承担触发封印的那一次技能，避免主力输出刚进入爆发就被限制。计数由队伍共享，不是每名干员各自攒满才触发；封印解除还可能受其他附加规则影响。

**关联 Buff：**`buff_cc_chr_seal_listener`、`buff_cc_seal_point`、`buff_cc_chr_seal`、`buff_cc_chr_seal_instance`。

### 02｜队列：相邻连封（拟名）

**条目说明：**触发封印时，额外对编队顺序中的下一名存活干员施加共同封印。

**实战含义：**编队顺序也会影响轮转。承担封印的干员与关键输出相邻时，可能一起受到限制。“下一名”会跳过已无法参与的队员，不是永远锁定某个固定槽位。

**关联 Buff：**`buff_cc_chr_seal`、`buff_cc_chr_seal_extra_nextslot`、`buff_cc_chr_seal_coseal`。

### 03｜队列：封印失血（拟名）

**条目说明：**干员处于封印期间，持续按最大生命值的一定比例流失生命；该效果结束时，根据累计记录的流失量进行治疗。

**实战含义：**封印期间的危险来自血量暂时降低，尤其容易被敌人的后续攻击击倒。结束时存在返还治疗，但不保证无论受到什么修正都能原样回满。

**关联 Buff：**`buff_cc_chr_seal_instance`、`buff_cc_chr_seal_hp_drain_instance`、`buff_cc_chr_seal_hp_drain_01`、`buff_cc_chr_seal_hp_drain_02`。

### 04｜队列：连携封锁（拟名）

**条目说明：**队伍连携技累计触发达到规定次数后，全队连携技被锁定一段时间。

**实战含义：**连携不能一直按亮就放，需要为关键打断、失衡或爆发窗口保留次数。这是额外的队伍锁定，不只是每个连携技自己的冷却变长；部分后续段存在计数例外。

**关联 Buff：**`buff_cc_chr_combo_lock`、`buff_cc_chr_combo_lock_stack`、`buff_cc_chr_combo_lock_instance`。

### 05｜队列：连携迟滞（拟名）

**条目说明：**连携技使用计数达到条件时，累积冷却惩罚；惩罚层数越高，连携技冷却时间越长。

**实战含义：**战斗后段可能越来越难维持原本的连携循环。当前无法确认正式条目会如何增长、封顶或清除层数，不能按“每放一次固定增加一层”规划整场时间轴。

**关联 Buff：**`buff_cc_chr_combo_skill_cd_up_scale_counter_base`、`buff_cc_chr_combo_skill_cd_up_scale`、`buff_cc_chr_combo_skill_cd_up_scale_counter_stack`、`buff_cc_chr_combo_skill_cd_up_scale_stack`。

### 06｜队列：连携耗能（拟名）

**条目说明：**受该规则影响的连携技需要额外消耗技力。

**实战含义：**连携技与战技可能争用同一份技力，连续释放连携会挤压后续战技的资源。追加连携存在单独的状态处理，不应把每段动画都当成一次新的扣费。

**关联 Buff：**`buff_cc_chr_combo_skill_cost_atb`、`buff_cc_chr_combo_skill_cost_atb_effect`。

### 07｜队列：终结干扰（拟名）

**条目说明：**干员施放终结技时，其他同样受该规则影响的队员将受到终结技能量获取抑制；抑制动作结束时，清理受影响队员的终结技能量。

**实战含义：**全队终结技可能无法按平时的顺序接力。当前配置支持“抑制获取、结束清理”，不支持把它简化成“按下终结技的瞬间，全队能量立即归零”；具体窗口仍待确认。

**关联 Buff：**`buff_cc_chr_ult_skill_usp_clear`。

## 二、闪避与恢复

### 08｜环境：有限闪避（拟名）

**条目说明：**闪避受到独立次数上限约束，部分闪避恢复来源被禁用，仅保留规则允许的恢复方式。

**实战含义：**连续闪避需要留余量，不能默认沿用平常的恢复节奏。这套机制仍允许闪避，与重燃测试作战的“禁止闪避”不同；周期补充次数的具体规则尚不完整。

**关联 Buff：**`buff_cc_chr_dash_point`、`buff_cc_chr_dash_point_effect`。

### 09｜队列：疗效受扰（拟名）

**条目说明：**主控干员受到伤害后，其提供的治疗在一段时间内受到削弱。

**实战含义：**由治疗干员担任主控时，受击可能影响随后提供的恢复。当前效果位于治疗来源一侧，因此不能写成“主控受到的所有治疗降低”，也不能扩大为全队一律禁疗。

**关联 Buff：**`buff_cc_chr_main_heal_down_after_take_damage`、`buff_cc_chr_heal_down`。

## 三、自然附着与腐蚀

### 10｜队列：战技染蚀（拟名）

**条目说明：**干员施放战技达到规定次数时，主控干员获得一层自然附着。该效果有独立触发间隔。

**实战含义：**施放技能的是队员，承受附着的却是主控。连续使用战技会让主控更容易积累自然附着，但受到触发间隔限制，不是每段技能伤害都附着一次。

**关联 Buff：**`buff_cc_chr_normal_skill_natural_inflict`、`buff_cc_chr_normal_skill_natural_inflict_stack`。

### 11｜队列：连携染蚀（拟名）

**条目说明：**干员施放连携技达到规定次数时，主控干员获得一层自然附着。该效果有独立触发间隔。

**实战含义：**即使不主动消耗战技，连携循环也可能带来附着压力。它与上一条分别监听不同技能，可能成为不同指标或组合规则。

**关联 Buff：**`buff_cc_chr_combo_skill_natural_inflict`、`buff_cc_chr_combo_skill_natural_inflict_stack`。

### 12｜环境：附着滞留（拟名）

**条目说明：**干员受到的自然附着，其持续时间被设置为更长的时间。

**实战含义：**两轮附着之间更容易衔接起来，单靠短暂等待未必能避开后续异常。这处理的是自然附着的持续时间，不等于腐蚀本身持续同样久。

**关联 Buff：**`buff_cc_chr_natural_inflict_extend`、`buff_common_enemy_spell_natural_attached`。

### 13｜环境：腐蚀泥沼（拟名）

**条目说明：**主控干员受到的腐蚀被替换为特殊腐蚀：防御降低，同时受到移动减速；在状态满足条件时，减速进一步加深。

**实战含义：**承受腐蚀后，脱离敌人攻击范围会更困难。该状态是替换原腐蚀，不应把新旧效果重复相加；当前相关持续伤害动作已禁用，因此这里不额外写入持续掉血。

**关联 Buff：**`buff_cc_chr_corruptonchar_mobility_listener`、`buff_cc_chr_corruptonchar_mobility_triggered`、`buff_cc_chr_corruptonchar_mobility_status`。

## 四、敌人的异常应对

### 14｜改写：异常适应（拟名）

**条目说明：**敌人受到指定类型的异常后，在一段时间内免疫同类型异常。不同类型分别判定。

**实战含义：**重复施加同一种异常的收益会受限制，需要考虑不同异常之间的衔接。配置覆盖冻结、燃烧、导电、腐蚀以及击飞、击倒、猛击、碎甲；这不等于同时免疫所有法术附着。

**关联 Buff：**`buff_cc_eny_immune_same_abnormal`、`buff_cc_eny_immune_same_abnormal_airborne`、`buff_cc_eny_immune_same_abnormal_burning`、`buff_cc_eny_immune_same_abnormal_conduct`、`buff_cc_eny_immune_same_abnormal_corrupt`、`buff_cc_eny_immune_same_abnormal_crush`、`buff_cc_eny_immune_same_abnormal_fracture`、`buff_cc_eny_immune_same_abnormal_frozen`、`buff_cc_eny_immune_same_abnormal_knockdown`。

### 15｜改写：适应轮转（拟名）

**条目说明：**敌人受到指定异常后获得对应免疫，并累计触发次数。累计达到规定次数时，清除这一机制提供的各类异常免疫，重新开始计数。

**实战含义：**敌人的抗性会经历“建立免疫—清除免疫”的循环。计数依据是符合条件的异常事件，不能把解除条件擅自改成“必须使用三种不同异常”。这是上一条的另一种实现，未确认二者是否能同时选择。

**关联 Buff：**`buff_cc_eny_immune_same_abnormal_has_max_num`、`buff_cc_eny_immune_same_abnormal_airborne`、`buff_cc_eny_immune_same_abnormal_burning`、`buff_cc_eny_immune_same_abnormal_conduct`、`buff_cc_eny_immune_same_abnormal_corrupt`、`buff_cc_eny_immune_same_abnormal_crush`、`buff_cc_eny_immune_same_abnormal_fracture`、`buff_cc_eny_immune_same_abnormal_frozen`、`buff_cc_eny_immune_same_abnormal_knockdown`。

### 16｜改写：附着短效（拟名）

**条目说明：**敌人身上受该规则影响的附着状态，持续时间被统一设置为较短的时间。

**实战含义：**攒附着层数、等待下一名干员接技能的时间会更紧。这里改的是附着的计时，不是冻结、燃烧等异常的统一持续时间，也不是“在原时长上再减去若干秒”。

**关联 Buff：**`buff_cc_eny_inflict_set_duration`。

### 17｜改写：受控防护（拟名）

**条目说明：**敌人处于规则指定的控制状态时，受到的伤害降低。

**实战含义：**控制窗口未必同时是最佳输出窗口。需要权衡先控制保命还是在控制结束后集中伤害；不是所有无法移动的场景都会自动满足这条规则。

**关联 Buff：**`buff_cc_eny_immobilized_dmg_taken_down`。

## 五、回血与次数盾

### 18｜改写：脱附再生（拟名）

**条目说明：**敌人不再持有规则指定的附着状态后开始倒计时；倒计时结束后，持续回复生命。重新施加符合条件的状态，可以中断倒计时和恢复。

**实战含义：**持续造成伤害未必能阻止回血，关键是维持对应状态。这里的条件是“有没有指定附着”，不是“多久没有挨打”；具体可阻断回血的状态范围仍需正式条目说明。

**关联 Buff：**`buff_cc_eny_heal_no_inflict`、`buff_cc_eny_heal_no_inflict_countdown`、`buff_cc_eny_heal_no_inflict_do_heal`。

### 19｜改写：濒危回生（拟名）

**条目说明：**受该规则影响的敌人在濒死时暂时保留至少 1 点生命，并按规定比例与次数回复生命；恢复流程结束后解除保命效果。

**实战含义：**看起来已经打空血条的敌人可能还需要第二轮处理。当前机制有防止重复触发的记录，不应当成每次濒死都能无限复活，也不能只凭名称断言必定回满。

**关联 Buff：**`buff_cc_eny_heal_on_dead`、`buff_cc_eny_heal_on_dead_undeadable`、`buff_cc_eny_heal_on_dead_do_heal`。

### 20｜改写：次数屏障（拟名）

**条目说明：**敌人获得次数盾，持盾期间大幅抑制规则指定的伤害。受到符合条件的技能命中时消耗盾层，盾层耗尽后解除该效果；同一次技能施放的多段命中按施放标识去重。

**实战含义：**多段技能未必比单段技能破盾快，更值得关注能否接上多次独立施放。破盾最后一击是否恢复正常伤害尚未确认，不能直接把整段爆发押在这一击上。

**关联 Buff：**`buff_cc_eny_numshield`、`buff_cc_eny_numshield_instance`。

### 21｜改写：遗留屏障（拟名）

**条目说明：**受该规则影响的敌人被击败时，向其他符合条件的敌人分发次数盾层数。

**实战含义：**先清理杂兵可能让剩余敌人更难处理，需要考虑击杀顺序。分发包含延迟和再次筛选，实际受益对象不宜直接写成“所有存活敌人无条件获得”。

**关联 Buff：**`buff_cc_eny_numshield_on_dead`、`buff_cc_eny_numshield_on_dead_delay`、`buff_cc_eny_numshield_on_dead_inst`。

## 六、失衡、距离与护盾

### 22｜改写：失衡增节（拟名）

**条目说明：**受该规则影响的敌人增加失衡节点，并根据节点数量提高最大失衡值。

**实战含义：**把敌人打进完整失衡窗口可能需要更长时间。部分敌人的节点破坏还关联专属强化，但尚不足以统一写成“每破坏一节就增加某种攻击”。

**关联 Buff：**`buff_cc_eny_poise_knot_num`、`buff_cc_eny_poise_knot_override`、`buff_cc_eny_poise_knot_override_effect`、`buff_cc_eny_poise_knot_max_poise_enhance`。

### 23｜改写：近身压制（拟名）

**条目说明：**主控干员离开敌人的指定距离范围后，经过短暂确认，敌人获得高额减伤；重新满足近身条件后解除。

**实战含义：**远处队员在持续攻击，也不代表能绕过这条减伤。关键是主控的位置，长距离拉扯可能明显降低整个队伍的输出效率。

**关联 Buff：**`buff_cc_eny_mainchar_outzone_dmg_taken_down_effect`、`buff_cc_eny_mainchar_outzone_dmg_taken_down`、`buff_cc_eny_mainchar_outzone_dmg_taken_down_delay`、`buff_cc_eny_mainchar_outzone_dmg_taken_down_active`。

### 24｜改写：穿盾攻击（拟名）

**条目说明：**受该规则影响的敌人造成伤害时，无视护盾。

**实战含义：**有盾不再意味着生命值安全，需要依靠闪避、减伤或治疗应对。无视护盾不等于真实伤害，也没有直接说明防御、抗性全部失效。

**关联 Buff：**`buff_cc_enemy_damage_ignore_shield`。

### 25｜环境：连携破势（拟名）

**条目说明：**连携技的失衡效率提高，其他不符合连携伤害判定的攻击，其失衡效率降低。

**实战含义：**连携技会成为更重要的失衡来源，不能只看生命伤害决定技能释放顺序。这是对失衡积累的调整，不代表连携技造成的生命伤害同步提高。

**关联 Buff：**`buff_cc_chr_poise_except_comboskill`。

### 26｜环境：战技破势（拟名）

**条目说明：**战技的失衡效率提高，其他不符合战技伤害判定的攻击，其失衡效率降低。

**实战含义：**更需要为战技保留技力，靠普通攻击或其他技能磨失衡可能变慢。它与上一条是两种导向不同的机制，当前未确认正式指标会怎样互斥或组合。

**关联 Buff：**`buff_cc_chr_poise_except_normalskill`。

## 哪些方向更值得关注

这批候选中，封印、连携限制、异常免疫轮转、次数盾和失衡节点有多份互相引用的配置支撑，能够形成完整的战斗约束，是本次重点整理的机制方向。文件链完整只能支持机制解释，不能换算成下一期上线概率。

自然附着与腐蚀也形成了一组相互配合的候选：技能让主控积累附着，附着滞留提高后续触发机会，特殊腐蚀再增加走位压力。这个组合是根据独立机制提出的推演，不是已经取得的官方指标组合。

同职业封印解除、同属性技能禁用、场地陷阱和敌人专属强化仍有值得追踪的线索。但操作限制标签、全局分发或技能读取方尚未完整核对，本文不为了凑数把它们写成确定的条目说明。

## 附录：机制依据与参数边界

### 资料来源

- 官方资料：[「危机合约 重燃测试作战」内容更新说明](https://www.taptap.cn/moment/818961036416649861)。用于确认既有指标名称及写作参照，不作为下一期候选已经公布的证据。
- 游戏文案：`public/TableCfg/CcTagTable.json` 的 `name.id`、`desc.id` → `public/TableCfg/I18nTextTable_CN.json` 对应键。两表提供重燃条目的名称与机制文本，参数占位符不等于已取得实际数值。
- 机制输入：`public/Json/BuffData/` 下的实际动作、创建引用、目标选择器与参数；结合本站《危机合约Buff机制分析v2》《危机合约Buff机制分析v3》交叉阅读。本次重新读取了候选的主要配置，未进行游戏内实测。
- 当前 `CcTagTable` 没有可用于这些候选的 `tagTerms` 外键，本地也未提供 `GlobalBuffData`。因此不能从 Buff 的存在直接推出正式指标名称、分数、档位、开放赛季或全部作用对象。
- 本次未取得可确认的游戏数据版本号。2026-10-20 是本文整理日期；网站版本不作为游戏数据版本。`CcTagTable.json` 的 SHA-256 为 `16dab1d93fcb385ec9a4c196ddc911b6202b8adef4bf274bc305892b980d0021`，与 v3 记录一致，因此没有把本次候选宣称为新增正式表内条目。

### 逐条追溯

下表文件均位于 `public/Json/BuffData/`，省略 `.json` 后缀。为便于复查，附录明确展示内部标识；正文不依赖这些标识阅读。表中数字为当前配置或创建链中的默认值，**均不是下一期正式档位**。

| 条目 | 主要配置与关联 | 可确认内容及限制 |
| --- | --- | --- |
| 01 | `buff_cc_chr_seal_listener` → `buff_cc_seal_point` → `buff_cc_chr_seal` → `buff_cc_chr_seal_instance` | 技能类型 2、6、7 的事件参与队伍计数，当前检查门槛 4；封印本体有伤害修正和减速。入口延迟 1.5 秒不是封印持续时间。 |
| 02 | `buff_cc_chr_seal` 检查 `buff_cc_chr_seal_extra_nextslot` → `buff_cc_chr_seal_coseal` | `GetNextAliveBySquadSlot` 获取下一存活槽位；附加标记本身为空不代表机制不存在，实际读取方在封印入口。 |
| 03 | `buff_cc_chr_seal_instance` → `buff_cc_chr_seal_hp_drain_instance` | 两个分支分别传入 1% 与 3% 的每次生命流失比例，按秒触发；退出时执行返还治疗。累计记录不等于实际逐次损失血量。 |
| 04 | `buff_cc_chr_combo_lock` → `buff_cc_chr_combo_lock_stack`、`buff_cc_chr_combo_lock_instance` | 默认门槛 2、锁定 10 秒，执行 `ComboLockAction`；显式排除一个后续段技能。 |
| 05 | `buff_cc_chr_combo_skill_cd_up_scale_counter_base` → 层数标记 → `buff_cc_chr_combo_skill_cd_up_scale` | 倍率字段为 `1 + 0.25 × 层数`；缺少全局配置，不能确定完整加层与清层周期。 |
| 06 | `buff_cc_chr_combo_skill_cost_atb` → `buff_cc_chr_combo_skill_cost_atb_effect` | 效果默认 `atb=25`，写入相应属性；追加连携有额外状态分支，不能对每一段无条件扣费。 |
| 07 | `buff_cc_chr_ult_skill_usp_clear` | 筛选终结技、排除自身、要求其他队员也持有该效果，执行 `RefrainObtainUsp`，设置 `clearUspOnEnd=true`。 |
| 08 | `buff_cc_chr_dash_point` → `buff_cc_chr_dash_point_effect` | `LimitAndSplitDashCount` 默认上限 3，`BlockRecoverDashEnergy` 筛选恢复来源；另有周期恢复入口，但其全局链不完整。 |
| 09 | `buff_cc_chr_main_heal_down_after_take_damage` → `buff_cc_chr_heal_down` | 默认计时 6 秒、修正参数 -0.9；当前效果明确为 `enableSide=Healer`，按治疗来源解释，不把参数直接写成最终治疗量降低 90%。 |
| 10 | `buff_cc_chr_normal_skill_natural_inflict` 及其计数子配置 | `SpellInflictionOnChar` 的目标为 `MainCharacter`、类型为 `Natural`、数量 1；默认次数门槛 1、触发间隔 3 秒。 |
| 11 | `buff_cc_chr_combo_skill_natural_inflict` 及其计数子配置 | 连携监听与自然附着动作；默认次数门槛 1、触发间隔 3 秒，正式计数例外仍应以入口为准。 |
| 12 | `buff_cc_chr_natural_inflict_extend` | 匹配 `buff_common_enemy_spell_natural_attached` 后设置持续时间 30 秒；不是额外增加 30 秒。 |
| 13 | `buff_cc_chr_corruptonchar_mobility_listener` → `buff_cc_chr_corruptonchar_mobility_triggered` → `buff_cc_chr_corruptonchar_mobility_status` | 先终止原腐蚀的添加，再创建替代状态；包含防御、移动修正及条件计时。移动子状态的伤害动作 `isEnable=false`，不计入预测。 |
| 14 | `buff_cc_eny_immune_same_abnormal` → 各异常免疫子配置 | 按异常类别创建免疫，默认持续 20 秒；并非所有附着一并免疫。 |
| 15 | `buff_cc_eny_immune_same_abnormal_has_max_num` → 各异常免疫子配置 | 记录匹配事件，当前比较动作直接使用 3，达到后清除八类免疫；不是对不同异常种类去重计数。 |
| 16 | `buff_cc_eny_inflict_set_duration` | 通过 `SetBuffDurationAction` 设置目标时长，默认 5 秒；不是对任意异常统一减时。 |
| 17 | `buff_cc_eny_immobilized_dmg_taken_down` | 检查指定控制标签或特定角色效果，在受伤侧写入默认 -0.5 修正；不是常驻减伤。 |
| 18 | `buff_cc_eny_heal_no_inflict` → `buff_cc_eny_heal_no_inflict_countdown` → `buff_cc_eny_heal_no_inflict_do_heal` | 指定状态添加会清除恢复链，移除后进入倒计时；默认等待 5 秒、之后每秒按最大生命值 5% 治疗。含特定敌人状态例外。 |
| 19 | `buff_cc_eny_heal_on_dead` → `buff_cc_eny_heal_on_dead_undeadable`、`buff_cc_eny_heal_on_dead_do_heal` | 生命下限 1，主入口默认总恢复比例 0.5、次数 1；应优先采用父级传参，不能拿子配置默认 5 次反推五次各回一半。 |
| 20 | `buff_cc_eny_numshield` → `buff_cc_eny_numshield_instance` | 主入口默认 2 层，`SaveDamageSkillCastId` 参与去重；减伤与扣层有伤害条件，不扩写为全部来源永久无效。 |
| 21 | `buff_cc_eny_numshield_on_dead` → `buff_cc_eny_numshield_on_dead_delay` → `buff_cc_eny_numshield_on_dead_inst` | 默认传入增加 3 层，经历前后两次目标选择；不能仅按初次筛选就宣布覆盖全部敌人。 |
| 22 | `buff_cc_eny_poise_knot_num` → `buff_cc_eny_poise_knot_override` → `buff_cc_eny_poise_knot_override_effect` → `buff_cc_eny_poise_knot_max_poise_enhance` | 节点数参与最大失衡值修正，默认输入系数 0.2 × 节点数；最终失衡槽长度还取决于属性公式。 |
| 23 | `buff_cc_eny_mainchar_outzone_dmg_taken_down_effect` 及其 `delay`、`active` 子配置 | 目标包含主控筛选，默认判断距离 5、延迟 1 秒、减伤修正 -0.9；另一个半径参数 10 不能替代判断距离。 |
| 24 | `buff_cc_enemy_damage_ignore_shield` | 伤害处理器直接挂载 `IgnoreShieldProcessor`；仅据此确认无视护盾，不推导伤害类型改变。 |
| 25 | `buff_cc_chr_poise_except_comboskill` | 按连携伤害掩码分支修改 `PoiseDamageOutputScalar`；降低与提高分支使用不同公式项，不把 `up_rate=2` 直接写成最终效率增加 200%。 |
| 26 | `buff_cc_chr_poise_except_normalskill` | 按战技伤害掩码分支修改失衡输出，默认 `low_rate=-0.6`、`up_rate=2`；生命伤害不由此改变。 |

以上是对现有配置能够支持的玩法描述进行整理。正式上线时，仍需用实际指标入口补齐作用对象、数值、互斥关系和异常处理，再把候选说明改为确定说明。
