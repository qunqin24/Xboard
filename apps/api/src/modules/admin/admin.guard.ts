import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";

@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        if (context.switchToHttp().getRequest().currentUser?.role !== "admin") {
            throw new ForbiddenException("需要管理员权限。");
        }
        return true;
    }
}
