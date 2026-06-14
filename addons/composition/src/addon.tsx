import { type AddonContext } from "@wealthfolio/addon-sdk";
import { Icons } from "@wealthfolio/ui";
import React from "react";
import { CompositionPage } from "./components/composition-page";

export default function enable(ctx: AddonContext) {
  ctx.api.logger.info("Composition addon enabling...");

  const cleanup: Array<{ remove: () => void }> = [];

  try {
    const sidebarItem = ctx.sidebar.addItem({
      id: "composition",
      label: "Composition",
      icon: <Icons.PieChart className="h-5 w-5" />,
      route: "/addon/composition",
      order: 260,
    });
    cleanup.push(sidebarItem);

    ctx.router.add({
      path: "/addon/composition",
      component: React.lazy(() =>
        Promise.resolve({ default: () => <CompositionPage ctx={ctx} /> }),
      ),
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
