import type { CSSProperties } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Activity, ChevronRight, Gauge, Settings } from "lucide-react";
import { OrgAvatar } from "@/components/org-avatar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuAction, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarProvider, SidebarSeparator,
} from "@/components/ui/sidebar";
import { MOCK_ORGS } from "@/lib/mock";

export default function PanelLayout() {
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
                <ItemTitle>cnb-widget</ItemTitle>
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
              <Collapsible defaultOpen className="group/collapsible" asChild>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={activeOrgSlug !== null} className="h-9 px-3">
                    <Link to="/usage/$orgSlug" params={{ orgSlug: activeOrgSlug ?? MOCK_ORGS[0].slug }}>
                      <Gauge /><span>用量详情</span>
                    </Link>
                  </SidebarMenuButton>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuAction className="top-2" aria-label="展开或收起组织列表">
                      <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="gap-2 py-2">
                      {MOCK_ORGS.map((org) => (
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
          <Badge variant="outline">演示数据</Badge>
          <p className="text-xs text-muted-foreground">{MOCK_ORGS.length} 个组织 · 数据源接入中</p>
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
