import { Check, type Icon } from "@phosphor-icons/react";
import {
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type MenuEntry =
    | {
          label: string;
          icon?: Icon;
          onSelect: () => void;
          tone?: "danger";
          disabled?: boolean;
          hint?: ReactNode;
      }
    | {
          label: string;
          checked: boolean;
          onToggle: () => void;
          hint?: ReactNode;
      }
    | { separator: true }
    | { heading: string };

type TriggerProps = {
    ref: React.Ref<HTMLButtonElement>;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
};

/**
 * Dropdown menu rendered in a fixed-position portal so it is never clipped by
 * scrolling tables. Arrow keys move focus, Esc closes and returns focus.
 * Checkbox entries keep the menu open so several can be toggled.
 */
export function Menu({
    trigger,
    entries,
    align = "start",
    width = 200,
}: {
    trigger: (props: TriggerProps) => ReactNode;
    entries: MenuEntry[];
    align?: "start" | "end";
    width?: number;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
    } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const close = (refocus = true) => {
        setOpen(false);
        if (refocus) triggerRef.current?.focus();
    };

    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const left = align === "end" ? rect.right - width : rect.left;
        const height = menuRef.current?.offsetHeight ?? 0;
        const below = rect.bottom + 4;
        const top =
            below + height > window.innerHeight && rect.top - height - 4 > 0
                ? rect.top - height - 4
                : below;
        setPosition({
            top,
            left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        });
    }, [open, align, width, entries.length]);

    useEffect(() => {
        if (!open) return;
        menuRef.current
            ?.querySelector<HTMLElement>(
                '[role^="menuitem"]:not([aria-disabled="true"])',
            )
            ?.focus();
        const onPointer = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                !menuRef.current?.contains(target) &&
                !triggerRef.current?.contains(target)
            )
                close(false);
        };
        const onScroll = (event: Event) => {
            if (!menuRef.current?.contains(event.target as Node)) close(false);
        };
        document.addEventListener("mousedown", onPointer);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onScroll);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onScroll);
        };
    }, [open]);

    const onKeyDown = (event: React.KeyboardEvent) => {
        const items = Array.from(
            menuRef.current?.querySelectorAll<HTMLElement>(
                '[role^="menuitem"]:not([aria-disabled="true"])',
            ) ?? [],
        );
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            items[(index + step + items.length) % items.length]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            items[event.key === "Home" ? 0 : items.length - 1]?.focus();
        } else if (event.key === "Escape") {
            event.preventDefault();
            close();
        } else if (event.key === "Tab") {
            close(false);
        }
    };

    const itemClass =
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors focus:bg-surface-subtle hover:bg-surface-subtle aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

    return (
        <>
            {trigger({
                ref: triggerRef,
                "aria-haspopup": "menu",
                "aria-expanded": open,
                "aria-controls": id,
                onClick: () => setOpen((value) => !value),
            })}
            {open
                ? createPortal(
                      <div
                          ref={menuRef}
                          id={id}
                          role="menu"
                          onKeyDown={onKeyDown}
                          style={{
                              position: "fixed",
                              top: position?.top ?? -9999,
                              left: position?.left ?? -9999,
                              width,
                          }}
                          className="animate-pop-in z-[70] max-h-80 overflow-y-auto rounded-lg border border-line bg-surface p-1 text-ink shadow-lg"
                      >
                          {entries.map((entry, index) => {
                              if ("separator" in entry)
                                  return (
                                      <div
                                          key={index}
                                          role="separator"
                                          className="-mx-1 my-1 h-px bg-line-subtle"
                                      />
                                  );
                              if ("heading" in entry)
                                  return (
                                      <p
                                          key={index}
                                          className="px-2 pt-1.5 pb-1 text-xs font-medium text-ink-subtle"
                                      >
                                          {entry.heading}
                                      </p>
                                  );
                              if ("checked" in entry)
                                  return (
                                      <div
                                          key={index}
                                          role="menuitemcheckbox"
                                          aria-checked={entry.checked}
                                          tabIndex={-1}
                                          onClick={entry.onToggle}
                                          onKeyDown={(event) => {
                                              if (
                                                  event.key === "Enter" ||
                                                  event.key === " "
                                              ) {
                                                  event.preventDefault();
                                                  entry.onToggle();
                                              }
                                          }}
                                          className={itemClass}
                                      >
                                          <span
                                              aria-hidden
                                              className={`grid size-4 shrink-0 place-items-center rounded border ${
                                                  entry.checked
                                                      ? "border-ink bg-ink text-paper"
                                                      : "border-line-strong"
                                              }`}
                                          >
                                              {entry.checked ? (
                                                  <Check
                                                      weight="bold"
                                                      className="size-3"
                                                  />
                                              ) : null}
                                          </span>
                                          <span className="flex-1 truncate">
                                              {entry.label}
                                          </span>
                                          {entry.hint ? (
                                              <span className="numeric text-xs text-ink-subtle">
                                                  {entry.hint}
                                              </span>
                                          ) : null}
                                      </div>
                                  );
                              const select = () => {
                                  if (entry.disabled) return;
                                  close();
                                  entry.onSelect();
                              };
                              return (
                                  <div
                                      key={index}
                                      role="menuitem"
                                      aria-disabled={
                                          entry.disabled || undefined
                                      }
                                      tabIndex={-1}
                                      onClick={select}
                                      onKeyDown={(event) => {
                                          if (
                                              event.key === "Enter" ||
                                              event.key === " "
                                          ) {
                                              event.preventDefault();
                                              select();
                                          }
                                      }}
                                      className={`${itemClass} ${
                                          entry.tone === "danger"
                                              ? "text-danger"
                                              : ""
                                      }`}
                                  >
                                      {entry.icon ? (
                                          <entry.icon
                                              aria-hidden
                                              className="size-4 shrink-0"
                                          />
                                      ) : null}
                                      <span className="flex-1 truncate">
                                          {entry.label}
                                      </span>
                                      {entry.hint ? (
                                          <span className="text-xs text-ink-subtle">
                                              {entry.hint}
                                          </span>
                                      ) : null}
                                  </div>
                              );
                          })}
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}
