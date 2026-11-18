import { Link } from "@tanstack/react-router";
import { Link2 } from "lucide-react";
import type { HelpArticle } from "@xboard/contracts";
import { usePanel } from "@/api/panel";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function Help() {
    const articles = usePanel<HelpArticle[]>("/help");
    return (
        <Page
            title="帮助文档"
            actions={
                <Button asChild variant="outline">
                    <Link to="/subscription">
                        <Link2 /> 订阅链接
                    </Link>
                </Button>
            }
        >
            <div className="grid min-w-0 max-w-3xl gap-page">
                {articles.isPending ? (
                    <Skeleton className="h-64" />
                ) : articles.isError ? (
                    <ErrorState
                        error={articles.error}
                        onRetry={() => articles.refetch()}
                    />
                ) : articles.data.length ? (
                    articles.data.map((article) => (
                        <Card key={article.id}>
                            <CardHeader>
                                <CardTitle>{article.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">
                                {article.body}
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <Card>
                        <EmptyState title="暂无帮助文档" />
                    </Card>
                )}
            </div>
        </Page>
    );
}
