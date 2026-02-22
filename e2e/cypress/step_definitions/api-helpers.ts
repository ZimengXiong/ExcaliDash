const resolveApiUrl = () => Cypress.env("apiUrl") || "http://127.0.0.1:8000";
const resolveBaseUrl = () => Cypress.config("baseUrl") || "http://127.0.0.1:5173";

type CsrfInfo = {
  token: string;
  header: string;
};

let csrfInfo: CsrfInfo | null = null;
let authCookieHeader: string | null = null;

const buildCookieHeader = (values: Array<string | undefined>) =>
  values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("; ");

const getAuthCookieHeader = (): Cypress.Chainable<string> => {
  if (authCookieHeader) return cy.wrap(authCookieHeader, { log: false });

  return cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    authCookieHeader = buildCookieHeader([cookieHeader, csrfCookie]);
    return authCookieHeader;
  });
};

export const getCsrfInfo = (): Cypress.Chainable<CsrfInfo> => {
  if (csrfInfo) return cy.wrap(csrfInfo, { log: false });

  return getAuthCookieHeader().then((cookieHeader) =>
    cy
      .request({
        method: "GET",
        url: `${resolveApiUrl()}/csrf-token`,
        headers: {
          origin: resolveBaseUrl(),
          Cookie: cookieHeader,
        },
        failOnStatusCode: true,
      })
      .then((response) => {
        const token = response.body?.token as string | undefined;
        const header = (response.body?.header as string | undefined) || "x-csrf-token";
        if (!token) {
          throw new Error("Missing CSRF token from /csrf-token");
        }
        csrfInfo = { token, header };
        return csrfInfo;
      })
  );
};

export const refreshCsrfInfo = () => {
  csrfInfo = null;
  return getCsrfInfo();
};

export type DrawingRecord = {
  id: string;
  name: string;
  collectionId: string | null;
  preview?: string | null;
  version?: number;
  createdAt?: number | string;
  updatedAt?: number | string;
  elements?: any[];
  appState?: Record<string, any> | null;
  files?: Record<string, any>;
};

export type CollectionRecord = {
  id: string;
  name: string;
  createdAt?: number | string;
};

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  username?: string | null;
  role?: string;
  mustResetPassword?: boolean;
  isActive?: boolean;
};

export type CreateDrawingOptions = {
  name?: string;
  elements?: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
  preview?: string | null;
  collectionId?: string | null;
};

export type ListDrawingsOptions = {
  search?: string;
  collectionId?: string | null;
  includeData?: boolean;
};

const defaultDrawingPayload = () => ({
  name: `BDD Drawing ${Date.now()}`,
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
  preview: null,
  collectionId: null as string | null,
});

export const createDrawing = (overrides: CreateDrawingOptions = {}) => {
  const payload = { ...defaultDrawingPayload(), ...overrides };
  return getAuthCookieHeader().then((cookieHeader) =>
    getCsrfInfo().then((csrf) =>
      cy
        .request({
          method: "POST",
          url: `${resolveApiUrl()}/drawings`,
          headers: {
            origin: resolveBaseUrl(),
            [csrf.header]: csrf.token,
            Cookie: cookieHeader,
          },
          body: payload,
          failOnStatusCode: false,
        })
        .then((response) => {
          if (response.status === 403) {
            return refreshCsrfInfo().then(() => createDrawing(overrides));
          }
          expect(response.status).to.eq(200);
          return response.body as DrawingRecord;
        })
    )
  );
};

export const getDrawing = (id: string) =>
  getAuthCookieHeader().then((cookieHeader) =>
    cy
      .request({
        url: `${resolveApiUrl()}/drawings/${id}`,
        headers: { Cookie: cookieHeader },
      })
      .then((response) => response.body as DrawingRecord)
  );

export const updateDrawing = (id: string, data: Partial<DrawingRecord>) =>
  getAuthCookieHeader().then((cookieHeader) =>
    getCsrfInfo().then((csrf) =>
      cy
        .request({
          method: "PUT",
          url: `${resolveApiUrl()}/drawings/${id}`,
          headers: {
            origin: resolveBaseUrl(),
            [csrf.header]: csrf.token,
            Cookie: cookieHeader,
          },
          body: data,
          failOnStatusCode: false,
        })
        .then((response) => {
          if (response.status === 403) {
            return refreshCsrfInfo().then(() => updateDrawing(id, data));
          }
          expect(response.status).to.eq(200);
          return response.body as DrawingRecord;
        })
    )
  );

export const deleteDrawing = (id: string) =>
  getAuthCookieHeader().then((cookieHeader) =>
    getCsrfInfo().then((csrf) =>
      cy
        .request({
          method: "DELETE",
          url: `${resolveApiUrl()}/drawings/${id}`,
          headers: {
            origin: resolveBaseUrl(),
            [csrf.header]: csrf.token,
            Cookie: cookieHeader,
          },
          failOnStatusCode: false,
        })
        .then((response) => {
          if (response.status === 403) {
            return refreshCsrfInfo().then(() => deleteDrawing(id));
          }
          if (response.status !== 200 && response.status !== 404) {
            throw new Error(`Failed to delete drawing ${id}: ${response.status}`);
          }
        })
    )
  );

export const listDrawings = (options: ListDrawingsOptions = {}) => {
  const params = new URLSearchParams();
  if (options.search) params.set("search", options.search);
  if (options.collectionId !== undefined) {
    params.set("collectionId", options.collectionId === null ? "null" : String(options.collectionId));
  }
  if (options.includeData) params.set("includeData", "true");
  const query = params.toString();
  const url = `${resolveApiUrl()}/drawings${query ? `?${query}` : ""}`;
  return getAuthCookieHeader().then((cookieHeader) =>
    cy.request({ url, headers: { Cookie: cookieHeader } }).then((response) => {
      const payload = response.body as { drawings?: DrawingRecord[] } | DrawingRecord[];
      return Array.isArray(payload) ? payload : payload.drawings || [];
    })
  );
};

export const createCollection = (name: string) =>
  getAuthCookieHeader().then((cookieHeader) =>
    getCsrfInfo().then((csrf) =>
      cy
        .request({
          method: "POST",
          url: `${resolveApiUrl()}/collections`,
          headers: {
            origin: resolveBaseUrl(),
            [csrf.header]: csrf.token,
            Cookie: cookieHeader,
          },
          body: { name },
          failOnStatusCode: false,
        })
        .then((response) => {
          if (response.status === 403) {
            return refreshCsrfInfo().then(() => createCollection(name));
          }
          expect(response.status).to.eq(200);
          return response.body as CollectionRecord;
        })
    )
  );

export const listCollections = () =>
  getAuthCookieHeader().then((cookieHeader) =>
    cy
      .request({ url: `${resolveApiUrl()}/collections`, headers: { Cookie: cookieHeader } })
      .then((response) => response.body as CollectionRecord[])
  );

export const updateUserRole = (identifier: string, role: "ADMIN" | "USER") =>
  getAuthCookieHeader().then((cookieHeader) =>
    getCsrfInfo().then((csrf) =>
      cy
        .request({
          method: "POST",
          url: `${resolveApiUrl()}/auth/admins`,
          headers: {
            origin: resolveBaseUrl(),
            [csrf.header]: csrf.token,
            Cookie: cookieHeader,
          },
          body: { identifier, role },
          failOnStatusCode: false,
        })
        .then((response) => {
          if (response.status === 403) {
            return refreshCsrfInfo().then(() => updateUserRole(identifier, role));
          }
          if (response.status !== 200) {
            throw new Error(`Failed to update user role: ${response.status}`);
          }
          return (response.body.user || response.body) as UserRecord;
        })
    )
  );

export const listUsers = () =>
  getAuthCookieHeader().then((cookieHeader) =>
    cy.request({ url: `${resolveApiUrl()}/auth/users`, headers: { Cookie: cookieHeader } }).then((response) => {
      const payload = response.body as { users?: UserRecord[] } | UserRecord[];
      return Array.isArray(payload) ? payload : payload.users || [];
    })
  );
