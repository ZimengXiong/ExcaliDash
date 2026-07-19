import { registerExcalidashImportRoutes } from "./excalidashImportRoutes";
import { registerExcalidashExportRoute } from "./exportRoutes";
import { RegisterImportExportDeps } from "./shared";

export const registerImportExportRoutes = (deps: RegisterImportExportDeps) => {
  registerExcalidashExportRoute(deps);
  registerExcalidashImportRoutes(deps);
};

export type { RegisterImportExportDeps } from "./shared";
