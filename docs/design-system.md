# 前端设计规范

适用于 `apps/user`。组件代码只读变量，页面代码只用由变量生成的工具类。
变量定义在 `apps/user/src/styles/theme.css`，改一处全站生效。

## 1. 色彩

| 变量                 | 工具类                                      | 用途                                                                      |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| `--primary`          | `bg-primary` `text-primary` `bg-primary/10` | 品牌色（Logo 蓝紫之间的靛蓝）：每个区域唯一的主操作、图表主系列、图标底块 |
| `--muted-foreground` | `text-muted-foreground`                     | 次要文字、说明、单位                                                      |
| `--destructive`      | `text-destructive` `bg-destructive`         | 失败、阻断、不可撤销的操作                                                |
| `--success`          | `text-success` `bg-success/12`              | 正常、已完成、收入                                                        |
| `--warning`          | `text-warning` `bg-warning/12`              | 需要尽快处理：待支付、流量将尽                                            |
| `--info`             | `text-info` `bg-info/12`                    | 进行中：排队、处理中                                                      |

浅色和深色主题各有一套取值，主色和状态色在两种背景上的对比度都不低于 4.5:1。
图表系列色 `--chart-1`…`--chart-5` 依次取自 Logo：品牌靛蓝、蓝、珊瑚红、天蓝、桃橙。

状态和色调的对应关系：

| 色调    | Badge `variant` | 例子                                                     |
| ------- | --------------- | -------------------------------------------------------- |
| success | `success`       | 已支付、已开通、在线、已发送、销售中、已发布             |
| warning | `warning`       | 待支付、流量即将用完、未连接、重试中、未定价、邮箱未验证 |
| danger  | `danger`        | 已到期、流量已用完、离线、已封禁、已放弃                 |
| info    | `info`          | 排队中、处理中                                           |
| 中性    | `secondary`     | 已取消、已超时、草稿、未开通                             |

- Do：`<Badge variant="success">在线</Badge>`；收入金额用 `text-success`。
- Don't：`text-emerald-600`、`bg-amber-500`、`#ecedef` 这类调色板颜色或色值。
- Don't：用 `default`（主色实心）表示“正常”。主色留给操作，状态越正常越不该抢眼。

## 2. 圆角

一个基准值 `--radius: 8px`，其余按 4px 逐级内缩。元素在容器内缩进 4px，
圆角就比容器小 4px，内外弧线保持平行（等距内缩）：

| 工具类            | 值   | 用于                                                                        |
| ----------------- | ---- | --------------------------------------------------------------------------- |
| `rounded-card`    | 16px | Card、Dialog、AlertDialog、侧边栏内容区                                     |
| `rounded-surface` | 12px | Popover、下拉菜单、Select 列表、Command、Tabs 列表、分段选择、Alert、勾选行 |
| `rounded-control` | 8px  | Button、Input、Select、菜单项、Tabs 选项、Tooltip、头像                     |
| `rounded-inner`   | 4px  | Checkbox、Kbd、输入框内的按钮                                               |
| `rounded-full`    | 圆形 | Badge、Switch、Radio、进度条、圆形头像                                      |

嵌套示例：菜单 12px，内边距 4px，菜单项 8px；密码框 8px，内嵌按钮距四边 4px，按钮 4px。
内边距大于外圆角时（Card 内边距 24px），子元素直接用自己的圆角。

- Do：圆角只写在 `components/ui` 里，页面代码不写 `rounded-*`。
- Don't：`rounded-[6px]`、在 16px 的 Checkbox 上用 12px 圆角（看起来像单选框）。

支持 `corner-shape: squircle` 的浏览器（Chromium 139+）自动显示连续圆角，
见 `styles/index.css` 末尾。它只影响绘制，没有布局和脚本开销；`rounded-full` 和
Badge、Switch、头像等圆形元素保持正圆。

## 3. 间距

全部是 4 的倍数。Tailwind 的整数步长（`1`=4px、`2`=8px、`3`=12px…）都符合，
`0.5`、`1.5`、`2.5` 这类半步不用。按嵌套层级取名：

| 工具类后缀 | 手机 | ≥640px | 用于                                              |
| ---------- | ---- | ------ | ------------------------------------------------- |
| `page`     | 16px | 24px   | 页面四周留白；页面内区块之间                      |
| `card`     | 16px | 24px   | Card、Dialog、Sheet 的四边内边距；Card 内各段之间 |
| `group`    | 16px | 16px   | 卡片内的字段组、表单字段之间、列表行之间          |
| `field`    | 8px  | 8px    | 标签到控件、标题到说明                            |
| `inline`   | 8px  | 8px    | 图标到文字、并排的按钮                            |

例：`<Main className="p-page gap-page">`、`<CardContent className="px-card">`、
`<form className="space-y-group">`。

- Do：Card 上下左右内边距相同（都是 `card`），标题、正文、底栏之间也用 `card`。
- Don't：`px-6 pb-6 pt-0`、`ps-2` 这类四边不一致的内边距；`gap-1.5`、`py-0.5` 这类半步。
- Don't：表单之间各用各的 `space-y-4`、`space-y-5`、`space-y-6`。表单字段统一 `space-y-group`。

## 4. 组件语义

先确定要表达的意思，再选组件。

| 场景                                       | 用                                                           | 不用                             |
| ------------------------------------------ | ------------------------------------------------------------ | -------------------------------- |
| 页面主操作（每区一个）                     | `Button`（default）                                          | 两个并排的主色按钮               |
| 次要操作                                   | `Button variant="outline"` 或 `ghost`                        | 主色按钮                         |
| 一组选项里推荐的那个（如本机推荐的客户端） | `Button variant="soft"`（品牌色浅底）                        | 第二个主色按钮                   |
| 删除、封禁、作废链接                       | `Button variant="destructive"` + `ConfirmDialog destructive` | 直接执行、outline 按钮           |
| 涉及金额的操作（入账、支付）               | 先 `ConfirmDialog` 写明金额和对象                            | 点击即执行                       |
| 跳转页面                                   | `Link`（需要按钮外观时 `<Button asChild><Link/></Button>`）  | `onClick` 里 `navigate` 的按钮   |
| 状态                                       | `Badge` 状态色                                               | 纯文本、加粗文字、彩色文字       |
| 卡片里一组可选的条目（客户端、方案）       | `Tile`（推荐项用 `tone="highlight"`）                        | 嵌套的 `Card`                    |
| 键值对、列表行前的图标或字母               | `IconBlock`（品牌、中性、危险三种底色）                      | 页面里手写带圆角的底块           |
| 配额、占比                                 | `Progress`（`tone` 表示状态）                                | 手写 `div` 进度条                |
| 切换当前视图的筛选（时间范围、付款周期）   | `ToggleGroup`                                                | 没有内容面板的 `Tabs`            |
| 切换内容面板                               | `Tabs` + `TabsContent`                                       | —                                |
| 页面间导航                                 | 链接列表                                                     | `Select`                         |
| 随表单一起保存的开关                       | `CheckRow`（Checkbox）                                       | `Switch`                         |
| 立即生效的开关                             | `Switch`                                                     | —                                |
| 2–4 个互斥选项、需要都看到                 | `RadioGroup`                                                 | 只有 3 项的 `Select`             |
| 只显示一次的密钥、临时密码                 | 不能点遮罩或 Esc 关闭的对话框，只留“我已保存”                | 普通 `Dialog`                    |
| 编辑一条记录的表单                         | `Sheet`（`EditorSheet`）                                     | 整页跳转                         |
| 确认                                       | `ConfirmDialog`（基于 AlertDialog）                          | `window.confirm`                 |
| 暂无数据                                   | `EmptyState`（短名词 + 可选操作）                            | 一句口语化的话                   |
| 加载失败                                   | `ErrorState` 或 `DataTable` 的 `error`                       | 显示成“暂无记录”、0 元、一直转圈 |
| 加载中                                     | `Skeleton`，形状接近最终内容                                 | “正在加载…”文字                  |
| 很少需要的规则说明                         | `InfoTip`（问号按钮，点开显示）                              | 常驻的灰色段落                   |
| 必须知道的风险或阻断                       | `Alert`（`warning` / `destructive`）                         | 灰色说明文字                     |

## 5. 文案

先确定页面的定位，只保留核心标题和关键的键值对。

- 页面标题：名词，如“订单”“节点”。`Page` 的 `description` 只放一行状态，例如“显示最近 200 笔订单”，不写操作说明。
- 规则和背景：放进 `Page` 的 `help`（问号按钮）或字段旁的 `InfoTip`，例如重试策略、保留期限、时区规则。
- 删掉重复标题的说明，例如“套餐决定流量、限速、设备数和价格”。
- 书面语：不用“我们会”“即可”“还没有”“稍后再来看看”“点一行”“填到”。
    - 空状态：“暂无订单”，不写“还没有订单，可以去选购套餐”。
    - 说明：“修改密码后，所有设备将退出登录”，不写“改了之后会把你踢下线”。
- 占位符只放格式示例（`name@example.com`），不放规则；规则写在 `FormDescription`。
- 单位写在标题或坐标轴上（“单位：GB”），不在说明里重复上方已有的合计。
