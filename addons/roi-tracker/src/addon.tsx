import {
  type AddonContext,
  type AddonIconName,
  type RouteConfig,
} from "@wealthfolio/addon-sdk";

// The SDK does not re-export AddonRouteComponent from its root, so derive it
// from RouteConfig (which it does export). Props are { location }.
type AddonRouteComponent = NonNullable<RouteConfig["component"]>;
import { RoiPage } from "./components/roi-page";

/**
 * ROI Tracker Addon — entry point.
 *
 * Registers:
 * - a sidebar entry that opens the ROI page
 * - a route /addon/roi-tracker
 *
 * No QueryClientProvider: the addon fetches data via useState/useEffect
 * to avoid instance conflicts between the plugin bundle and the host's
 * react-query client.
 *
 * 3.6 sandbox notes: the addon runs in an isolated iframe, so the sidebar icon
 * is a host icon name (a React node can't cross the boundary) and the route
 * hands the host a component to mount in its own managed root.
 */
const SIDEBAR_ICON: AddonIconName = "trend-up";

export default function enable(ctx: AddonContext) {
  ctx.api.logger.info("ROI Tracker addon enabling…");

  const cleanup: Array<{ remove: () => void }> = [];

  // Created once per enable() so the host sees a stable component identity and
  // does not remount the page on every navigation.
  const RouteComponent: AddonRouteComponent = () => <RoiPage ctx={ctx} />;

  try {
    const sidebarItem = ctx.sidebar.addItem({
      id: "roi-tracker",
      label: "ROI",
      icon: SIDEBAR_ICON,
      route: "/addon/roi-tracker",
      order: 250,
    });
    cleanup.push(sidebarItem);

    ctx.router.add({
      path: "/addon/roi-tracker",
      component: RouteComponent,
    });

    ctx.api.logger.info("ROI Tracker addon enabled");
  } catch (error) {
    ctx.api.logger.error("ROI Tracker failed to enable: " + (error as Error).message);
    throw error;
  }

  ctx.onDisable(() => {
    ctx.api.logger.info("ROI Tracker addon disabling…");
    cleanup.forEach((item) => {
      try {
        item.remove();
      } catch (err) {
        ctx.api.logger.error("Cleanup error: " + (err as Error).message);
      }
    });
  });
}
