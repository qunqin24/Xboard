import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

/** `?edit=<id>` opens a record's sheet, `?new=true` opens a blank one. */
export const editorSearchSchema = z.object({
    edit: z.coerce.number().int().positive().optional().catch(undefined),
    new: z.boolean().optional().catch(undefined),
});

export function useEditorSearch(
    to: "/admin/plans" | "/admin/nodes" | "/admin/notices",
) {
    const search = useSearch({ strict: false }) as {
        edit?: number;
        new?: boolean;
    };
    const navigate = useNavigate();
    return {
        editId: search.edit,
        isNew: search.new === true,
        open: (target: number | "new" | null) =>
            void navigate({
                to,
                search:
                    target === "new"
                        ? { new: true }
                        : target === null
                          ? {}
                          : { edit: target },
            }),
    };
}
