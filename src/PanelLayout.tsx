import { useState, type CSSProperties } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Activity, ChevronRight, Download, Gauge, House, Settings } from "lucide-react";
import { OrgAvatar } from "@/components/org-avatar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuAction, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarProvider, SidebarSeparator,
} from "@/components/ui/sidebar";
import { useCnb } from "@/hooks/use-cnb";
import { useUpdate } from "@/hooks/use-update";

export default function PanelLayout() {
  const { data, loading } = useCnb();
  const { update } = useUpdate();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadLink = update?.available ? update.link : null;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const usageMatch = /^\/usage\/([^/]+)/.exec(pathname);
  const activeOrgSlug = usageMatch ? decodeURIComponent(usageMatch[1]) : null;

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden" style={{ "--sidebar-width": "13rem" } as CSSProperties}>
      <Sidebar collapsible="none" className="shrink-0 border-r">
        <SidebarHeader className="p-3">
          <ItemGroup>
            <Item size="sm">
              <ItemMedia>
                <Avatar><AvatarFallback><Gauge className="size-4" /></AvatarFallback></Avatar>
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>CNB Widget</ItemTitle>
                <ItemDescription>CNB 桌面工作台</ItemDescription>
              </ItemContent>
            </Item>
          </ItemGroup>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup className="gap-2 p-3">
            <SidebarGroupLabel>工作台</SidebarGroupLabel>
            <SidebarMenu className="gap-2">
              <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === "/"} className="h-9 px-3"><Link to="/"><House /><span>首页</span></Link></SidebarMenuButton></SidebarMenuItem>
              <Collapsible defaultOpen className="group/collapsible" asChild>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={activeOrgSlug !== null} className="h-9 px-3">
                    {data.orgs.length ? <Link to="/usage/$orgSlug" params={{ orgSlug: activeOrgSlug ?? data.orgs[0].slug }}><Gauge /><span>用量详情</span></Link> : <Link to="/"><Gauge /><span>用量详情</span></Link>}
                  </SidebarMenuButton>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuAction className="top-2" aria-label="展开或收起组织列表">
                      <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="gap-2 py-2">
                      {data.orgs.map((org) => (
                        <SidebarMenuSubItem key={org.slug}>
                          <SidebarMenuSubButton asChild isActive={activeOrgSlug === org.slug} className="h-9">
                            <Link to="/usage/$orgSlug" params={{ orgSlug: org.slug }}>
                              <OrgAvatar org={org} size="sm" /><span>{org.name}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/npc"} className="h-9 px-3">
                  <Link to="/npc"><Activity /><span>NPC 动态</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/settings"} className="h-9 px-3">
                  <Link to="/settings"><Settings /><span>设置</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter className="gap-3 p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <div className="flex min-w-0 flex-col gap-2">
              <Badge variant="outline" className="self-start">{loading ? "同步中" : data.error ? "连接待配置" : data.updatedAt ? "真实用量" : "未连接"}</Badge>
              <p className="text-xs text-muted-foreground">{downloadError ?? `${data.orgs.length} 个组织 · CNB`}</p>
            </div>
            {downloadLink && update && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`下载新版本 v${update.latestVersion}`}
                    onClick={() => void openUrl(downloadLink).catch(() => setDownloadError("无法打开浏览器，请稍后重试"))}
                  >
                    <Download />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="max-w-56">
                  <p>发现新版本 v{update.latestVersion}</p>
                  {update.notes && <p className="text-muted-foreground">{update.notes}</p>}
                  <p className="text-muted-foreground">点击前往下载</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0">
        <ScrollArea key={pathname} className="h-full min-h-0 min-w-0">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 min-[740px]:p-6">
            <Outlet />
          </div>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  );
}
