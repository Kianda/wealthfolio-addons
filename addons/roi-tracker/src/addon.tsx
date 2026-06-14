import { type AddonContext } from "@wealthfolio/addon-sdk";
import { Icons } from "@wealthfolio/ui";
import React from "react";
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
 */
export default function enable(ctx: AddonContext) {
  ctx.api.logger.info("ROI Tracker addon enabling…");

  const cleanup: Array<{ remove: () => void }> = [];

  try {
    const sidebarItem = ctx.sidebar.addItem({
      id: "roi-tracker",
      label: "ROI",
      icon: <Icons.TrendingUp className="h-5 w-5" />,
      route: "/addon/roi-tracker",
      order: 250,
    });
    cleanup.push(sidebarItem);

    ctx.router.add({
      path: "/addon/roi-tracker",
      component: React.lazy(() =>
        Promise.resolve({ default: () => <RoiPage ctx={ctx} /> }),
      ),
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
