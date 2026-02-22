import { Then } from "@badeball/cypress-cucumber-preprocessor";
import { createdDrawingIds } from "./shared-context";

Then("the first drawing should be {string}", (name: string) => {
  // The sort step already visited "/", applied a search filter for this scenario's
  // drawing prefix, and set the sort order.  However other drawings with the same
  // prefix may exist (left-over from retries or parallel scenarios).  Filter visible
  // cards to only those created in THIS scenario, then check order.

  const ids = [...createdDrawingIds]; // snapshot current list

  if (ids.length > 0) {
    // Build a selector that matches only this scenario's cards
    const selector = ids.map((id) => `#drawing-card-${id}`).join(", ");
    cy.get(selector, { timeout: 10000 }).should("have.length", ids.length);

    // Among this scenario's cards, find the one that appears first in the DOM
    // (the DOM order reflects the sort order applied by the dashboard)
    cy.get("[id^='drawing-card-']", { timeout: 10000 }).then(($allCards) => {
      // Walk through all cards in DOM order; return the first one that belongs to us
      for (let i = 0; i < $allCards.length; i++) {
        const cardId = $allCards[i].id.replace("drawing-card-", "");
        if (ids.includes(cardId)) {
          const h3Text = $allCards[i].querySelector("h3")?.textContent ?? "";
          expect(h3Text).to.equal(name);
          return;
        }
      }
      throw new Error("None of this scenario's drawings are visible in the card list");
    });
  } else {
    // Fallback if createdDrawingIds is somehow empty — just check the first card
    cy.get("[id^='drawing-card-']", { timeout: 10000 }).first().find("h3").should("have.text", name);
  }
});
