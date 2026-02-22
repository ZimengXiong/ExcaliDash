export const searchPlaceholder = "Search drawings...";

export const waitForDashboard = () => {
  cy.location("pathname", { timeout: 20000 }).then((path) => {
    if (path.includes("/login")) {
      throw new Error(`Redirected to login page: ${path}`);
    }
  });
  cy.get(`input[placeholder="${searchPlaceholder}"]`, { timeout: 15000 }).should("be.visible");
};

export const applyDashboardSearch = (term: string) => {
  cy.get(`input[placeholder="${searchPlaceholder}"]`).clear();
  if (term) {
    cy.get(`input[placeholder="${searchPlaceholder}"]`).type(term);
  }
  // Blur so keyboard shortcuts (Ctrl+A) aren't swallowed by the focused input
  cy.get(`input[placeholder="${searchPlaceholder}"]`).blur();
  // Dashboard search is debounced at 300ms — wait long enough for debounce + re-render
  cy.wait(500);
};

export const ensureCardVisible = (drawingId: string) => {
  cy.get(`#drawing-card-${drawingId}`).scrollIntoView().should("be.visible");
  return cy.get(`#drawing-card-${drawingId}`);
};

export const ensureCardSelected = (drawingId: string) => {
  ensureCardVisible(drawingId).trigger("mouseover");
  cy.get(`[data-testid="select-drawing-${drawingId}"]`).then(($toggle) => {
    const pressed = $toggle.attr("aria-pressed");
    if (pressed !== "true") {
      cy.wrap($toggle).click({ force: true });
    }
  });
};

export const waitForToolSelected = (testId: string) => {
  cy.get(`[data-testid="${testId}"]`, { timeout: 10000 }).should(($el) => {
    const input = $el.is("input") ? $el[0] : $el.find("input")[0];
    const checked = input && "checked" in input ? (input as HTMLInputElement).checked : false;
    const ariaPressed = $el.attr("aria-pressed");
    const ariaChecked = $el.attr("aria-checked");
    const dataState = $el.attr("data-state");
    const hasActiveClass = $el.hasClass("active") || $el.hasClass("selected");
    expect(
      checked ||
        ariaPressed === "true" ||
        ariaChecked === "true" ||
        dataState === "active" ||
        dataState === "checked" ||
        hasActiveClass
    ).to.equal(true);
  });
};
