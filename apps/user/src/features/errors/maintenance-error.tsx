import { Button } from "@/components/ui/button";
import { ErrorResult } from "./error-result";

export function MaintenanceError() {
    return (
        <ErrorResult
            code="503"
            title="站点维护中"
            description="请稍后重试。"
            actions={<Button onClick={() => location.reload()}>刷新</Button>}
        />
    );
}
