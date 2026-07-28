import {
  type AddonContext,
  type AddonIconName,
  type RouteConfig,
} from "@wealthfolio/addon-sdk";

// The SDK does not re-export AddonRouteComponent from its root, so derive it
// from RouteConfig (which it does export). Props are { location }.
type AddonRouteComponent = NonNullable<RouteConfig["component"]>;
import { CompositionPage } from "./components/composition-page";

/**
 * Composition Addon — entry point.
 *
 * Registers:
 * - a sidebar entry that opens the Composition page
 * - a route /addon/composition
 *
 * 3.6 sandbox notes: the addon runs in an isolated iframe, so the sidebar icon
 * is a host icon name (a React node can't cross the boundary) and the route
 * hands the host a component to mount in its own managed root.
 */
const SIDEBAR_ICON: AddonIconName = "chart-pie";

export default function enable(ctx: AddonContext) {
  ctx.api.logger.info("Composition addon enabling...");

  const cleanup: Array<{ remove: () => void }> = [];

  // Created once per enable() so the host sees a stable component identity and
  // does not remount the page on every navigation.
  const RouteComponent: AddonRouteComponent = () => <CompositionPage ctx={ctx} />;

  try {
    const sidebarItem = ctx.sidebar.addItem({
      id: "composition",
      label: "Composition",
      icon: SIDEBAR_ICON,
      route: "/addon/composition",
      order: 260,
    });
    cleanup.push(sidebarItem);

    ctx.router.add({
      path: "/addon/composition",
      component: RouteComponent,
    });

    ctx.api.logger.info("Composition addon enabled");
  } catch (error) {
    ctx.api.logger.error("Composition failed to enable: " + (error as Error).message);
    throw error;
  }

  ctx.onDisable(() => {
    cleanup.forEach((item) => {
      try {
        item.remove();
      } catch (err) {
        ctx.api.logger.error("Cleanup error: " + (err as Error).message);
      }
    });
  });
}
