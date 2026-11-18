import { useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorResult } from "./error-result";

export function NotFoundError() {
    const navigate = useNavigate();
    const { history } = useRouter();
    return (
        <ErrorResult
            code="404"
            title="页面不存在"
            description="链接可能已失效或地址有误。"
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
