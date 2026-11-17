// Public JSON serialization retains BigInt precision without exposing hidden fields.
export function json<T>(value: T): unknown {
    return JSON.parse(
        JSON.stringify(value, (_key, item) =>
            typeof item === "bigint" ? item.toString() : item,
        ),
    );
}
