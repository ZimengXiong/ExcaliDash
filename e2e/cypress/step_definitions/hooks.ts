import { After, Before } from "@badeball/cypress-cucumber-preprocessor";
import { clearScenario, createdCollectionIds, createdDrawingIds, createdUserIds } from "./shared-context";

Before(() => {
  clearScenario();
});

After(() => {
  const drawings = createdDrawingIds.splice(0);
  const collections = createdCollectionIds.splice(0);
  const users = createdUserIds.splice(0);

  drawings.forEach((id) => {
    cy.task("api:delete", { path: `/drawings/${id}` }, { log: false });
  });

  collections.forEach((id) => {
    cy.task("api:delete", { path: `/collections/${id}` }, { log: false });
  });

  if (users.length > 0) {
    cy.log("Skipping user cleanup (no delete endpoint)");
  }
});
