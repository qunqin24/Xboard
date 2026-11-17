import { Node } from "@prisma/client";

// Keep backend and client parameters in lockstep: TCP + TLS, no Reality/WS.
export function mihomo(nodes: Node[], uuid: string) {
    const proxies = nodes.map((node) => {
        const base = {
            name: `${node.name} #${node.id}`,
            server: node.host,
            port: node.port,
        };
        const tls = {
            tls: true,
            servername: node.serverName || node.host,
            "skip-cert-verify": false,
        };
        switch (node.protocol) {
            case "vmess":
                return {
                    ...base,
                    ...tls,
                    type: "vmess",
                    uuid,
                    alterId: 0,
                    cipher: "auto",
                    network: "tcp",
                };
            case "vless":
                return {
                    ...base,
                    ...tls,
                    type: "vless",
                    uuid,
                    network: "tcp",
                    udp: true,
                };
            case "trojan":
                return {
                    ...base,
                    type: "trojan",
                    password: uuid,
                    sni: tls.servername,
                    "skip-cert-verify": false,
                };
            case "shadowsocks":
                return {
                    ...base,
                    type: "ss",
                    cipher: node.cipher,
                    password: uuid,
                    udp: true,
                };
            case "hysteria2":
                return {
                    ...base,
                    type: "hysteria2",
                    password: uuid,
                    sni: tls.servername,
                    "skip-cert-verify": false,
                };
            case "tuic":
                return {
                    ...base,
                    type: "tuic",
                    uuid,
                    password: uuid,
                    sni: tls.servername,
                    "congestion-controller": "bbr",
                    "skip-cert-verify": false,
                };
        }
    });
    return {
        "mixed-port": 7890,
        mode: "rule",
        proxies,
        "proxy-groups": [
            {
                name: "Proxy",
                type: "select",
                proxies: proxies.map((p) => p.name),
            },
        ],
        rules: ["MATCH,Proxy"],
    };
}

export function singbox(nodes: Node[], uuid: string) {
    const outbounds = nodes.map((node) => {
        const base = {
            type: node.protocol,
            tag: `${node.name} #${node.id}`,
            server: node.host,
            server_port: node.port,
        };
        const tls = {
            enabled: true,
            server_name: node.serverName || node.host,
        };
        switch (node.protocol) {
            case "vmess":
                return { ...base, uuid, security: "auto", alter_id: 0, tls };
            case "vless":
                return { ...base, uuid, tls };
            case "trojan":
            case "hysteria2":
                return { ...base, password: uuid, tls };
            case "shadowsocks":
                return { ...base, method: node.cipher, password: uuid };
            case "tuic":
                return {
                    ...base,
                    uuid,
                    password: uuid,
                    congestion_control: "bbr",
                    tls,
                };
        }
    });
    return {
        inbounds: [
            {
                type: "mixed",
                tag: "mixed-in",
                listen: "127.0.0.1",
                listen_port: 7890,
            },
        ],
        outbounds: [
            {
                type: "selector",
                tag: "Proxy",
                outbounds: outbounds.map((o) => o.tag),
            },
            ...outbounds,
        ],
        route: { final: "Proxy" },
    };
}
