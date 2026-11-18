import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import {
    useEffect,
    useState,
    type ComponentProps,
    type ReactNode,
} from "react";
import {
    useFieldArray,
    useForm,
    useFormContext,
    type FieldPath,
    type Resolver,
} from "react-hook-form";
import { toast } from "sonner";
import {
    ALPN_VALUES,
    CERT_MODES,
    defaultNodeSettings,
    FINGERPRINTS,
    NETWORKS_BY_PROTOCOL,
    NODE_PROTOCOLS,
    nodeBody,
    REALITY_NETWORKS,
    SS_CIPHERS,
    XHTTP_MODES,
    type NodeBody,
    type NodeProtocol,
} from "@xboard/contracts";
import { useCommand } from "@/api/panel";
import { CheckRow } from "@/components/check-row";
import { Fold } from "@/components/fold";
import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EditorSheet } from "./editor-sheet";
import {
    formatJsonField,
    generateRealityKeys,
    NETWORK_LABEL,
    parseJsonField,
    PROTOCOL_LABEL,
    randomShortId,
    splitLines,
    splitTags,
    toFormValues,
    type NodeFormValues,
} from "./node-options";
import type { NodeRow, PlanRow } from "./types";

type Name = FieldPath<NodeFormValues>;
type Option = { value: string; label: string };

/** Radix items cannot use "" as a value; "" and null show as this option. */
const NONE = "__none";
const shown = (value: unknown) =>
    value === "" || value === null || value === undefined
        ? NONE
        : String(value);
const itemValue = (value: string) => (value === "" ? NONE : value);
const stored = (value: string) => (value === NONE ? "" : value);

const V2RAY = ["vless", "vmess", "trojan"] as const;
const isV2ray = (p: NodeProtocol): p is (typeof V2RAY)[number] =>
    (V2RAY as readonly string[]).includes(p);

// The form validates with the API's own schema; its errors carry the same
// field paths as the form.
const resolver = zodResolver(nodeBody) as unknown as Resolver<NodeFormValues>;

// ---------- Field building blocks ----------

function Label({ children, info }: { children: ReactNode; info?: ReactNode }) {
    return info ? (
        <div className="flex items-center gap-inline">
            <FormLabel>{children}</FormLabel>
            <InfoTip label={typeof children === "string" ? children : "说明"}>
                {info}
            </InfoTip>
        </div>
    ) : (
        <FormLabel>{children}</FormLabel>
    );
}

const parseNumber = (text: string) =>
    text.trim() === "" ? null : Number(text.trim());

/** A number field that may be blank; non-numbers reach validation as NaN. */
function NumberInput({
    value,
    onChange,
    ...props
}: {
    value: number | null;
    onChange: (value: number | null) => void;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
    const [text, setText] = useState(value === null ? "" : String(value));
    useEffect(() => {
        setText((current) =>
            Object.is(parseNumber(current), value)
                ? current
                : value === null
                  ? ""
                  : String(value),
        );
    }, [value]);
    return (
        <Input
            inputMode="decimal"
            className="numeric"
            {...props}
            value={text}
            onChange={(e) => {
                setText(e.target.value);
                onChange(parseNumber(e.target.value));
            }}
        />
    );
}

function TextField({
    name,
    label,
    info,
    description,
    placeholder,
    className,
    mono,
}: {
    name: Name;
    label: string;
    info?: ReactNode;
    description?: ReactNode;
    placeholder?: string;
    className?: string;
    mono?: boolean;
}) {
    const { control } = useFormContext<NodeFormValues>();
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem className={className}>
                    <Label info={info}>{label}</Label>
                    <FormControl>
                        <Input
                            placeholder={placeholder}
                            className={mono ? "numeric" : undefined}
                            autoComplete="off"
                            {...field}
                            value={(field.value as string | undefined) ?? ""}
                        />
                    </FormControl>
                    {description ? (
                        <FormDescription>{description}</FormDescription>
                    ) : null}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function NumberField({
    name,
    label,
    info,
    description,
    placeholder,
    className,
}: {
    name: Name;
    label: string;
    info?: ReactNode;
    description?: ReactNode;
    placeholder?: string;
    className?: string;
}) {
    const { control } = useFormContext<NodeFormValues>();
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem className={className}>
                    <Label info={info}>{label}</Label>
                    <FormControl>
                        <NumberInput
                            placeholder={placeholder}
                            value={field.value as number | null}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                        />
                    </FormControl>
                    {description ? (
                        <FormDescription>{description}</FormDescription>
                    ) : null}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function SelectField({
    name,
    label,
    info,
    description,
    options,
    className,
    disabled,
    onValueChange,
}: {
    name: Name;
    label: string;
    info?: ReactNode;
    description?: ReactNode;
    options: Option[];
    className?: string;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
}) {
    const { control } = useFormContext<NodeFormValues>();
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem className={className}>
                    <Label info={info}>{label}</Label>
                    <Select
                        value={shown(field.value)}
                        onValueChange={(v) =>
                            onValueChange
                                ? onValueChange(v)
                                : field.onChange(stored(v))
                        }
                        disabled={disabled}
                    >
                        <FormControl>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {options.map((o) => (
                                <SelectItem
                                    key={o.value}
                                    value={itemValue(o.value)}
                                >
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {description ? (
                        <FormDescription>{description}</FormDescription>
                    ) : null}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

/** 2–4 mutually exclusive options in one row. `parse` maps the radio string back. */
function RadioField({
    name,
    label,
    info,
    description,
    options,
    parse,
}: {
    name: Name;
    label: string;
    info?: ReactNode;
    description?: ReactNode;
    options: Option[];
    parse?: (value: string) => unknown;
}) {
    const { control } = useFormContext<NodeFormValues>();
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <Label info={info}>{label}</Label>
                    <FormControl>
                        <RadioGroup
                            value={shown(field.value)}
                            onValueChange={(v) =>
                                field.onChange(parse ? parse(v) : stored(v))
                            }
                            className="flex flex-wrap gap-x-group gap-y-field"
                        >
                            {options.map((o) => (
                                <label
                                    key={o.value}
                                    className="flex items-center gap-inline text-sm"
                                >
                                    <RadioGroupItem
                                        value={itemValue(o.value)}
                                        aria-label={o.label}
                                    />
                                    {o.label}
                                </label>
                            ))}
                        </RadioGroup>
                    </FormControl>
                    {description ? (
                        <FormDescription>{description}</FormDescription>
                    ) : null}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function CheckField({
    name,
    label,
    description,
}: {
    name: Name;
    label: string;
    description?: ReactNode;
}) {
    const { control } = useFormContext<NodeFormValues>();
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <CheckRow
                    label={label}
                    description={description}
                    checked={field.value === true}
                    onCheckedChange={field.onChange}
                />
            )}
        />
    );
}

/** A textarea whose value is a list of lines, or JSON. */
function TextareaField({
    name,
    label,
    info,
    description,
    placeholder,
    mode,
}: {
    name: Name;
    label: string;
    info?: ReactNode;
    description?: ReactNode;
    placeholder?: string;
    mode: "lines" | "json" | "text";
}) {
    const { control, getValues } = useFormContext<NodeFormValues>();
    const format = (value: unknown) =>
        mode === "lines"
            ? ((value as string[] | undefined) ?? []).join("\n")
            : mode === "json"
              ? formatJsonField(value)
              : ((value as string | undefined) ?? "");
    const [text, setText] = useState(() => format(getValues(name)));
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <Label info={info}>{label}</Label>
                    <FormControl>
                        <Textarea
                            className="numeric max-h-64 text-xs"
                            placeholder={placeholder}
                            spellCheck={false}
                            value={text}
                            onBlur={field.onBlur}
                            onChange={(e) => {
                                setText(e.target.value);
                                field.onChange(
                                    mode === "lines"
                                        ? splitLines(e.target.value)
                                        : mode === "json"
                                          ? parseJsonField(e.target.value)
                                          : e.target.value,
                                );
                            }}
                        />
                    </FormControl>
                    {description ? (
                        <FormDescription>{description}</FormDescription>
                    ) : null}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-group border-t pt-group">
            <h3 className="text-sm font-medium">{title}</h3>
            {children}
        </section>
    );
}

const options = (values: readonly string[], labels?: Record<string, string>) =>
    values.map((value) => ({ value, label: labels?.[value] ?? value }));

// ---------- Option groups ----------

function TlsFields({ alpnDefault }: { alpnDefault?: string }) {
    const { control } = useFormContext<NodeFormValues>();
    return (
        <>
            <TextField
                name="settings.tls.serverName"
                label="SNI"
                placeholder="node.example.com"
                description="留空时使用节点地址"
                mono
            />
            <FormField
                control={control}
                name="settings.tls.alpn"
                render={({ field }) => {
                    const value = (field.value as string[] | undefined) ?? [];
                    return (
                        <FormItem>
                            <Label
                                info={
                                    alpnDefault
                                        ? `不选时为 ${alpnDefault}。`
                                        : "不选时由客户端决定。"
                                }
                            >
                                ALPN
                            </Label>
                            <div className="flex flex-wrap gap-x-group gap-y-field">
                                {ALPN_VALUES.map((alpn) => (
                                    <label
                                        key={alpn}
                                        className="flex items-center gap-inline text-sm"
                                    >
                                        <Checkbox
                                            checked={value.includes(alpn)}
                                            onCheckedChange={(checked) =>
                                                field.onChange(
                                                    checked
                                                        ? ALPN_VALUES.filter(
                                                              (a) =>
                                                                  a === alpn ||
                                                                  value.includes(
                                                                      a,
                                                                  ),
                                                          )
                                                        : value.filter(
                                                              (a) => a !== alpn,
                                                          ),
                                                )
                                            }
                                        />
                                        <span className="numeric">{alpn}</span>
                                    </label>
                                ))}
                            </div>
                            <FormMessage />
                        </FormItem>
                    );
                }}
            />
            <CheckField
                name="settings.tls.allowInsecure"
                label="允许不安全的证书"
                description="客户端不校验证书，仅用于自签证书。"
            />
        </>
    );
}

function RealityFields() {
    const { setValue } = useFormContext<NodeFormValues>();
    const [pending, setPending] = useState(false);
    const generate = async () => {
        setPending(true);
        try {
            const keys = await generateRealityKeys();
            const opts = { shouldDirty: true, shouldValidate: true };
            setValue("settings.reality.privateKey", keys.privateKey, opts);
            setValue("settings.reality.publicKey", keys.publicKey, opts);
            setValue("settings.reality.shortId", randomShortId(), opts);
        } catch {
            toast.error(
                "当前浏览器不支持生成 X25519 密钥，请用 xray x25519 生成后填写。",
            );
        } finally {
            setPending(false);
        }
    };
    return (
        <>
            <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-group">
                <TextField
                    name="settings.reality.serverName"
                    label="目标网站"
                    info="Reality 借用该网站的 TLS 握手，需支持 TLS 1.3 与 HTTP/2。客户端的 SNI 也使用此域名。"
                    placeholder="www.microsoft.com"
                    mono
                />
                <NumberField name="settings.reality.serverPort" label="端口" />
            </div>
            <div className="flex items-center justify-between gap-inline">
                <span className="text-sm font-medium">密钥</span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void generate()}
                >
                    <KeyRound />
                    生成
                </Button>
            </div>
            <TextField
                name="settings.reality.privateKey"
                label="私钥"
                info="只下发给节点，不会出现在订阅中。"
                mono
            />
            <TextField name="settings.reality.publicKey" label="公钥" mono />
            <TextField
                name="settings.reality.shortId"
                label="Short ID"
                description="0–16 位十六进制，长度为偶数"
                placeholder="0123abcd"
                mono
            />
        </>
    );
}

function TransportFields({
    protocol,
    reality,
}: {
    protocol: (typeof V2RAY)[number];
    reality: boolean;
}) {
    const { watch } = useFormContext<NodeFormValues>();
    const network = watch("settings.transport.network") as string;
    const headerType = watch("settings.transport.headerType") as string;
    const networks = NETWORKS_BY_PROTOCOL[protocol].filter(
        (n) => !reality || REALITY_NETWORKS.includes(n),
    );
    const usesPath =
        ["ws", "httpupgrade", "xhttp"].includes(network) ||
        (network === "tcp" && headerType === "http");
    return (
        <>
            <SelectField
                name="settings.transport.network"
                label="传输方式"
                options={options(networks, NETWORK_LABEL)}
            />
            {network === "tcp" && protocol !== "trojan" && !reality ? (
                <RadioField
                    name="settings.transport.headerType"
                    label="TCP 伪装"
                    options={[
                        { value: "none", label: "无" },
                        { value: "http", label: "HTTP" },
                    ]}
                />
            ) : null}
            {network === "grpc" ? (
                <TextField
                    name="settings.transport.serviceName"
                    label="服务名"
                    placeholder="grpc"
                    mono
                />
            ) : null}
            {usesPath ? (
                <div className="grid gap-group sm:grid-cols-2">
                    <TextField
                        name="settings.transport.path"
                        label="路径"
                        info={
                            network === "ws"
                                ? "末尾加 ?ed=2048 开启 early data，订阅会转换成客户端各自的参数。"
                                : undefined
                        }
                        placeholder="/ws"
                        mono
                    />
                    <TextField
                        name="settings.transport.host"
                        label="Host"
                        placeholder="cdn.example.com"
                        mono
                    />
                </div>
            ) : null}
            {network === "xhttp" ? (
                <SelectField
                    name="settings.transport.mode"
                    label="XHTTP 模式"
                    description="XHTTP 需要节点使用 Xray 内核；sing-box 订阅不包含该节点"
                    options={options(XHTTP_MODES)}
                />
            ) : null}
        </>
    );
}

const FINGERPRINT_OPTIONS = [
    { value: "", label: "不使用" },
    ...options(FINGERPRINTS),
];

function FingerprintField({ reality }: { reality: boolean }) {
    return (
        <SelectField
            name="settings.fingerprint"
            label="uTLS 指纹"
            info="客户端模拟的浏览器 TLS 指纹。"
            options={FINGERPRINT_OPTIONS}
            description={reality ? "Reality 不选时使用 chrome" : undefined}
        />
    );
}

function V2rayFields({ protocol }: { protocol: (typeof V2RAY)[number] }) {
    const { watch } = useFormContext<NodeFormValues>();
    const security = watch("settings.security") as string;
    const securityOptions =
        protocol === "vless"
            ? [
                  { value: "tls", label: "TLS" },
                  { value: "reality", label: "Reality" },
                  { value: "none", label: "无" },
              ]
            : protocol === "trojan"
              ? [
                    { value: "tls", label: "TLS" },
                    { value: "reality", label: "Reality" },
                ]
              : [
                    { value: "tls", label: "TLS" },
                    { value: "none", label: "无" },
                ];
    return (
        <>
            <RadioField
                name="settings.security"
                label="安全"
                options={securityOptions}
            />
            {security === "tls" ? <TlsFields /> : null}
            {security === "reality" ? <RealityFields /> : null}
            {security !== "none" ? (
                <FingerprintField reality={security === "reality"} />
            ) : null}
            <TransportFields
                protocol={protocol}
                reality={security === "reality"}
            />
            {protocol === "vless" ? (
                <SelectField
                    name="settings.flow"
                    label="流控"
                    description="仅用于 TCP 传输，并启用 TLS 或 Reality"
                    options={[
                        { value: "", label: "无" },
                        {
                            value: "xtls-rprx-vision",
                            label: "xtls-rprx-vision",
                        },
                    ]}
                />
            ) : null}
        </>
    );
}

function PortHoppingFields() {
    return (
        <div className="grid grid-cols-2 gap-group">
            <TextField
                name="settings.ports"
                label="端口跳跃"
                info="客户端在这些端口间轮换连接。服务器需把这些端口转发到服务端口，例如用 iptables。"
                placeholder="20000-50000"
                mono
            />
            <NumberField
                name="settings.hopInterval"
                label="跳跃间隔（秒）"
                placeholder="30"
            />
        </div>
    );
}

function BandwidthFields({ required }: { required?: boolean }) {
    return (
        <div className="grid grid-cols-2 gap-group">
            <NumberField
                name="settings.upMbps"
                label="上行（Mbps）"
                info={required ? undefined : "留空时不限制带宽，由客户端协商。"}
            />
            <NumberField name="settings.downMbps" label="下行（Mbps）" />
        </div>
    );
}

function ProtocolFields({ protocol }: { protocol: NodeProtocol }) {
    const { watch, setValue } = useFormContext<NodeFormValues>();
    const settings = watch("settings");
    if (isV2ray(protocol)) return <V2rayFields protocol={protocol} />;
    switch (protocol) {
        case "shadowsocks":
            return (
                <>
                    <SelectField
                        name="settings.cipher"
                        label="加密方式"
                        info="2022 系列需要节点后端支持 Shadowsocks 2022，客户端密码由面板派生。"
                        options={options(SS_CIPHERS)}
                    />
                    <RadioField
                        name="settings.plugin"
                        label="插件"
                        options={[
                            { value: "", label: "无" },
                            { value: "obfs", label: "obfs" },
                            { value: "v2ray-plugin", label: "v2ray-plugin" },
                        ]}
                    />
                    {settings.plugin ? (
                        <TextField
                            name="settings.pluginOpts"
                            label="插件参数"
                            placeholder={
                                settings.plugin === "obfs"
                                    ? "obfs=http;obfs-host=www.bing.com"
                                    : "tls;host=cdn.example.com;path=/ws"
                            }
                            mono
                        />
                    ) : null}
                </>
            );
        case "hysteria2":
            return (
                <>
                    <TlsFields alpnDefault="h3" />
                    <CheckRow
                        label="Salamander 混淆"
                        description="开启后，不支持混淆的客户端无法连接。"
                        checked={settings.obfs === "salamander"}
                        onCheckedChange={(checked) =>
                            setValue(
                                "settings.obfs",
                                checked ? "salamander" : "",
                                {
                                    shouldDirty: true,
                                },
                            )
                        }
                    />
                    {settings.obfs ? (
                        <TextField
                            name="settings.obfsPassword"
                            label="混淆密码"
                            mono
                        />
                    ) : null}
                    <BandwidthFields />
                    <PortHoppingFields />
                </>
            );
        case "hysteria":
            return (
                <>
                    <TlsFields alpnDefault="hysteria" />
                    <TextField
                        name="settings.obfsPassword"
                        label="混淆密码"
                        description="留空时不混淆"
                        mono
                    />
                    <BandwidthFields required />
                    <PortHoppingFields />
                </>
            );
        case "tuic":
            return (
                <>
                    <TlsFields alpnDefault="h3" />
                    <RadioField
                        name="settings.version"
                        label="版本"
                        options={[
                            { value: "5", label: "v5" },
                            { value: "4", label: "v4" },
                        ]}
                        parse={Number}
                        description={
                            settings.version === 4
                                ? "sing-box 不支持 v4，该节点不会出现在 sing-box 订阅中"
                                : undefined
                        }
                    />
                    <RadioField
                        name="settings.congestionControl"
                        label="拥塞控制"
                        options={options(["cubic", "new_reno", "bbr"])}
                    />
                    <RadioField
                        name="settings.udpRelayMode"
                        label="UDP 转发"
                        options={options(["native", "quic"])}
                    />
                </>
            );
        case "anytls":
            return (
                <>
                    <TlsFields />
                    <Fold
                        title="填充方案"
                        fields={["settings.paddingScheme"]}
                        status={
                            settings.paddingScheme?.length ? (
                                <Badge variant="secondary">已设置</Badge>
                            ) : null
                        }
                    >
                        <TextareaField
                            name="settings.paddingScheme"
                            label="规则"
                            description="每行一条，留空时使用节点后端的默认方案"
                            placeholder={"stop=8\n0=30-30\n1=100-400"}
                            mode="lines"
                        />
                    </Fold>
                </>
            );
        case "socks":
        case "http":
            return (
                <>
                    <RadioField
                        name="settings.security"
                        label="安全"
                        options={[
                            { value: "none", label: "无" },
                            { value: "tls", label: "TLS" },
                        ]}
                        description={
                            protocol === "socks" && settings.security === "tls"
                                ? "sing-box 的 SOCKS 不支持 TLS，该节点不会出现在 sing-box 订阅中；Mihomo 以节点地址作为 SNI"
                                : undefined
                        }
                    />
                    {settings.security === "tls" ? <TlsFields /> : null}
                </>
            );
        case "naive":
            return (
                <>
                    <p className="text-sm text-muted-foreground">
                        Mihomo 订阅不包含 Naive 节点；sing-box 需 1.13
                        及以上版本，且须包含 cronet。
                    </p>
                    <TlsFields />
                </>
            );
        case "mieru":
            return (
                <>
                    <p className="text-sm text-muted-foreground">
                        sing-box 订阅不包含 Mieru 节点。
                    </p>
                    <RadioField
                        name="settings.transport"
                        label="传输"
                        options={options(["TCP", "UDP"])}
                    />
                    <TextField
                        name="settings.ports"
                        label="端口范围"
                        description="只能填一段；留空时只使用连接端口"
                        placeholder="30000-30100"
                        mono
                    />
                    <Fold title="高级" fields={["settings.trafficPattern"]}>
                        <TextField
                            name="settings.trafficPattern"
                            label="流量模式"
                            info="mieru 的流量模式编码，只下发给节点。"
                            mono
                        />
                    </Fold>
                </>
            );
    }
}

/** Protocols whose TLS can carry ECH, given the chosen security. */
function hasEch(protocol: NodeProtocol, security: unknown) {
    if (isV2ray(protocol) || protocol === "socks" || protocol === "http")
        return security === "tls";
    return ["hysteria2", "hysteria", "tuic", "anytls", "naive"].includes(
        protocol,
    );
}

function MultiplexFold() {
    const { watch } = useFormContext<NodeFormValues>();
    const m = watch("settings.multiplex") as
        { enabled: boolean; brutal: boolean } | undefined;
    return (
        <Fold
            title="多路复用"
            fields={["settings.multiplex"]}
            status={
                m?.enabled ? <Badge variant="secondary">已启用</Badge> : null
            }
        >
            <CheckField
                name="settings.multiplex.enabled"
                label="启用多路复用"
                description="写入订阅的客户端设置。V2bX 的多路复用需在节点本机配置中开启。"
            />
            {m?.enabled ? (
                <>
                    <RadioField
                        name="settings.multiplex.protocol"
                        label="复用协议"
                        options={options(["smux", "yamux", "h2mux"])}
                    />
                    <NumberField
                        name="settings.multiplex.maxConnections"
                        label="最大连接数"
                        description="留空时由客户端决定"
                    />
                    <CheckField
                        name="settings.multiplex.padding"
                        label="填充"
                    />
                    <CheckField
                        name="settings.multiplex.brutal"
                        label="TCP Brutal"
                        description="需要服务器加载 tcp-brutal 内核模块。"
                    />
                    {m.brutal ? (
                        <div className="grid grid-cols-2 gap-group">
                            <NumberField
                                name="settings.multiplex.brutalUpMbps"
                                label="上行（Mbps）"
                            />
                            <NumberField
                                name="settings.multiplex.brutalDownMbps"
                                label="下行（Mbps）"
                            />
                        </div>
                    ) : null}
                </>
            ) : null}
        </Fold>
    );
}

function EchFold() {
    const { watch } = useFormContext<NodeFormValues>();
    const enabled = watch("settings.tls.ech.enabled") === true;
    return (
        <Fold
            title="ECH"
            fields={["settings.tls.ech"]}
            status={enabled ? <Badge variant="secondary">已启用</Badge> : null}
        >
            <CheckField
                name="settings.tls.ech.enabled"
                label="启用 ECH"
                description="加密 TLS 握手中的 SNI。"
            />
            {enabled ? (
                <>
                    <TextareaField
                        name="settings.tls.ech.config"
                        label="ECH 配置"
                        info="客户端使用的 ECHConfigList（base64 或 PEM）。留空时客户端通过 DNS 查询。"
                        mode="text"
                    />
                    <TextField
                        name="settings.tls.ech.queryServerName"
                        label="查询域名"
                        placeholder="public.example.com"
                        mono
                    />
                    <TextareaField
                        name="settings.tls.ech.key"
                        label="ECH 密钥"
                        info="服务端密钥，只下发给节点，不会出现在订阅中。V2bX 不读取，需在节点本机配置。"
                        mode="text"
                    />
                </>
            ) : null}
        </Fold>
    );
}

function RateRangesFold() {
    const { control } = useFormContext<NodeFormValues>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: "rateRanges",
    });
    return (
        <Fold
            title="时段倍率"
            fields={["rateRanges"]}
            status={
                fields.length ? (
                    <Badge variant="secondary">{fields.length} 个时段</Badge>
                ) : null
            }
        >
            <div className="flex items-center gap-inline text-sm text-muted-foreground">
                按北京时间匹配，不在任何时段内时使用基础倍率。
                <InfoTip label="时段规则">
                    首尾分钟都包含在内；开始晚于结束时跨过零点。多个时段重叠时取第一个。
                </InfoTip>
            </div>
            {fields.map((item, index) => (
                <div
                    key={item.id}
                    className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-inline"
                >
                    <TextField
                        name={`rateRanges.${index}.start`}
                        label="开始"
                        placeholder="23:00"
                        mono
                    />
                    <TextField
                        name={`rateRanges.${index}.end`}
                        label="结束"
                        placeholder="06:59"
                        mono
                    />
                    <NumberField
                        name={`rateRanges.${index}.rate`}
                        label="倍率"
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="删除时段"
                        onClick={() => remove(index)}
                    >
                        <Trash2 />
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fields.length >= 24}
                onClick={() =>
                    append({ start: "00:00", end: "06:59", rate: 1 })
                }
            >
                <Plus />
                添加时段
            </Button>
        </Fold>
    );
}

function CertFold() {
    const { watch } = useFormContext<NodeFormValues>();
    const mode = watch("certConfig.mode");
    return (
        <Fold
            title="证书"
            fields={["certConfig"]}
            status={
                mode !== "none" ? (
                    <Badge variant="secondary">{mode}</Badge>
                ) : null
            }
        >
            <SelectField
                name="certConfig.mode"
                label="证书模式"
                info="以 cert_config 下发，V2bX 与 XrayR 不读取，它们使用本机配置文件中的 CertConfig。"
                options={options(CERT_MODES, {
                    none: "不下发",
                    file: "本地文件",
                    http: "ACME HTTP 验证",
                    dns: "ACME DNS 验证",
                    self: "自签证书",
                })}
            />
            {mode !== "none" ? (
                <TextField
                    name="certConfig.domain"
                    label="证书域名"
                    placeholder="node.example.com"
                    mono
                />
            ) : null}
            {mode === "file" ? (
                <>
                    <TextField
                        name="certConfig.certFile"
                        label="证书路径"
                        placeholder="/etc/ssl/fullchain.pem"
                        mono
                    />
                    <TextField
                        name="certConfig.keyFile"
                        label="私钥路径"
                        placeholder="/etc/ssl/privkey.pem"
                        mono
                    />
                </>
            ) : null}
            {mode === "http" || mode === "dns" ? (
                <TextField
                    name="certConfig.email"
                    label="ACME 邮箱"
                    placeholder="ops@example.com"
                    mono
                />
            ) : null}
            {mode === "dns" ? (
                <>
                    <TextField
                        name="certConfig.provider"
                        label="DNS 服务商"
                        placeholder="cloudflare"
                        mono
                    />
                    <TextareaField
                        name="certConfig.dnsEnv"
                        label="DNS 凭据"
                        description="每行一个 KEY=VALUE"
                        placeholder="CF_DNS_API_TOKEN=..."
                        mode="text"
                    />
                </>
            ) : null}
        </Fold>
    );
}

function RoutingFold() {
    const { watch } = useFormContext<NodeFormValues>();
    const count = [
        watch("routes"),
        watch("customOutbounds"),
        watch("customRoutes"),
    ]
        .map((v) => (Array.isArray(v) ? v.length : 0))
        .reduce((a, b) => a + b, 0);
    return (
        <Fold
            title="路由与出站"
            fields={["routes", "customOutbounds", "customRoutes"]}
            status={
                count ? <Badge variant="secondary">{count} 项</Badge> : null
            }
        >
            <TextareaField
                name="routes"
                label="路由规则"
                info={
                    <>
                        V2bX 的 routes：action 为 block 时拦截 match
                        中的域名正则或 protocol:bittorrent；为 dns 时把 match
                        中的域名交给 actionValue 指定的 DNS。
                    </>
                }
                description="JSON 数组，留空表示无"
                placeholder={
                    '[{"match": ["regexp:.*\\\\.ads\\\\..*"], "action": "block"}]'
                }
                mode="json"
            />
            <TextareaField
                name="customOutbounds"
                label="自定义出站"
                info="原样下发为 custom_outbounds，格式取决于节点后端（如 v2node 使用 Xray outbound 对象）。"
                description="JSON 对象数组"
                mode="json"
            />
            <TextareaField
                name="customRoutes"
                label="自定义路由"
                info="原样下发为 custom_routes，格式取决于节点后端。"
                description="JSON 对象数组"
                mode="json"
            />
        </Fold>
    );
}

function TagsField() {
    const { control, getValues } = useFormContext<NodeFormValues>();
    const [text, setText] = useState(() => getValues("tags").join(", "));
    return (
        <FormField
            control={control}
            name="tags"
            render={({ field }) => (
                <FormItem>
                    <Label>标签</Label>
                    <FormControl>
                        <Input
                            value={text}
                            placeholder="香港, IPLC"
                            onBlur={field.onBlur}
                            onChange={(e) => {
                                setText(e.target.value);
                                field.onChange(splitTags(e.target.value));
                            }}
                        />
                    </FormControl>
                    <FormDescription>用逗号分隔，最多 10 个</FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function PlansField({ plans }: { plans: PlanRow[] }) {
    const { control } = useFormContext<NodeFormValues>();
    return (
        <FormField
            control={control}
            name="planIds"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>可使用的套餐</FormLabel>
                    <div className="grid gap-field">
                        {plans.length ? (
                            plans.map((plan) => (
                                <label
                                    key={plan.id}
                                    className="flex items-center gap-inline text-sm"
                                >
                                    <Checkbox
                                        checked={field.value.includes(plan.id)}
                                        onCheckedChange={(checked) =>
                                            field.onChange(
                                                checked
                                                    ? [...field.value, plan.id]
                                                    : field.value.filter(
                                                          (id) =>
                                                              id !== plan.id,
                                                      ),
                                            )
                                        }
                                    />
                                    {plan.name}
                                    {plan.published ? null : (
                                        <Badge variant="outline">未发布</Badge>
                                    )}
                                </label>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                暂无套餐，可前往
                                <Link
                                    to="/admin/plans"
                                    search={{ new: true }}
                                    className="text-foreground underline underline-offset-4"
                                >
                                    套餐页
                                </Link>
                                创建。
                            </p>
                        )}
                    </div>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

// ---------- The sheet ----------

export function NodeSheet({
    node,
    nodes,
    plans,
    open,
    onClose,
    onToken,
}: {
    node: NodeRow | null;
    nodes: NodeRow[];
    plans: PlanRow[];
    open: boolean;
    onClose: () => void;
    onToken: (value: { id: number; token: string }) => void;
}) {
    const save = useCommand({ inline: true });
    const form = useForm<NodeFormValues>({
        resolver,
        values: toFormValues(node),
    });
    // Opening the sheet starts from the saved values (or a blank "new"
    // form), never from a draft left by the previous open.
    useEffect(() => {
        if (open) form.reset();
    }, [open, form]);
    const protocol = form.watch("protocol");
    const parentId = form.watch("parentId");
    const security = form.watch("settings.security");
    const relay = parentId !== null;
    const parent = nodes.find((n) => n.id === parentId) ?? null;
    const hasRelays = node ? nodes.some((n) => n.parentId === node.id) : false;
    const parentOptions = nodes.filter(
        (n) => n.parentId === null && n.id !== node?.id,
    );

    const changeProtocol = (value: string) => {
        const next = value as NodeProtocol;
        form.setValue("protocol", next, { shouldDirty: true });
        form.setValue("settings", defaultNodeSettings(next), {
            shouldDirty: true,
        });
        form.clearErrors("settings");
    };
    const changeParent = (value: string) => {
        const id = value === NONE ? null : Number(value);
        form.setValue("parentId", id, { shouldDirty: true });
        const target = nodes.find((n) => n.id === id);
        if (target && target.protocol !== form.getValues("protocol"))
            changeProtocol(target.protocol);
    };

    return (
        <EditorSheet
            open={open}
            onOpenChange={(value) => !value && onClose()}
            title={node ? `编辑节点 #${node.id}` : "新建节点"}
            description={node ? node.name : undefined}
            formId="node-form"
            submitLabel={node ? "保存修改" : "创建节点"}
            pending={save.isPending}
            error={save.error}
            wide
        >
            <Form {...form}>
                <form
                    id="node-form"
                    className="space-y-group"
                    onSubmit={form.handleSubmit((values) => {
                        const body = values as unknown as NodeBody;
                        save.mutate(
                            {
                                path: node
                                    ? `/admin/nodes/${node.id}`
                                    : "/admin/nodes",
                                method: node ? "PUT" : "POST",
                                body,
                            },
                            {
                                onSuccess: (result) => {
                                    if (typeof result.token === "string")
                                        onToken({
                                            id: Number(result.id),
                                            token: result.token,
                                        });
                                    toast.success(
                                        node ? "节点已保存" : "节点已创建",
                                    );
                                    onClose();
                                },
                            },
                        );
                    })}
                >
                    <TextField name="name" label="名称" />
                    <div className="grid gap-group sm:grid-cols-2">
                        <SelectField
                            name="protocol"
                            label="协议"
                            options={NODE_PROTOCOLS.map((p) => ({
                                value: p,
                                label: PROTOCOL_LABEL[p],
                            }))}
                            onValueChange={changeProtocol}
                            disabled={relay}
                        />
                        <SelectField
                            name="parentId"
                            label="父节点"
                            info="设置后，本节点作为父节点的中转入口：订阅中使用本节点的名称、地址和端口，其余协议设置沿用父节点，由父节点的后端提供服务并计费。"
                            options={[
                                { value: "", label: "无" },
                                ...parentOptions.map((n) => ({
                                    value: String(n.id),
                                    label: `#${n.id} ${n.name}（${PROTOCOL_LABEL[n.protocol]}）`,
                                })),
                            ]}
                            onValueChange={changeParent}
                            disabled={hasRelays}
                            description={
                                hasRelays
                                    ? "该节点下有中转节点，不能再设为中转"
                                    : undefined
                            }
                        />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-group">
                        <TextField
                            name="host"
                            label="地址"
                            placeholder="node.example.com"
                            mono
                        />
                        <NumberField name="port" label="连接端口" />
                    </div>
                    {relay ? null : (
                        <div className="grid grid-cols-2 gap-group">
                            <NumberField
                                name="serverPort"
                                label="服务端口"
                                info="节点后端监听的端口。经过端口转发或中转时，可以与客户端连接的端口不同。"
                            />
                            <NumberField
                                name="rate"
                                label="倍率"
                                info="用户在该节点产生的流量乘以倍率后计入已用流量，最多两位小数；0 表示不计流量。"
                            />
                        </div>
                    )}
                    <TagsField />

                    <Section title="协议设置">
                        {relay ? (
                            <p className="text-sm text-muted-foreground">
                                沿用父节点{" "}
                                {parent ? `#${parent.id} ${parent.name}` : ""}{" "}
                                的协议设置、服务端口和倍率。
                            </p>
                        ) : (
                            <ProtocolFields
                                key={protocol}
                                protocol={protocol}
                            />
                        )}
                    </Section>

                    <Section title="套餐与显示">
                        <PlansField plans={plans} />
                        <CheckField
                            name="enabled"
                            label="启用节点"
                            description="停用后，节点将无法获取用户列表。"
                        />
                        <CheckField
                            name="visible"
                            label="在订阅中显示"
                            description="隐藏后用户订阅中不包含该节点，节点仍为已导入的用户提供服务。"
                        />
                    </Section>

                    {relay ? null : (
                        <Section title="高级">
                            <div className="space-y-field">
                                <RateRangesFold />
                                {isV2ray(protocol) ? <MultiplexFold /> : null}
                                {hasEch(protocol, security) ? (
                                    <EchFold />
                                ) : null}
                                <CertFold />
                                <RoutingFold />
                            </div>
                        </Section>
                    )}
                </form>
            </Form>
        </EditorSheet>
    );
}
