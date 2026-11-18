import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorResult } from "./error-result";

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
    minimal?: boolean;
};

export function GeneralError({
    className,
    minimal = false,
}: GeneralErrorProps) {
    const navigate = useNavigate();
    return (
        <ErrorResult
            className={className}
            code={minimal ? undefined : "500"}
            title="页面加载失败"
            description="发生未知错误，请稍后重试。"
            actions={
                minimal ? undefined : (
                    <>
                        <Button onClick={() => location.reload()}>重试</Button>
                        <Button
                            variant="outline"
                            onClick={() => navigate({ to: "/" })}
                        >
                            回到首页
                        </Button>
                    </>
                )
            }
        />
    );
}
