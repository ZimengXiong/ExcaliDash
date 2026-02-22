Cypress.Commands.add("waitForDashboard", () => {
  cy.location("pathname", { timeout: 20000 }).then((path) => {
    if (path.includes("/login")) {
      throw new Error(`Redirected to login page: ${path}`);
    }
  });
  cy.get('input[placeholder="Search drawings..."]', { timeout: 15000 }).should("be.visible");
});

declare global {
  namespace Cypress {
    interface Chainable {
      waitForDashboard(): Chainable<void>;
      findByRole(role: string, options?: { name?: string | RegExp }): Chainable<JQuery<HTMLElement>>;
    }
  }
}

// Map of ARIA roles to their semantic HTML counterparts
const ROLE_SELECTORS: Record<string, string> = {
  button: 'button, [role="button"]',
  heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
  textbox: 'input[type="text"], input:not([type]), textarea, [role="textbox"]',
  checkbox: 'input[type="checkbox"], [role="checkbox"]',
  radio: 'input[type="radio"], [role="radio"]',
  link: 'a, [role="link"]',
  img: 'img, [role="img"]',
  dialog: '[role="dialog"]',
  alert: '[role="alert"]',
  status: '[role="status"]',
};

Cypress.Commands.add("findByRole", (role: string, options?: { name?: string | RegExp }) => {
  const selector = ROLE_SELECTORS[role] || `[role="${role}"]`;
  const name = options?.name;
  if (name) {
    return cy.contains(selector, name as any);
  }
  return cy.get(selector);
});
