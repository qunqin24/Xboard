# Xboard 运维 API v1

运维接口基址为 `https://panel.example.com/api/ops/v1`。接口使用 JSON，路径与后台业务操作一致。具有写权限的令牌可直接执行入账、封禁、删除和价格修改等操作。

## 在 opencode 的 VPS 上使用

1. 用管理员账户打开「系统 → 运维令牌」，新建令牌，填写名称、过期时间及可选的来源 IP。权限默认为「全部权限」。
2. 签发时保存明文。在启动 opencode 的进程环境中设置 `XBOARD_OPS_TOKEN` 和 `XBOARD_OPS_BASE_URL`。令牌应来自 VPS 上的密钥管理器或仅运行账户可读的环境文件。启动或重启 opencode 使其读取环境变量。
3. 让 opencode 的命令工具用 `Authorization: Bearer` 请求头调用。给 Agent 提供本文及生成的 OpenAPI 文件。每个 Agent 或 VPS 使用单独命名的令牌，便于吊销和审计。

下面的命令读取一页用户。把示例域名换成面板的 HTTPS 域名。

```bash
export XBOARD_OPS_BASE_URL='https://panel.example.com/api/ops/v1'

curl --fail-with-body --max-time 20 \
  --header "Authorization: Bearer ${XBOARD_OPS_TOKEN}" \
  "${XBOARD_OPS_BASE_URL%/}/users?page=1&pageSize=20"
```

后台也负责吊销令牌。过期、吊销和签发账户失去管理员权限都会使令牌失效。来源限制使用明确的 IPv4 或 IPv6 地址，比较 `TRUSTED_PROXY` 配置下的客户端地址。反向代理配置见 [部署指南](typescript-deployment.md)。

## 权限、重试与错误

| 权限 | 可执行操作 |
| --- | --- |
| `*` | 全部运维接口 |
| `admin:read` | 下方读接口 |
| `admin:write` | 下方写接口 |

写请求须带 UUID 格式的 `Idempotency-Key`。有请求体时发送 `Content-Type: application/json`。为每次逻辑操作生成一个新键，超时、断线或遇到 `5xx` 时用原令牌、原键和原请求重试。请求方法、路径参数、查询参数及 JSON 内容共同确定请求。JSON 对象各字段的顺序可以调整。重复键只重放首次成功响应或业务 `4xx` 响应，响应状态码和 JSON 相同，并带 `Idempotency-Replayed: true`。同一令牌下用相同键发送不同请求会得到 `409`。

入账、建单和群发邮件另外沿用本文示例中的业务 `requestId`，它必须是 v4 UUID。同一次操作可以在两处使用相同的 UUID。返回临时密码、节点密钥或兑换码的同一次请求也支持重放。响应副本加密保存在数据库中，只能用原令牌重放。令牌失效后无法重放。

```bash
ops_request_id="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
curl --fail-with-body --max-time 20 \
  --request POST \
  --header "Authorization: Bearer ${XBOARD_OPS_TOKEN}" \
  --header "Idempotency-Key: ${ops_request_id}" \
  --header 'Content-Type: application/json' \
  --data "{\"amountMinor\":2500,\"requestId\":\"${ops_request_id}\",\"reason\":\"收款凭证 2026-001\"}" \
  "${XBOARD_OPS_BASE_URL%/}/users/7/credit"
```

错误响应结构为 `{"error":{"status":409,"message":"此幂等键已用于另一项请求。"}}`，部分错误另有 `error.code`。下面的通用状态码适用于所有接口，接口表另标出常见的业务错误。

| 状态码 | 含义 |
| --- | --- |
| `400` | 参数、JSON 或幂等键无效，或业务校验失败。 |
| `401` | Bearer 凭据缺失、无效、已过期或已吊销。 |
| `403` | 来源 IP 或权限不符合要求。 |
| `404` | 路由或业务对象不存在。 |
| `409` | 幂等键用于不同请求、记录重复或当前状态冲突。 |
| `413` / `415` | JSON 请求体超过 1 MiB，或请求编码不支持。 |
| `429` | 同一令牌每分钟最多 120 次请求。等待 `Retry-After` 指定的秒数。 |
| `500` | 服务错误。重试写操作时沿用原幂等键。 |

## 审计

在「系统 → 审计日志」的「运维令牌」筛选器中选择令牌，也可调用 `GET /audit?opsTokenId=<UUID>`。成功、失败、只读请求和重放都记录为 `ops.request`。调用记录包含令牌名称、方法、接口模板、安全的参数摘要、HTTP 状态和重放标记。无法识别令牌的请求同样有记录，令牌字段为空。

每项写入与其 `changes` 在同一事务提交。每条变更有 `resource`、`record` 和 `before`、`after`，只包含发生变化的安全字段。密码、密钥、敏感配置和长文本的变化只标字段名 `privateFields`。例如给用户 7 入账后的变更如下。

```json
{"resource":"User","record":"7","before":{"balance":0},"after":{"balance":2500},"privateFields":[]}
```

## 接口目录

表中路径相对 `/api/ops/v1`。`{id}` 实际填写用户、套餐、节点、订单等对象的编号。金额用人民币整数分，流量用十进制字节字符串。`P` 代表分页示例 `{"items":[],"total":0,"page":1,"pageSize":20}`，`OK` 代表 `{"ok":true}`。响应列的数字是成功状态码。表中以名称引用的 JSON 见下面的示例章节。

### 读取（需 `admin:read` 或 `*`）

读接口不改变余额、价格或业务数据，无需撤销。

| 请求示例 | 用途 | 响应示例 |
| --- | --- | --- |
| `GET /overview` | 用户、订单、节点、工单数量和累计收入 | `200 {"users":3,"orders":0,"nodes":0,"openTickets":0,"revenueMinor":0}` |
| `GET /stats?days=1&topDays=30` | 每日计费与流量统计，按北京时间 | `200 {"days":[{"date":"2026-11-18","revenueMinor":0,"paidOrders":0,"newUsers":0,"trafficBytes":"0"}],"topPlans":[]}` |
| `GET /rankings?days=7` | 用户、节点流量排行 | `200 {"users":[],"nodes":[]}` |
| `GET /users?page=1&status=active&plan=3,none` | 分页搜索用户，可用 `q`、`status`、`role`、`verified`、`plan` | `200 P` |
| `GET /users/7` | 查看用户及其订阅，找不到用户返回 `404` | `200 User` |
| `GET /plans` | 当前套餐与各周期价格 | `200 [Plan]` |
| `GET /nodes` | 节点、协议设置和关联套餐 | `200 []` |
| `GET /subscription-templates` | 读取各格式的当前模板和内置模板 | `200 [Template]` |
| `GET /notices` | 最近 100 条公告，含草稿 | `200 [Notice]` |
| `GET /orders?page=1&status=pending` | 分页查询订单，可用 `q`、`status` | `200 P` |
| `GET /ledger?page=1&kind=credit` | 分页查询余额流水，可用 `q`、`kind` | `200 P` |
| `GET /audit?opsTokenId=00000000-0000-4000-8000-000000000001&action=ops.request` | 分页查询审计，可用 `q`、`action`、`opsTokenId` | `200 P` |
| `GET /mail` | 最近 100 封邮件的投递状态 | `200 []` |
| `GET /mail/templates` | 邮件模板及各模板的占位符 | `200 [{"key":"verify_email","subject":"验证邮箱","text":"打开 {{link}}","variables":["siteName","link"],"required":["link"]}, ...]` |
| `GET /tickets` | 最近更新的 200 个工单及消息 | `200 [Ticket]` |
| `GET /settings` | 查看站点设置 | `200 Settings` |
| `GET /help` | 查看帮助文档及草稿 | `200 [Help]` |
| `GET /coupons` | 优惠券和使用次数 | `200 [{"id":3,"code":"DEMO10","amountMinor":1000,"maxUses":10,"expiresAt":null,"enabled":true,"used":0}]` |
| `GET /gift-codes` | 兑换码状态和奖励 | `200 [{"id":4,"label":"活动赠送","kind":"balance","amountMinor":1000,"planName":null,"period":null,"expiresAt":null,"enabled":true,"redeemedAt":null}]` |

### 写入（需 `admin:write` 或 `*`）

| 请求示例 | 用途和常见业务错误 | 请求体示例 | 响应示例 | 金额与撤销 |
| --- | --- | --- | --- | --- |
| `PUT /users/7` | 修改用户订阅，套餐无效 `400`，用户不存在 `404` | `{"planId":3,"expiredAt":null,"transferBytes":"107374182400","speedLimit":null,"deviceLimit":null}` | `200 OK` | 无扣款。可重设之前的订阅参数，已经改变的用量周期需单独核对。 |
| `POST /users/7/credit` | 手动入账，超上限 `400`，业务请求号冲突 `409` | `{"amountMinor":2500,"requestId":"00000000-0000-4000-8000-000000000001","reason":"收款凭证"}` | `201 {"id":"00000000-0000-4000-8000-000000000002"}` | 增加余额并写流水。无撤销接口。 |
| `POST /users/7/ban` | 封禁或解封，目标是管理员 `400` | `{"banned":true}` | `201 OK` | 无金额。可解封，已退出的会话需重新登录。 |
| `POST /users/ban` | 批量封禁或解封，跳过管理员及缺失对象 | `{"ids":[7,8],"banned":true}` | `201 {"updated":2,"skipped":0}` | 无金额。可反向操作，已退出的会话需重新登录。 |
| `POST /users/7/reset-traffic` | 清零用户当前流量，目标不存在 `404` | `{"reason":"流量异常修正"}` | `201 OK` | 无金额。无法撤销。 |
| `POST /users/reset-traffic` | 批量清零，跳过缺失对象 | `{"ids":[7,8],"reason":"流量异常修正"}` | `201 {"updated":2,"skipped":0}` | 无金额。无法撤销。 |
| `POST /users/7/password` | 生成普通用户的临时密码，目标是管理员 `400` | 无 | `201 {"password":"<临时密码>"}` | 无金额。旧密码无法还原。 |
| `POST /users/7/two-factor/reset` | 移除普通用户的两步验证，未启用 `409` | 无 | `201 OK` | 无金额。用户可重新配置。 |
| `POST /users/7/credentials` | 更换用户节点凭据，目标不存在 `404` | 无 | `201 OK` | 无金额。旧凭据无法还原。 |
| `POST /users/7/orders` | 为用户创建待结算订单，不可购买 `400`，已有待支付单 `409` | `{"requestId":"00000000-0000-4000-8000-000000000003","planId":3,"period":"monthly"}` | `201 Order` | 生成报价，余额未变动。用户可在结算前取消，或等待超时。 |
| `POST /orders/00000000-0000-4000-8000-000000000004/confirm-payment` | 核实实收后结算，金额不符、订单超时或已结算 `409` | `{"amountMinor":2500,"reason":"线下收款凭证"}` | `200 Order`（`status` 为 `paid`） | 同额入账与扣款，开通权益。无撤销接口。 |
| `POST /plans` | 新建套餐，周期重复或已发布却无价格 `400` | `PlanBody` | `201 Plan` | 设置销售价格。可下架或在无有效订阅时删除。 |
| `PUT /plans/3` | 编辑套餐、价格或发布状态，套餐不存在 `404` | `PlanBody` | `200 Plan` | 调整后续报价。可提交旧配置，已生成的订单保留快照。 |
| `DELETE /plans/3` | 软删除套餐，仍有有效订阅 `409` | 无 | `200 OK` | 停止销售，保留历史订单。无法恢复原套餐。 |
| `POST /nodes` | 新建节点，地址、协议或关联套餐无效 `400` | `NodeBody` | `201 {"id":4,"token":"<节点密钥>"}`。中转节点只返回 `id` | 无金额。可停用或删除。 |
| `PUT /nodes/4` | 更新节点配置，不合法 `400`，对象不存在 `404` | `NodeBody` | `200 {"id":4}` | 无金额。可提交旧配置。 |
| `PUT /nodes/4/enabled` | 启用或停用节点 | `{"enabled":false}` | `200 {"id":4}` | 无金额。可反向设置。 |
| `POST /nodes/bulk-enabled` | 批量启停，跳过缺失或目标状态相同的节点 | `{"ids":[4,5],"enabled":false}` | `200 {"updated":1,"skipped":1}` | 无金额。可恢复实际变化的节点。 |
| `POST /nodes/4/token` | 轮换通信密钥，中转节点 `400` | 无 | `201 {"token":"<节点密钥>"}` | 无金额。旧密钥无法恢复。 |
| `DELETE /nodes/4` | 软删除节点，有中转节点依赖 `409` | 无 | `200 OK` | 无金额。无法恢复原节点。 |
| `PUT /subscription-templates/mihomo` | 保存订阅规则模板，格式或内容无效 `400` | `TemplateBody` | `200 Template` | 无金额。可提交旧内容或恢复内置模板。 |
| `DELETE /subscription-templates/mihomo` | 恢复内置订阅模板 | 无 | `200 Template`（`customized` 为 `false`） | 无金额。可重新提交保留的自定义内容。 |
| `POST /notices` | 新建公告 | `{"title":"维护通知","content":"周六进行维护。","published":false}` | `201 Notice` | 无金额。可删除或下架。 |
| `PUT /notices/4` | 修改公告和发布状态 | `{"title":"维护完成","content":"服务已恢复。","published":true}` | `200 Notice` | 无金额。可提交旧内容。 |
| `DELETE /notices/4` | 删除公告 | 无 | `200 OK` | 无金额。可重新创建内容，原编号无法恢复。 |
| `POST /tickets/7/reply` | 以客服身份回复工单，工单关闭 `400` | `{"content":"已核对订单，请刷新后查看。"}` | `201 Ticket` | 无金额。无法撤回回复。 |
| `POST /tickets/7/status` | 关闭或重新打开工单 | `{"closed":true}` | `201 OK` | 无金额。可反向操作。 |
| `PUT /settings` | 更新全部站点设置，依赖邮件配置或试用套餐无效 `400` | `Settings` | `200 Settings` | 可改变注册及试用权益。可提交旧设置，已授予的权益另行处理。 |
| `POST /help` | 新建帮助文档 | `{"title":"使用指南","body":"打开订阅页。","sort":0,"published":false}` | `201 Help` | 无金额。可删除或下架。 |
| `PUT /help/4` | 修改帮助文档 | `{"title":"使用指南","body":"选择客户端。","sort":0,"published":true}` | `200 Help` | 无金额。可提交旧内容。 |
| `DELETE /help/4` | 删除帮助文档 | 无 | `200 OK` | 无金额。可重新创建内容，原编号无法恢复。 |
| `POST /coupons` | 创建优惠券，代码重复 `409` | `{"code":"DEMO10","amountMinor":1000,"maxUses":10,"expiresAt":null}` | `201 {"id":3}` | 设置折扣。可停用，已用优惠不回退。 |
| `PUT /coupons/3/enabled` | 启用或停用优惠券 | `{"enabled":false}` | `200 OK` | 影响后续优惠。可反向设置。 |
| `POST /gift-codes` | 创建兑换码，可发余额或套餐 | `{"label":"活动赠送","kind":"balance","amountMinor":1000,"expiresAt":null}` | `201 {"id":4,"code":"<兑换码>"}` | 兑换时发放余额或权益。可停用未兑码，已兑换奖励无自动撤销。 |
| `PUT /gift-codes/4/enabled` | 启用或停用兑换码 | `{"enabled":false}` | `200 OK` | 影响后续兑换。可反向设置。 |
| `PUT /mail/templates/verify_email` | 保存邮件模板，占位符缺失或无法识别 `400` | `{"subject":"验证邮箱","text":"打开 {{link}}"}` | `200 OK` | 无金额。可提交旧模板。 |
| `POST /mail/broadcast` | 将群发加入队列，SMTP 未配置或无收件人 `400` | `{"scope":"selected","ids":[7],"subject":"服务通知","text":"维护已完成。","requestId":"00000000-0000-4000-8000-000000000005"}` | `201 {"recipients":1}` | 无金额。无法撤回队列中的群发批次。 |

### JSON 示例

`PlanBody` 与 `Plan`

```json
{"name":"月度套餐","content":"每月 100 GiB","transferBytes":"107374182400","published":true,"sort":0,"prices":[{"period":"monthly","amountMinor":2500}]}
```

```json
{"id":3,"name":"月度套餐","content":"每月 100 GiB","transferEnable":"107374182400","speedLimit":null,"deviceLimit":null,"published":true,"sort":0,"trafficResetMode":"none","trafficResetPriceMinor":null,"prices":[{"period":"monthly","amountMinor":2500}]}
```

`NodeBody`（其他协议的选项见 OpenAPI）

```json
{"name":"示例节点","host":"node.example.com","port":443,"enabled":false,"protocol":"vless","planIds":[3]}
```

`User` 与 `Order`

```json
{"id":7,"email":"customer@example.com","role":"user","balance":2500,"banned":false,"twoFactorEnabled":false,"transferEnable":"0","upload":"0","download":"0","planId":null,"expiredAt":null,"verifiedAt":null,"speedLimit":null,"deviceLimit":null,"createdAt":"2026-11-18T08:00:00.000Z","lastLoginAt":null,"invitedBy":null}
```

```json
{"id":"00000000-0000-4000-8000-000000000004","planName":"月度套餐","kind":"subscription","period":"monthly","status":"pending","amountMinor":2500,"creditMinor":0,"discountMinor":0,"replacesPlan":false,"payableMinor":2500,"transferBytes":"107374182400","durationDays":30,"createdAt":"2026-11-18T08:00:00.000Z","expiresAt":"2026-11-18T08:30:00.000Z"}
```

`Settings`

```json
{"siteName":"Xboard","registrationOpen":true,"supportNote":"","inviteOnly":false,"emailCodeRequired":false,"emailDomainMode":"off","emailDomains":[],"gmailAliasCheck":false,"registerIpDailyLimit":0,"trialPlanId":null,"trialDays":7,"termsUrl":"","privacyUrl":"","expiryReminders":false,"trafficReminders":false}
```

`TemplateBody`（Mihomo 示例）

```json
{"content":"proxy-groups:\n  - name: 节点选择\n    type: select\n    include-all-proxies: true\nrules:\n  - MATCH,节点选择\n"}
```

`Template` 的 `content` 和 `defaultContent` 是完整的模板文本，下面以短字符串代替。

```json
{"format":"mihomo","content":"<当前模板>","defaultContent":"<内置模板>","customized":true,"updatedAt":"2026-11-18T08:00:00.000Z"}
```

`Notice`、`Help` 与 `Ticket`

```json
{"id":4,"title":"维护通知","content":"周六进行维护。","published":false,"createdAt":"2026-11-18T08:00:00.000Z"}
```

```json
{"id":4,"title":"使用指南","body":"打开订阅页。","sort":0,"published":false}
```

```json
{"id":7,"subject":"订单查询","closed":false,"createdAt":"2026-11-18T08:00:00.000Z","updatedAt":"2026-11-18T08:05:00.000Z","user":{"email":"customer@example.com"},"messages":[{"id":1,"isStaff":true,"content":"已核对订单，请刷新后查看。","createdAt":"2026-11-18T08:05:00.000Z"}]}
```

## OpenAPI

仓库根目录执行 `pnpm api:generate` 生成 `packages/contracts/ops-openapi.json`。开发环境也可从 `/api/docs/ops-openapi.json` 读取。生成器与浏览器接口共用 Zod 契约。新增或变更运维接口时同步更新本页。
