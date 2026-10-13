import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { OrgUsage } from "@/lib/mock";

// 组织头像：公开 URL 由 slug 推导（cnb.cool/{slug}/-/logos/s），404 时回落首字符
export function OrgAvatar({
  org,
  size = "default",
  className,
}: {
  org: OrgUsage;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarImage
        src={`https://cnb.cool/${org.slug}/-/logos/s`}
        alt={org.name}
      />
      <AvatarFallback>{org.name[0]}</AvatarFallback>
    </Avatar>
  );
}
