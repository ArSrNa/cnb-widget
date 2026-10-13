import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import PanelLayout from "@/PanelLayout";
import NpcPage from "@/pages/npc";
import SettingsPage from "@/pages/settings";
import UsagePage from "@/pages/usage";
import HomePage from "@/pages/home";

const rootRoute = createRootRoute({
  component: PanelLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usage/$orgSlug",
  component: UsagePage,
});

const npcRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/npc",
  component: NpcPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([indexRoute, usageRoute, npcRoute, settingsRoute]);

// 桌面应用无地址栏，使用内存历史（TanStack 对桌面端推荐做法）
export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
