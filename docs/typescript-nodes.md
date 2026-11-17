# 节点接入

## 适配范围

| 后端 / API 模式 | 面板实现 | 验证状态 |
| --- | --- | --- |
| V2bX UniProxy | config、user、push、alive、alivelist、status | 已核对源码，集成测试通过；未跑真实节点 |
| XrayR 使用 UniProxy 的版本/分支 | 同上 | 协议候选兼容，需按具体版本联调 |
| XrayR 旧 V2board 模式 | Deepbwork / TrojanTidalab / ShadowsocksTidalab | 对照 XrayRR 分支源码并测试报文；未跑真实节点 |
| 其他面板 API（SSPanel、PMPanel 等） | 无 | 不支持 |

源码对照（2026-11-17）：

- https://github.com/wyx2685/V2bX/blob/master/api/panel/panel.go
- https://github.com/wyx2685/V2bX/blob/master/api/panel/node.go
- https://github.com/wyx2685/V2bX/blob/master/api/panel/user.go
- https://github.com/wyx2685/V2bX/blob/master/example/config.json
- https://github.com/XrayRR/XrayR/blob/master/api/v2board/v2board.go
- https://github.com/XrayRR/XrayR/blob/master/api/v2board/model.go

不声称所有名称相同的分支或版本兼容。首次接入应记录节点版本，完成拉取用户、
实际客户端连接、用量上报、封禁生效与订阅导入测试。

## 在后台创建节点

1. 先创建发布套餐，并给测试账户入账购买。
2. `/admin` → 节点，填写真实域名/IP、端口、协议和 TLS 证书域名。
3. 勾选允许使用的套餐，启用节点。
4. 保存创建时显示的节点编号和密钥。密钥不再回显，遗失后重置。
5. TLS 证书、监听、防火墙由节点后端自身配置，面板不传输私钥。

协议约束：

- VMess/VLESS：TCP + TLS；VMess alterId=0；VLESS 不启用 Reality/XTLS flow。
- Trojan：TCP + TLS。
- Shadowsocks：aes-128-gcm / aes-256-gcm / chacha20-ietf-poly1305。
- Hysteria2：TLS，不设置混淆，省略空带宽参数。
- TUIC：TLS，bbr，不启用 0-RTT。

## V2bX 配置示例

根据已安装版本选择对应 Xray 或 sing 内核。以下为参考配置，需要填入真实值和证书路径：

```json
{
  "Log": { "Level": "info", "Output": "" },
  "Cores": [{ "Type": "sing", "Log": { "Level": "info", "Timestamp": true } }],
  "Nodes": [{
    "Core": "sing",
    "ApiHost": "https://panel.example.com",
    "ApiKey": "创建节点时显示的密钥",
    "NodeID": 1,
    "NodeType": "vless",
    "Timeout": 30,
    "ListenIP": "0.0.0.0",
    "SendIP": "0.0.0.0",
    "CertConfig": {
      "CertMode": "file",
      "CertDomain": "node.example.com",
      "CertFile": "/etc/V2bX/fullchain.pem",
      "KeyFile": "/etc/V2bX/privkey.pem"
    }
  }]
}
```

不同 V2bX 版本的证书模式命名可能不同，使用对应版本文档为准。
`ApiHost` 不带 `/api` 后缀。`NodeType=v2ray` 会按 vmess 处理。

UniProxy 查询参数为 `node_id`、`node_type`、`token`：

```text
GET  /api/v1/server/UniProxy/config
GET  /api/v1/server/UniProxy/user
POST /api/v1/server/UniProxy/push
POST /api/v1/server/UniProxy/alive
GET  /api/v1/server/UniProxy/alivelist
POST /api/v1/server/UniProxy/status
```

用户列表返回 `{"users":[{"id":1,"uuid":"…","speed_limit":100,"device_limit":3}]}`。
用户仅限节点关联套餐，设备数由节点后端执行；面板聚合最近 3 分钟的在线 IP。
用户停用/耗尽/到期在下次拉取时移除，不保证立即踢出存量连接。

## XrayR 旧模式

选择节点软件的 V2board 适配器，`ApiHost` 填站点域名，`ApiKey` 填节点密钥，
`NodeID` 填编号，`NodeType` 按该版本使用 `V2ray` / `Trojan` / `Shadowsocks`。
VLESS 需在支持的版本启用 `EnableVless`，与面板所选协议一致。

旧模式接口：

```text
GET  /api/v1/server/Deepbwork/config
GET  /api/v1/server/Deepbwork/user
POST /api/v1/server/Deepbwork/submit

GET  /api/v1/server/TrojanTidalab/config
GET  /api/v1/server/TrojanTidalab/user
POST /api/v1/server/TrojanTidalab/submit

GET  /api/v1/server/ShadowsocksTidalab/user
POST /api/v1/server/ShadowsocksTidalab/submit
```

认证查询参数为 `node_id` 和 `token`，协议由受限路由和节点配置确定。
旧模式的限速/设备数可能由 XrayR 本机配置覆盖，不应假设具备 UniProxy 的逐用户能力。

## 流量统计与重试

UniProxy 上报增量字节：`{"1":[上传字节,下载字节]}`。
旧接口：`[{"user_id":1,"u":上传字节,"d":下载字节}]`。
每次最多 5000 个用户，必须是非负安全整数；不属于节点套餐的用户会忽略。

可选 `Idempotency-Key` 请求头允许重试同一批而不重复计费，保留 30 天。
同一个键不能提交不同内容。

**现有 V2bX/XrayR 默认不发送批次编号。** 无编号增量上报无法区分“失败重试”
和“下一批刚好相同流量”。此时每个成功收到的请求都计数，不做错误的内容哈希去重。
精确重试计费需要节点端补充批次编号；不能宣称原版后端已提供严格一次计费。

## 订阅

用户 `/manage` 生成链接，选择 Mihomo 或 Sing-box 格式导入。
链接重置立即使旧链接无法再下载；已经导入的节点凭据不会因此轮换。
订阅仅返回当前有效套餐的已启用节点，不包括管理密钥。

当前输出 JSON，Mihomo 可将其作为 YAML 解析。尚未使用真实客户端二进制做配置验收，
也没有进行节点连接测速。不能把接口响应成功当作代理连接成功。
