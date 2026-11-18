import { useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorResult } from "./error-result";

export function ForbiddenError() {
    const navigate = useNavigate();
    const { history } = useRouter();
    return (
        <ErrorResult
            code="403"
            title="没有访问权限"
            description="当前账户无权访问此页面。如需权限，请联系站点管理员。"
            actions={
                <>
                    <Button variant="outline" onClick={() => history.go(-1)}>
                        返回上一页
                    </Button>
                    <Button onClick={() => navigate({ to: "/" })}>
                        回到首页
                    </Button>
                </>
            }
        />
    );
}
