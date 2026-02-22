import "./commands";

beforeEach(() => {
  cy.task("auth:ensure");
});

beforeEach(() => {
  cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const raw = [cookieHeader, csrfCookie]
      .filter(Boolean)
      .join("; ")
      .trim();
    if (!raw) return;

    const baseUrl = Cypress.config("baseUrl") || "http://127.0.0.1:5173";
    const apiUrl = Cypress.env("apiUrl") || "http://127.0.0.1:8000";
    const baseHost = new URL(baseUrl).hostname;
    const apiHost = new URL(apiUrl).hostname;
    const hosts = Array.from(new Set([baseHost, apiHost].filter(Boolean)));

    const cookies = raw
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const index = chunk.indexOf("=");
        if (index === -1) return { name: chunk, value: "" };
        return { name: chunk.slice(0, index), value: chunk.slice(index + 1) };
      });

    cookies.forEach(({ name, value }) => {
      if (!name) return;
      hosts.forEach((domain) => {
        cy.setCookie(name, value, { log: false, domain });
      });
    });

    cy.request({ method: "GET", url: "/", log: false }).then(() => {
      cy.request({ method: "GET", url: `${apiUrl}/csrf-token`, log: false });
    });
  });
});
