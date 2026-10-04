export const setupSlides = [
  {
    title: "Enable authentication",
    text: "When a fresh instance asks you to choose an authentication mode, select Enable Authentication to secure the workspace.",
    light: "/images/screenshots/setup-auth-light.png",
    dark: "/images/screenshots/setup-auth.png",
    alt: "Enable authentication \u2014 When a fresh instance asks you to choose an authentication mode, select Enable Authentication to secure the workspace.",
  },
  {
    title: "Get the one-time setup code",
    text: "The administrator form opens. Read the BOOTSTRAP SETUP entry in your backend logs using the command below.",
    light: "/images/screenshots/setup-admin-form-light.png",
    dark: "/images/screenshots/setup-admin-form.png",
    alt: "Get the one-time setup code \u2014 The administrator form opens. Read the BOOTSTRAP SETUP entry in your backend logs using the command below.",
    code: "docker compose -f docker-compose.prod.yml logs --tail=200 backend",
  },
  {
    title: "Enter the administrator details",
    text: "Enter your name, email, password, and the one-time code from your own server. Select Create account. The screenshot shows a disposable example account.",
    light: "/images/screenshots/setup-admin-filled-light.png",
    dark: "/images/screenshots/setup-admin-filled.png",
    alt: "Enter the administrator details \u2014 Enter your name, email, password, and the one-time code from your own server. Select Create account. The screenshot shows a disposable example account.",
  },
  {
    title: "Start with an empty workspace",
    text: "After creating the administrator account, you are signed in. All Drawings is initially empty; no sample drawings are added automatically.",
    light: "/images/screenshots/setup-workspace-light.png",
    dark: "/images/screenshots/setup-workspace.png",
    alt: "Start with an empty workspace \u2014 After creating the administrator account, you are signed in. All Drawings is initially empty; no sample drawings are added automatically.",
  },
  {
    title: "Create your first drawing",
    text: "Select New Drawing in the empty workspace. The Excalidraw editor opens with an untitled, blank canvas.",
    light: "/images/screenshots/setup-first-drawing-light.png",
    dark: "/images/screenshots/setup-first-drawing.png",
    alt: "Create your first drawing \u2014 Select New Drawing in the empty workspace. The Excalidraw editor opens with an untitled, blank canvas.",
  },
];

export const userManagementSlides = [
  {
    title: "Open Admin",
    text: "Open the account menu and select Admin. Use the registration setting if you want people to create their own accounts.",
    light: "/images/screenshots/admin-light.png",
    dark: "/images/screenshots/admin.png",
    alt: "Open Admin \u2014 Open the account menu and select Admin. Use the registration setting if you want people to create their own accounts.",
  },
  {
    title: "Create a local user",
    text: "Select New User, enter the account details and role, then create the user.",
    light: "/images/screenshots/new-user-light.png",
    dark: "/images/screenshots/new-user.png",
    alt: "Create a local user \u2014 Select New User, enter the account details and role, then create the user.",
  },
];

export const passwordResetSlides = [
  {
    title: "Request a reset link",
    text: "On the sign-in page, select Forgot your password? Enter your email address and select Send reset link.",
    light: "/images/screenshots/password-reset-light.png",
    dark: "/images/screenshots/password-reset.png",
    alt: "Request a reset link \u2014 On the sign-in page, select Forgot your password? Enter your email address and select Send reset link.",
  },
  {
    title: "Check your inbox",
    text: "The request confirmation avoids revealing whether an account exists. Check the account inbox for a reset link.",
    light: "/images/screenshots/password-reset-sent-light.png",
    dark: "/images/screenshots/password-reset-sent.png",
    alt: "Check your inbox \u2014 The request confirmation avoids revealing whether an account exists. Check the account inbox for a reset link.",
  },
  {
    title: "Set a new password",
    text: "Open the valid reset link, enter your new password twice, and select Reset password.",
    light: "/images/screenshots/password-reset-confirm-light.png",
    dark: "/images/screenshots/password-reset-confirm.png",
    alt: "Set a new password \u2014 Open the valid reset link, enter your new password twice, and select Reset password.",
  },
  {
    title: "Sign in again",
    text: "After the success message, return to sign-in and use your new password.",
    light: "/images/screenshots/password-reset-success-light.png",
    dark: "/images/screenshots/password-reset-success.png",
    alt: "Sign in again \u2014 After the success message, return to sign-in and use your new password.",
  },
];

export const backupSlides = [
  {
    title: "Export your library",
    text: "Open Settings from the account menu. Select Export under Export backup to download a library backup.",
    light: "/images/screenshots/settings-light.png",
    dark: "/images/screenshots/settings.png",
    alt: "Export your library \u2014 Open Settings from the account menu. Select Export under Export backup to download a library backup.",
  },
  {
    title: "Choose a backup to import",
    text: "Expand Advanced. Under Import backup, select Choose file and select your .excalidash backup.",
    light: "/images/screenshots/advanced-settings-light.png",
    dark: "/images/screenshots/advanced-settings.png",
    alt: "Choose a backup to import \u2014 Expand Advanced. Under Import backup, select Choose file and select your .excalidash backup.",
  },
  {
    title: "Review the import",
    text: "Review the backup details in the confirmation dialog before selecting Import.",
    light: "/images/screenshots/import-backup-light.png",
    dark: "/images/screenshots/import-backup.png",
    alt: "Review the import \u2014 Review the backup details in the confirmation dialog before selecting Import.",
  },
];

export const workspaceSlides = [
  {
    title: "Organize drawings",
    text: "This populated example shows collections and saved drawings. A new workspace starts empty; add your own drawings and collections.",
    light: "/images/workspace-light.png",
    dark: "/images/workspace.png",
    alt: "Populated example workspace with drawings grouped into collections",
  },
  {
    title: "Share a drawing",
    text: "Open a drawing and select Share. Add a local account and choose its access level.",
    light: "/images/screenshots/share-drawing-light.png",
    dark: "/images/screenshots/share-drawing.png",
    alt: "Share controls open for adding people and choosing permissions",
  },
  {
    title: "Collaborate in real time",
    text: "Open the same drawing with invited collaborators. Their avatars and named cursors show who is working on the canvas.",
    light: "/images/collaboration-light.png",
    dark: "/images/collaboration-dark.png",
    alt: "Live deployment drawing with collaborator avatars and named cursors",
  },
];
