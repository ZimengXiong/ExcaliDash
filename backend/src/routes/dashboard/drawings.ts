import express from "express";
import { DashboardRouteDeps } from "./types";
import { createDrawingRouteContext } from "./drawingRouteContext";
import { registerDrawingListRoutes } from "./drawingListRoutes";
import { registerDrawingReadRoutes } from "./drawingReadRoutes";
import { registerDrawingCreateUpdateRoutes } from "./drawingCreateUpdateRoutes";
import { registerDrawingDeleteDuplicateRoutes } from "./drawingDeleteDuplicateRoutes";
import { registerDrawingSharingRoutes } from "./drawingSharingRoutes";
import { registerDrawingSharedVisibilityRoutes } from "./drawingSharedVisibilityRoutes";
import { registerDrawingHistoryRoutes } from "./drawingHistoryRoutes";
import { registerDrawingAgentRoutes } from "./drawingAgentRoutes";
import { registerDrawingAgentTokenRoutes } from "./drawingAgentTokenRoutes";

export const registerDrawingRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps,
) => {
  const context = createDrawingRouteContext(deps);

  registerDrawingListRoutes(app, context);
  registerDrawingReadRoutes(app, context);
  registerDrawingCreateUpdateRoutes(app, context);
  registerDrawingDeleteDuplicateRoutes(app, context);
  registerDrawingSharingRoutes(app, context);
  registerDrawingSharedVisibilityRoutes(app, context);
  registerDrawingHistoryRoutes(app, context);
  registerDrawingAgentRoutes(app, context);
  registerDrawingAgentTokenRoutes(app, context);
};
