export const setupSlides = [
  {
    title: "Choose authentication mode",
    text: "On a fresh instance, select Enable Authentication to protect the workspace with accounts.",
    light: "/images/screenshots/setup-auth-light.png",
    dark: "/images/screenshots/setup-auth.png",
    alt: "Choose Authentication Mode screen with Enable Authentication and Keep Disabled buttons.",
  },
  {
    title: "Read the one-time setup code",
    text: "The administrator form asks for a bootstrap code. Find the BOOTSTRAP SETUP entry in the backend logs:",
    light: "/images/screenshots/setup-admin-form-light.png",
    dark: "/images/screenshots/setup-admin-form.png",
    alt: "Empty administrator registration form waiting for the one-time setup code.",
    code: "docker compose -f docker-compose.prod.yml logs --tail=200 backend",
  },
  {
    title: "Create the administrator account",
    text: "Enter your name, email, password, and the setup code from your server logs, then select Create account.",
    light: "/images/screenshots/setup-admin-filled-light.png",
    dark: "/images/screenshots/setup-admin-filled.png",
    alt: "Administrator registration form filled with example details and setup code.",
  },
  {
    title: "Open the empty workspace",
    text: "You are signed in right away. All Drawings starts empty so you can organize drawings from scratch.",
    light: "/images/screenshots/setup-workspace-light.png",
    dark: "/images/screenshots/setup-workspace.png",
    alt: "Empty ExcaliDash workspace after creating the first administrator account.",
  },
  {
    title: "Start your first drawing",
    text: "Select New Drawing to open a blank Excalidraw canvas. Changes save automatically to your server.",
    light: "/images/screenshots/setup-first-drawing-light.png",
    dark: "/images/screenshots/setup-first-drawing.png",
    alt: "Blank Excalidraw canvas opened for the first drawing.",
  },
];

export const userManagementSlides = [
  {
    title: "Open Admin",
    text: "Open the account menu and select Admin. Toggle self-registration if you want people to sign up themselves.",
    light: "/images/screenshots/admin-light.png",
    dark: "/images/screenshots/admin.png",
    alt: "Admin dashboard showing user management and registration controls.",
  },
  {
    title: "Create a local user",
    text: "Select New User, enter the account details and role, then save the account.",
    light: "/images/screenshots/new-user-light.png",
    dark: "/images/screenshots/new-user.png",
    alt: "New User modal form with name, email, password, and role fields.",
  },
];

export const passwordResetSlides = [
  {
    title: "Request a reset link",
    text: "Select Forgot your password? on the sign-in screen, enter your email address, and select Send reset link.",
    light: "/images/screenshots/password-reset-light.png",
    dark: "/images/screenshots/password-reset.png",
    alt: "Password reset request form asking for an email address.",
  },
  {
    title: "Check your inbox",
    text: "ExcaliDash shows the same confirmation whether or not an account matches. Open the link from your inbox.",
    light: "/images/screenshots/password-reset-sent-light.png",
    dark: "/images/screenshots/password-reset-sent.png",
    alt: "Confirmation screen after submitting a password reset request.",
  },
  {
    title: "Set a new password",
    text: "Open the reset link, enter your new password twice, and select Reset password.",
    light: "/images/screenshots/password-reset-confirm-light.png",
    dark: "/images/screenshots/password-reset-confirm.png",
    alt: "Form for entering and confirming a new password.",
  },
  {
    title: "Sign in with the new password",
    text: "Once the reset succeeds, return to the sign-in screen and log in with your new password.",
    light: "/images/screenshots/password-reset-success-light.png",
    dark: "/images/screenshots/password-reset-success.png",
    alt: "Password reset completion message with a link back to sign in.",
  },
];

export const backupSlides = [
  {
    title: "Export a backup",
    text: "Open Settings from the account menu and select Export under Export backup to download a .excalidash archive.",
    light: "/images/screenshots/settings-light.png",
    dark: "/images/screenshots/settings.png",
    alt: "Settings page with the Export backup action.",
  },
  {
    title: "Select a backup to import",
    text: "Expand Advanced and select Choose file under Import backup to pick a .excalidash archive.",
    light: "/images/screenshots/advanced-settings-light.png",
    dark: "/images/screenshots/advanced-settings.png",
    alt: "Expanded Advanced settings section showing Import backup controls.",
  },
  {
    title: "Confirm the import",
    text: "Check the drawing, collection, and image summary in the confirmation dialog, then select Import.",
    light: "/images/screenshots/import-backup-light.png",
    dark: "/images/screenshots/import-backup.png",
    alt: "Import backup confirmation dialog showing archive contents.",
  },
];

export const workspaceSlides = [
  {
    title: "Organize drawings into collections",
    text: "Group related canvases into collections, sort by name or date, and search across your entire library.",
    light: "/images/workspace-light.png",
    dark: "/images/workspace.png",
    alt: "Populated ExcaliDash workspace with drawings grouped into collections.",
  },
  {
    title: "Share a drawing",
    text: "Select Share inside any drawing to invite accounts with view or edit access, or enable link sharing.",
    light: "/images/screenshots/share-drawing-light.png",
    dark: "/images/screenshots/share-drawing.png",
    alt: "Share dialog showing collaborator search and permission controls.",
  },
  {
    title: "Collaborate live",
    text: "Invited collaborators see each other's cursors and avatars in real time. Click any avatar in the header to follow their viewport.",
    light: "/images/collaboration-light.png",
    dark: "/images/collaboration-dark.png",
    alt: "Live Excalidraw canvas with collaborator avatars and named cursors.",
  },
];
