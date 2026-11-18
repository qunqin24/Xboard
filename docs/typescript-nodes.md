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
2. `/admin` → 节点，填写真实域名/IP、连接端口与服务端口、协议，以及该协议的安全、传输等设置。
3. 勾选允许使用的套餐，启用节点。
4. 保存创建时显示的节点编号和密钥。密钥不再回显，遗失后重置。中转节点没有密钥。
5. TLS 证书默认由节点后端自身配置；“证书”中的设置以 `cert_config` 下发，仅对读取它的后端（如 v2node）有效。
   Reality 私钥、ECH 密钥会随节点配置下发，不会出现在订阅中。

协议与选项（字段名见 `packages/contracts/src/nodes.ts`）：

| 协议 | 选项 |
| --- | --- |
| VLESS | TLS / Reality / 无；TCP（可选 HTTP 伪装）、WS、gRPC、HTTPUpgrade、XHTTP；flow `xtls-rprx-vision`；uTLS 指纹；多路复用；ECH |
| VMess | TLS / 无；TCP（可选 HTTP 伪装）、WS、gRPC、HTTPUpgrade；uTLS；多路复用；ECH |
| Trojan | TLS / Reality；TCP、WS、gRPC；uTLS；多路复用；ECH |
| Shadowsocks | aes-128/256-gcm、chacha20-ietf-poly1305、2022-blake3-aes-128/256-gcm；插件 obfs、v2ray-plugin |
| Hysteria2 | Salamander 混淆、上下行带宽、端口跳跃（范围与间隔） |
| Hysteria | 混淆密码、上下行带宽（必填）、端口跳跃 |
| TUIC | v5 / v4、拥塞控制 cubic/new_reno/bbr、UDP 转发 native/quic、ALPN |
| AnyTLS | 填充方案 |
| SOCKS5、HTTP | 无 / TLS |
| Naive | TLS |
| Mieru | TCP / UDP、端口范围、traffic pattern |

所有 TLS 类协议都有 SNI、ALPN、允许不安全证书和 ECH。Reality 不选 uTLS 指纹时，订阅使用 chrome。
Shadowsocks 2022 的服务端密钥由节点私有随机串派生，用户密钥为 UUID 前 16/32 个字符的 base64，与 V2bX 一致。

节点级选项：倍率与分时段倍率、在订阅中显示、标签、父节点（中转）、V2bX `routes` 路由规则、
`custom_outbounds` / `custom_routes`（原样下发）、证书设置。

## 对照的官方版本（2026-11-18）

- 节点后端：wyx2685/V2bX `dev_new` 71277de（Xray 内核 fork v1.251202.0、sing-box 1.13.0、hysteria v2.6.4）；
  XrayR 官方仓库已废弃并清空，最后有效版本 v0.9.4 只保留 UniProxy（newV2board）接口，旧 V2board 适配器只服务旧分支。
- Xray-core v26.11.9 与 XTLS/Xray-docs-next；mihomo v1.19.34；sing-box v1.14.4。

后端限制：

- V2bX 只运行 vmess、vless、trojan、shadowsocks、tuic、anytls、hysteria、hysteria2。SOCKS、HTTP、Naive、Mieru
  的节点配置照常下发，需使用支持它们的后端。
- V2bX 的 TLS 证书、ALPN、ECH 密钥、多路复用都取自节点本机配置；面板下发的 `cert_config`、`custom_outbounds`、
  `custom_routes`、`multiplex`、Shadowsocks 插件不被 V2bX 读取。`routes` 中只处理 block 与 dns。
- XHTTP 只能用 V2bX 的 Xray 内核；sing 内核不支持。V2bX 的 Trojan 不支持 Reality。
- V2bX 在节点没有任何可用用户时拒绝启动。

## 与原 PHP 版的差异（以官方实现为准）

- 去掉 HTTP/2 传输：Xray-core 已移除，V2bX 两个内核和 XrayR 都不支持。
- Trojan 只提供 TCP、WS、gRPC，且不支持 HTTP 伪装：V2bX 的 Xray 内核对 HTTPUpgrade 报错，sing 内核静默降级，Mihomo 忽略 HTTP 伪装。
- WebSocket 同时下发 `host` 和 `headers.Host`（Xray 已改用 `host`，V2bX sing 内核与 XrayR 只读 `headers.Host`）；
  路径中的 `?ed=` 在订阅中转换为 Mihomo 的 `max-early-data` 与 sing-box 的 `max_early_data`。
- 不再给 VLESS 下发 `encryption: "none"`（V2bX 会因此拒绝启动）。
- VMess 在订阅中使用 XUDP（Mihomo `packet-encoding: xudp`，sing-box `packet_encoding: xudp`）。
- Mieru：Mihomo 不允许 `port` 与 `port-range` 同时出现，端口范围只能一段；补上 `udp` 与 `traffic-pattern`。
- sing-box 订阅包含 Naive（1.13 起有 naive 出站），不包含开启 TLS 的 TCP HTTP 伪装（sing-box 会改用 HTTP/2）。
- TUIC 的 Mihomo 输出不再带无效的 `udp` 字段；sing-box 的 AnyTLS 不再默认 `alpn: h3`；Shadowsocks obfs 在 sing-box 中写作 `obfs-local`。

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

用户在 `/subscription` 生成链接，选择 Mihomo 或 Sing-box 格式导入。
链接重置立即使旧链接无法再下载；已经导入的节点凭据不会因此轮换。
订阅仅返回当前有效套餐中已启用且显示的节点；中转节点仅在父节点启用时出现。不包括管理密钥。

当前输出 JSON，Mihomo 可将其作为 YAML 解析。尚未使用真实客户端二进制做配置验收，
也没有进行节点连接测速。不能把接口响应成功当作代理连接成功。
