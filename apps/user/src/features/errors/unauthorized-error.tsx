import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorResult } from "./error-result";

export function UnauthorisedError() {
    const { history } = useRouter();
    return (
        <ErrorResult
            code="401"
            title="需要登录"
            description="请登录后访问此页面。"
            actions={
                <>
                    <Button variant="outline" onClick={() => history.go(-1)}>
                        返回上一页
                    </Button>
                    <Button asChild>
                        <Link to="/sign-in">登录</Link>
                    </Button>
                </>
            }
        />
    );
}
