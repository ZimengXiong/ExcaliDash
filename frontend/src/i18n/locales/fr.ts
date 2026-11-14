import type { LocaleMessages } from "./en";

// French typography: a no-break space (\u00A0) goes before ":" and inside
// « », a narrow no-break space (\u202F) before "?", "!" and ";".
// Actions use the infinitive; full sentences address the user as "vous".
export const fr: LocaleMessages = {
  "sidebar.library": "Bibliothèque",
  "sidebar.allDrawings": "Tous les dessins",
  "sidebar.sharedWithMe": "Partagés avec moi",
  "sidebar.unorganized": "Non classés",
  "sidebar.collections": "Collections",
  "sidebar.newCollection": "Nouvelle collection",
  "sidebar.newCollectionPlaceholder": "Nouvelle collection…",
  "sidebar.shared": "Partagée",
  "sidebar.editor": "Éditeur",
  "sidebar.viewer": "Lecteur",
  "sidebar.owner": "Propriétaire",
  "sidebar.deleteCollection": "Supprimer la collection",
  "sidebar.deleteCollectionMessage":
    "Supprimer cette collection\u202F? Tous les dessins qu'elle contient seront déplacés vers Non classés.",
  "sidebar.trash": "Corbeille",
  "sidebar.profile": "Profil",
  "sidebar.admin": "Administration",
  "sidebar.settings": "Paramètres",
  "sidebar.logout": "Se déconnecter",
  "settings.language": "Langue",
  "settings.editorLanguage": "{language} (langue de l'éditeur)",
  "settings.appearance": "Apparence",
  "settings.toggleDarkMode": "Activer/désactiver le mode sombre",
  "settings.autoHideHeader": "Masquer automatiquement l'en-tête de l'éditeur",
  "settings.hideByDefault": "Masqué par défaut",
  "settings.keepVisibleByDefault": "Visible par défaut",
  "settings.toggleAutoHideHeader":
    "Activer/désactiver le masquage automatique de l'en-tête de l'éditeur",
  "settings.compactSidebar": "Barre latérale compacte",
  "settings.compactSidebarDescription":
    "Regrouper les actions du compte dans le menu de l'avatar",
  "settings.toggleCompactSidebar":
    "Activer/désactiver la barre latérale compacte",
  "settings.optimizedImages": "Images optimisées",
  "settings.compressImagesOver":
    "Compresser les images de plus de {size}\u00A0Mo",
  "settings.megabytes": "Mo",
  "settings.originalQuality": "Qualité d'origine",
  "settings.compressionThreshold": "Seuil de compression des images en Mo",
  "settings.toggleImageOptimization":
    "Activer/désactiver l'optimisation des images",
  "settings.exportBackup": "Exporter une sauvegarde",
  "settings.advanced": "Avancé",
  "settings.importBackup": "Importer une sauvegarde",
  "settings.importBackupDescription":
    "Fusionner une sauvegarde .excalidash dans votre compte",
  "settings.legacyImport": "Import d'anciens formats",
  "settings.legacyImportDescription":
    "Importer des fichiers .excalidraw, JSON, ZIP ou une ancienne base SQLite",
  "settings.verifying": "Vérification…",
  "settings.chooseFile": "Choisir un fichier",
  "settings.chooseFiles": "Choisir des fichiers",
  "settings.importCompletedWithErrors":
    "Import terminé avec des erreurs.\nRéussis\u00A0: {success}\nÉchecs\u00A0: {failed}\nErreurs\u00A0:\n{errors}",
  "settings.importedFiles": "{count} fichier(s) importé(s).",
  "settings.importFailed": "Échec de l'import",
  "settings.importSuccessful": "Import réussi",
  "settings.authOn": "Authentification activée",
  "settings.authOff": "Authentification désactivée",
  "settings.authManaged": "Géré par AUTH_MODE={mode}",
  "settings.multiUserEnabled": "Connexion multi-utilisateur activée",
  "settings.onlyAdminsCanDisable":
    "Seuls les administrateurs peuvent la désactiver",
  "settings.singleUserMode": "Mode mono-utilisateur",
  "settings.enable": "Activer",
  "settings.disable": "Désactiver",
  "settings.enabling": "Activation…",
  "settings.disabling": "Désactivation…",
  "settings.version": "Version",
  "settings.unknownVersion": "Version inconnue",
  "settings.update.title": "Mises à jour",
  "settings.update.statusUnknown": "Statut inconnu",
  "settings.update.checksDisabled": "Vérification des mises à jour désactivée",
  "settings.update.checking": "Vérification…",
  "settings.update.versionAvailable": "v{version} disponible",
  "settings.update.upToDate": "À jour",
  "settings.update.releases": "Versions",
  "settings.update.error": "Erreur\u00A0: {error}",
  "settings.update.stable": "Stable",
  "settings.update.prerelease": "Préversion",
  "settings.update.check": "Vérifier",
  "settings.legacyDb.title": "Fusionner l'ancienne base de données\u202F?",
  "settings.legacyDb.description":
    "Les anciennes données seront fusionnées dans votre compte sans remplacer la base de données du serveur.",
  "settings.legacyDb.drawings": "Dessins\u00A0: {count}",
  "settings.legacyDb.collections": "Collections\u00A0: {count}",
  "settings.legacyDb.legacyMigration": "Migration de l'ancienne base\u00A0:",
  "settings.legacyDb.currentMigration": "Migration actuelle\u00A0:",
  "settings.legacyDb.confirm": "Fusionner",
  "settings.legacyDb.imported":
    "Ancienne base importée. Collections\u00A0: +{collectionsCreated} / ~{collectionsUpdated}. Dessins\u00A0: +{drawingsCreated} / ~{drawingsUpdated}.",
  "settings.authToggle.enableTitle": "Activer l'authentification\u202F?",
  "settings.authToggle.disableTitle": "Désactiver l'authentification\u202F?",
  "settings.authToggle.enableMessage":
    "Les utilisateurs devront se connecter. Vous serez invité à créer immédiatement un compte administrateur.",
  "settings.authToggle.disableMessage":
    "L'authentification sera désactivée pour toute l'instance.",
  "settings.authToggle.recommendation":
    "Recommandation\u00A0: garder l'authentification activée, sauf si cette instance est entièrement privée.",
  "settings.authFinal.title":
    "Dernier avertissement\u00A0: désactiver l'authentification\u202F?",
  "settings.authFinal.message":
    "Sans authentification, toute personne ayant accès à cette URL peut consulter et modifier tous les dessins et paramètres. Elle peut aussi réactiver l'authentification et vous bloquer l'accès.",
  "settings.authFinal.trustedOnly":
    "Ce n'est sûr que sur un réseau privé de confiance.",
  "settings.authFinal.keepEnabled": "Garder activée (recommandé)",
  "settings.backup.confirmTitle": "Importer la sauvegarde\u202F?",
  "settings.backup.confirmMessage":
    "{collections} collection(s) et {drawings} dessin(s) seront fusionnés depuis une sauvegarde au format v{formatVersion} exportée le {exportedAt}.",
  "settings.backup.confirmMessageGeneric":
    "La sauvegarde sera fusionnée dans votre compte.",
  "settings.backup.import": "Importer",
  "settings.backup.importedTitle": "Sauvegarde importée",
  "settings.backup.importedMessage": "La sauvegarde a bien été importée.",
  "settings.backup.failedTitle": "Échec de l'import de la sauvegarde",
  "settings.errors.checkUpdates": "Impossible de vérifier les mises à jour",
  "settings.errors.updateAuth":
    "Impossible de modifier le paramètre d'authentification",
  "settings.errors.exportBackup":
    "Impossible d'exporter la sauvegarde. Veuillez réessayer.",
  "settings.errors.excalidashRequired": "Un fichier .excalidash est requis.",
  "settings.errors.verifyBackup":
    "Impossible de vérifier le fichier de sauvegarde.",
  "settings.errors.verifyLegacyDb":
    "Impossible de vérifier le fichier de l'ancienne base de données.",
  "settings.errors.legacyDbSeparately":
    "Importer les fichiers d'ancienne base de données séparément des autres fichiers.",
  "settings.errors.importLegacyDb":
    "Impossible d'importer l'ancienne base de données.",
  "settings.errors.importBackup": "Impossible d'importer la sauvegarde.",

  // Common
  "common.loading": "Chargement…",
  "common.updating": "Mise à jour…",
  "common.copy": "Copier",
  "common.copied": "Copié",
  "common.goBack": "Retour",
  "common.close": "Fermer",
  "common.cancel": "Annuler",
  "common.delete": "Supprimer",
  "common.done": "Terminé",
  "common.retry": "Réessayer",
  "common.user": "Utilisateur",
  "common.beta": "Beta",
  "common.refresh": "Actualiser",
  "common.confirm": "Confirmer",
  "common.ok": "OK",
  "common.continue": "Continuer",
  "common.unknown": "Inconnu",
  "common.save": "Enregistrer",
  "common.saving": "Enregistrement…",
  "common.yes": "Oui",
  "common.no": "Non",

  // Layout & sidebar
  "layout.openMenu": "Ouvrir le menu",
  "layout.closeMenu": "Fermer le menu",
  "layout.resizeSidebar": "Faire glisser pour redimensionner la barre latérale",
  "sidebar.workspace": "Espace de travail",
  "sidebar.accountMenu": "Menu du compte",

  // Collections
  "collection.name": "Nom de la collection",
  "collection.access": "Accès à la collection",
  "collection.share": "Partager la collection",
  "collection.rename": "Renommer la collection",
  "collection.share.title": "Partager «\u00A0{name}\u00A0»",
  "collection.share.searchPlaceholder":
    "Ajouter des personnes par nom ou e-mail",
  "collection.share.peopleWithAccess": "Personnes ayant accès",
  "collection.share.you": "(vous)",
  "collection.share.noOneElse": "Personne d'autre n'a encore accès",
  "collection.share.removeAccess": "Retirer l'accès",
  "collection.share.errors.load":
    "Impossible de charger les paramètres de partage",
  "collection.share.errors.add": "Impossible de partager avec cet utilisateur",
  "collection.share.errors.updateRole": "Impossible de modifier le rôle",
  "collection.share.errors.remove": "Impossible de retirer l'utilisateur",

  "collection.fallbackName": "Collection",

  // Dashboard
  "dashboard.newDrawing": "Nouveau dessin",
  "dashboard.untitledDrawing": "Dessin sans titre",
  "dashboard.importDrawings": "Importer des dessins",
  "dashboard.searchPlaceholder": "Rechercher des dessins…",
  "dashboard.sort.label": "Trier les dessins",
  "dashboard.sort.name": "Nom",
  "dashboard.sort.createdAt": "Date de création",
  "dashboard.sort.updatedAt": "Date de modification",
  "dashboard.sort.ascending": "Tri croissant",
  "dashboard.sort.descending": "Tri décroissant",
  "dashboard.selectAll": "Tout sélectionner",
  "dashboard.deselectAll": "Tout désélectionner",
  "dashboard.moveToTrash": "Déplacer vers la corbeille",
  "dashboard.deletePermanently": "Supprimer définitivement",
  "dashboard.duplicateSelected": "Dupliquer la sélection",
  "dashboard.moveSelected": "Déplacer la sélection",
  "dashboard.moveItemsTo": "Déplacer {count} éléments vers…",
  "dashboard.viewerCannotCreate":
    "Les lecteurs ne peuvent pas créer de dessins",
  "dashboard.viewerCannotImport":
    "Les lecteurs ne peuvent pas importer de dessins",
  "dashboard.dropFilesTitle": "Déposer des fichiers pour les importer",
  "dashboard.dropFilesDescription":
    "Déposer des fichiers .excalidash ici pour les importer dans",
  "dashboard.loadingDrawings": "Chargement des dessins",
  "dashboard.loadingMore": "Chargement de la suite…",
  "dashboard.trashEmpty": "Votre corbeille est vide",
  "dashboard.noDrawings": "Aucun dessin trouvé",
  "dashboard.noResults": "Aucun résultat pour «\u00A0{search}\u00A0»",
  "dashboard.getStarted": "Créer un nouveau dessin pour commencer\u202F!",
  "dashboard.clearSearch": "Effacer la recherche",
  "dashboard.deleteDrawing.title": "Supprimer le dessin",
  "dashboard.deleteDrawing.message":
    "Supprimer définitivement ce dessin\u202F? Cette action est irréversible.",
  "dashboard.bulkDelete.title": "Supprimer les dessins sélectionnés",
  "dashboard.bulkDelete.message":
    "Supprimer définitivement {count} dessins\u202F? Cette action est irréversible.",
  "dashboard.bulkDelete.confirm": "Supprimer {count} dessins",
  "dashboard.importFailed": "Échec de l'import",
  "dashboard.errors.libraryImportUnsupported":
    "L'import de bibliothèques (.excalidrawlib) n'est pas pris en charge dans cette version. Importer plutôt des dessins (.excalidraw/.json).",

  // Drawing card
  "drawing.select": "Sélectionner {name}",
  "drawing.deselect": "Désélectionner {name}",
  "drawing.menu.rename": "Renommer",
  "drawing.menu.moveTo": "Déplacer vers…",
  "drawing.menu.duplicate": "Dupliquer",
  "drawing.menu.manageStorage": "Gérer le stockage",
  "drawing.menu.export": "Exporter",
  "drawing.menu.exporting": "Export…",
  "drawing.menu.hide": "Masquer de ma liste",
  "drawing.errors.exportFailed":
    "Impossible d'exporter le dessin. Veuillez réessayer.",

  // Storage management
  "storage.title": "Gestion du stockage",
  "storage.trimHistory": "Alléger l'historique",
  "storage.trimDescription":
    "Supprimer les éléments effacés et les fichiers inutilisés.",
  "storage.fileComparison": "Comparaison des fichiers",
  "storage.canvasRefs": "Références du canevas\u00A0:",
  "storage.columns.fileId": "ID du fichier",
  "storage.columns.canvas": "Canevas",
  "storage.columns.size": "Taille",
  "storage.noFiles": "Aucun fichier trouvé.",
  "storage.status.active": "Actif",
  "storage.status.historyOnly": "Historique uniquement",
  "storage.status.missing": "Manquant",
  "storage.legend.active": "actif",
  "storage.legend.historyOnly": "historique uniquement",
  "storage.legend.missing": "manquant",
  "storage.deleteSelectedOrphans":
    "Supprimer les fichiers orphelins sélectionnés ({count})",
  "storage.deleteOrphanFiles": "Supprimer les fichiers orphelins",
  "storage.irreversible": "Ces opérations sont irréversibles.",
  "storage.typeToConfirmPrefix": "Saisir",
  "storage.typeToConfirmSuffix": "pour confirmer\u00A0:",
  "storage.trimComplete":
    "Historique allégé\u00A0: {elements} éléments supprimés, {files} fichiers supprimés, {s3Objects} objets S3 supprimés.",
  "storage.orphansDeleted": "{count} fichier(s) orphelin(s) supprimé(s).",
  "storage.orphansErrors": "{count} erreur(s).",
  "storage.errors.loadDiff":
    "Impossible de charger la comparaison des fichiers",
  "storage.errors.trim": "Échec de l'allègement",
  "storage.errors.delete": "Échec de la suppression",

  // Update banner
  "update.available": "Mise à jour disponible",
  "update.channel": "Canal de mise à jour",
  "update.channelStable": "stable",
  "update.channelPrerelease": "préversion",
  "update.release": "Version",
  "update.closeHint": "Fermer (réapparaîtra plus tard)",
  "update.ignoreVersion": "Ignorer cette version",
  "update.ignore": "Ignorer",
  "update.recheck": "Vérifier maintenant",

  // Impersonation banner
  "impersonation.impersonating": "Emprunt d'identité",
  "impersonation.switchLabel": "Changer\u00A0:",
  "impersonation.switchTarget": "Changer d'utilisateur emprunté",
  "impersonation.stop": "Arrêter",
  "impersonation.syncingTargets": "Synchronisation des utilisateurs…",
  "impersonation.errors.loadTargets":
    "Impossible de charger les utilisateurs disponibles",
  "impersonation.errors.stop": "Impossible d'arrêter l'emprunt d'identité",
  "impersonation.errors.switch": "Impossible de changer d'utilisateur emprunté",

  // Upload status
  "upload.title": "Envois ({status})",
  "upload.activeCount": "{count} en cours",
  "upload.done": "terminé",
  "upload.clearAll": "Tout effacer",
  "upload.remove": "Retirer {name} des envois",
  "upload.failed": "Échec",
  "upload.showStatus": "Afficher l'état des envois",
  "upload.hideStatus": "Masquer l'état des envois",

  // Authentication
  "auth.name": "Nom",
  "auth.yourName": "Votre nom",
  "auth.emailAddress": "Adresse e-mail",
  "auth.password": "Mot de passe",
  "auth.continueWith": "Continuer avec {provider}",
  "auth.backToLogin": "Retour à la connexion",
  "auth.goToLogin": "Aller à la connexion",
  "auth.login.title": "Connexion à votre compte",
  "auth.login.signInWith": "Se connecter avec {provider}",
  "auth.login.or": "Ou",
  "auth.login.createAccountLink": "créer un nouveau compte",
  "auth.login.forgotPassword": "Mot de passe oublié\u202F?",
  "auth.login.signIn": "Se connecter",
  "auth.login.signingIn": "Connexion…",
  "auth.login.failed": "Échec de la connexion",
  "auth.login.oidcFailed": "Échec de la connexion OIDC",
  "auth.mustReset.title": "Réinitialiser le mot de passe",
  "auth.mustReset.subtitle": "Choisir un nouveau mot de passe pour continuer.",
  "auth.mustReset.submit": "Définir le nouveau mot de passe",
  "auth.mustReset.enterAndConfirm":
    "Saisir et confirmer un nouveau mot de passe",
  "auth.mustReset.failed": "Impossible de réinitialiser le mot de passe",
  "auth.mustReset.signInAsDifferentUser":
    "Se connecter avec un autre utilisateur",
  "auth.register.title": "Créer un compte",
  "auth.register.bootstrapTitle": "Configurer le compte administrateur",
  "auth.register.bootstrapSubtitle": "Créer le premier compte administrateur.",
  "auth.register.signInLink": "se connecter à un compte existant",
  "auth.register.setupCode": "Code de configuration à usage unique",
  "auth.register.bootstrapSetupCode": "Code de configuration initiale",
  "auth.register.copyFromLogs": "Le copier depuis les logs du backend\u00A0:",
  "auth.register.copyDockerCommand": "Copier la commande Docker",
  "auth.register.copiedDockerCommand": "Commande Docker copiée",
  "auth.register.setupAdminWith": "Configurer l'administrateur avec {provider}",
  "auth.register.orUseLocal": "Ou utiliser un compte local",
  "auth.register.createAccount": "Créer le compte",
  "auth.register.creatingAccount": "Création du compte…",
  "auth.register.setupCodeRequired": "Le code de configuration est requis",
  "auth.register.failed": "Échec de l'inscription",
  "auth.resetRequest.helpTitle": "Aide pour le mot de passe",
  "auth.resetRequest.subtitle":
    "Saisir votre adresse e-mail pour recevoir un lien de réinitialisation.",
  "auth.resetRequest.checking":
    "Vérification de la disponibilité de la réinitialisation…",
  "auth.resetRequest.unavailable":
    "Ce serveur n'envoie pas d'e-mails de réinitialisation de mot de passe.",
  "auth.resetRequest.submit": "Envoyer le lien",
  "auth.resetRequest.sending": "Envoi…",
  "auth.resetRequest.sent":
    "Si un compte existe avec cette adresse, un lien de réinitialisation a été envoyé. Il est valable 60 minutes et utilisable une seule fois.",
  "auth.resetRequest.askAdmin":
    "Demander un mot de passe temporaire à votre administrateur.",
  "auth.resetRequest.adminLockedOut":
    "Si vous êtes administrateur et que votre accès est bloqué, exécuter\u00A0:",
  "auth.resetRequest.failed":
    "Impossible de demander une réinitialisation pour le moment. Veuillez réessayer plus tard.",
  "auth.resetConfirm.invalidLink":
    "Lien de réinitialisation invalide. Veuillez demander une nouvelle réinitialisation.",
  "auth.resetConfirm.invalidToken": "Jeton de réinitialisation invalide",
  "auth.resetConfirm.notEnabled":
    "La réinitialisation de mot de passe n'est pas activée sur ce serveur",
  "auth.resetConfirm.successTitle": "Mot de passe réinitialisé",
  "auth.resetConfirm.successMessage":
    "Votre mot de passe a été réinitialisé. Redirection vers la connexion…",
  "auth.resetConfirm.submit": "Réinitialiser le mot de passe",
  "auth.resetConfirm.resetting": "Réinitialisation…",
  "auth.retryConnection": "Réessayer la connexion",
  "auth.redirectingToSignIn": "Redirection vers la connexion…",
  "auth.errors.backendUnreachable":
    "Impossible de joindre l'API du backend. Vérifier BACKEND_URL, FRONTEND_URL et la configuration du reverse proxy.",
  "auth.errors.initFailed":
    "Impossible d'initialiser l'authentification. Vérifier la connexion au backend/à l'API, puis actualiser.",
  "auth.errors.disabled": "L'authentification est désactivée",
  "auth.errors.loginFailed": "Échec de la connexion",
  "auth.errors.registrationFailed": "Échec de l'inscription",
  "auth.errors.signOutFailed":
    "Impossible de se déconnecter. Veuillez réessayer.",

  // Authentication setup
  "authSetup.chooseTitle": "Choisir le mode d'authentification",
  "authSetup.confirmDisableTitle":
    "Laisser l'authentification désactivée\u202F?",
  "authSetup.existingData": "Données existantes détectées.",
  "authSetup.secureWorkspace": "Sécuriser cet espace de travail.",
  "authSetup.trustedNetworkOnly":
    "À n'utiliser que sur un réseau de confiance.",
  "authSetup.secureTitle": "Sécuriser ExcaliDash",
  "authSetup.secureDescription":
    "Créer un compte administrateur et restreindre l'accès.",
  "authSetup.enable": "Activer l'authentification",
  "authSetup.keepDisabled": "Laisser désactivée",
  "authSetup.disableWarning":
    "Toute personne sur ce réseau pourra accéder à tous les dessins.",
  "authSetup.disable": "Désactiver l'authentification",
  "authSetup.failed": "Impossible d'appliquer le choix d'authentification",

  // Password fields
  "password.newPassword": "Nouveau mot de passe",
  "password.confirmNewPassword": "Confirmer le nouveau mot de passe",
  "password.confirmPassword": "Confirmer le mot de passe",
  "password.match": "Les mots de passe correspondent",
  "password.mismatch": "Les mots de passe ne correspondent pas",
  "password.newPasswordsMismatch":
    "Les nouveaux mots de passe ne correspondent pas",
  "password.show": "Afficher le mot de passe",
  "password.hide": "Masquer le mot de passe",

  "password.currentPassword": "Mot de passe actuel",
  "password.enterCurrent": "Saisir le mot de passe actuel",
  "password.enterNew": "Saisir le nouveau mot de passe",
  "password.change": "Changer le mot de passe",
  "password.changing": "Modification…",
  "password.changed": "Mot de passe modifié",
  "password.signedOutAfterwards": "Vous serez déconnecté ensuite",
  "password.errors.allRequired": "Tous les champs de mot de passe sont requis",
  "password.errors.changeFailed": "Impossible de changer le mot de passe",

  // Profile
  "profile.resetRequired": "Réinitialisation du mot de passe requise",
  "profile.resetRequiredHint":
    "Changer votre mot de passe ci-dessous avant d'utiliser ExcaliDash.",
  "profile.displayName": "Nom affiché",
  "profile.email": "E-mail",
  "profile.change": "Modifier",
  "profile.newEmail": "Nouvel e-mail",
  "profile.saveEmail": "Enregistrer l'e-mail",
  "profile.nameUpdated": "Nom mis à jour",
  "profile.emailUpdated": "E-mail mis à jour",
  "profile.errors.resetBeforeProfile":
    "Vous devez réinitialiser votre mot de passe avant de modifier votre profil",
  "profile.errors.resetBeforeEmail":
    "Vous devez réinitialiser votre mot de passe avant de changer d'e-mail",
  "profile.errors.nameEmpty": "Le nom ne peut pas être vide",
  "profile.errors.emailEmpty": "L'e-mail ne peut pas être vide",
  "profile.errors.currentPasswordRequired":
    "Le mot de passe actuel est requis pour changer d'e-mail",
  "profile.errors.updateName": "Impossible de mettre à jour le nom",
  "profile.errors.updateEmail": "Impossible de mettre à jour l'e-mail",

  // API keys
  "apiKeys.title": "Clés API",
  "apiKeys.subtitle": "Jetons pour les applications et les scripts",
  "apiKeys.unavailable":
    "La gestion des clés API est indisponible tant que votre mot de passe n'a pas été réinitialisé.",
  "apiKeys.unavailableHint":
    "Changer votre mot de passe dans Profil, puis revenir ici pour créer et gérer des clés API.",
  "apiKeys.copyNow":
    "Copier ce jeton maintenant. Il ne sera plus jamais affiché.",
  "apiKeys.newKey": "Nouvelle clé API\u00A0: {name}",
  "apiKeys.generatedToken": "Jeton API généré pour {name}",
  "apiKeys.copyGeneratedToken": "Copier le jeton API généré",
  "apiKeys.nameLabel": "Nom de la clé API",
  "apiKeys.nameExample": "Exemple\u00A0: script de sauvegarde",
  "apiKeys.namePlaceholder": "Nom de la clé",
  "apiKeys.create": "Créer une clé API",
  "apiKeys.creating": "Création…",
  "apiKeys.scopes": "Portées",
  "apiKeys.scope.drawingsRead": "Lire les dessins",
  "apiKeys.scope.drawingsWrite": "Modifier les dessins",
  "apiKeys.scope.collectionsRead": "Lire les collections",
  "apiKeys.scope.collectionsWrite": "Modifier les collections",
  "apiKeys.loading": "Chargement des clés API…",
  "apiKeys.empty": "Aucune clé API n'a encore été créée.",
  "apiKeys.status.active": "Active",
  "apiKeys.status.revoked": "Révoquée",
  "apiKeys.details": "Détails de la clé API {name}",
  "apiKeys.prefix": "Préfixe",
  "apiKeys.none": "Aucune",
  "apiKeys.never": "Jamais",
  "apiKeys.createdAt": "Créée le {date}",
  "apiKeys.lastUsedAt": "Dernière utilisation\u00A0: {date}",
  "apiKeys.revokedAt": "Révoquée le {date}",
  "apiKeys.revoke": "Révoquer",
  "apiKeys.revokeKey": "Révoquer la clé API {name}",
  "apiKeys.revokeTitle": "Révoquer la clé API",
  "apiKeys.revokeMessage":
    "Révoquer la clé API «\u00A0{name}\u00A0»\u202F? Les intégrations qui l'utilisent cesseront de fonctionner.",
  "apiKeys.showLess": "Afficher moins",
  "apiKeys.showMore": "Afficher {count} de plus",
  "apiKeys.created":
    "Clé API créée. Copier le jeton maintenant\u202F; il ne sera plus affiché.",
  "apiKeys.tokenCopied": "Jeton de la clé API copié dans le presse-papiers",
  "apiKeys.revoked": "Clé API révoquée",
  "apiKeys.errors.load": "Impossible de charger les clés API",
  "apiKeys.errors.create": "Impossible de créer la clé API",
  "apiKeys.errors.revoke": "Impossible de révoquer la clé API",
  "apiKeys.errors.copy":
    "Impossible de copier le jeton. Le sélectionner et le copier manuellement.",
  "apiKeys.errors.nameRequired": "Le nom de la clé API est requis",
  "apiKeys.errors.scopeRequired": "Sélectionner au moins une portée",

  // Admin
  "admin.subtitle": "Gérer les utilisateurs et les accès",
  "admin.subtitleSingleUser": "Consulter ce déploiement mono-utilisateur",
  "admin.newUser": "Nouvel utilisateur",
  "admin.role": "Rôle",
  "admin.active": "Actif",
  "admin.inactive": "Inactif",
  "admin.reset": "Réinitialiser",
  "admin.resetting": "Réinitialisation…",
  "admin.unknownAdmin": "Administrateur inconnu",
  "admin.userCreated": "Utilisateur créé",
  "admin.userUpdated": "Utilisateur mis à jour",
  "admin.tempPasswordGenerated": "Mot de passe temporaire généré pour {email}",
  "admin.errors.loadUsers": "Impossible de charger les utilisateurs",
  "admin.errors.createUser": "Impossible de créer l'utilisateur",
  "admin.errors.updateUser": "Impossible de mettre à jour l'utilisateur",
  "admin.errors.impersonate":
    "Impossible d'emprunter l'identité de l'utilisateur",
  "admin.errors.stopCurrentImpersonation":
    "Arrêter l'emprunt d'identité en cours avant d'en commencer un nouveau.",
  "admin.errors.missingSession": "État de la session utilisateur introuvable.",
  "admin.access.title": "Contrôle d'accès",
  "admin.access.subtitle": "Qui peut créer un compte",
  "admin.access.loading": "Chargement…",
  "admin.access.oidcOnly": "Géré par le mode OIDC uniquement",
  "admin.access.signupOpen": "Tout le monde peut créer un compte local",
  "admin.access.signupBlocked": "La création de comptes locaux est bloquée",
  "admin.access.localSignup": "Inscription locale",
  "admin.access.toggleLocalSignup": "Activer/désactiver l'inscription locale",
  "admin.access.autoProvisioning":
    "Création automatique des comptes {provider}",
  "admin.access.toggleAutoProvisioning":
    "Activer/désactiver la création automatique des comptes {provider}",
  "admin.access.autoProvisioningOn":
    "Les utilisateurs OIDC obtiennent un compte à leur première connexion",
  "admin.access.autoProvisioningOff":
    "Seuls les utilisateurs déjà créés peuvent se connecter via OIDC",
  "admin.access.registrationEnabled": "Inscription activée",
  "admin.access.registrationDisabled": "Inscription désactivée",
  "admin.access.autoProvisioningEnabled":
    "Création automatique des comptes OIDC activée",
  "admin.access.autoProvisioningDisabled":
    "L'accès OIDC est désormais sur invitation uniquement",
  "admin.access.errors.load": "Impossible de charger l'état des inscriptions",
  "admin.access.errors.updateRegistration":
    "Impossible de modifier le paramètre d'inscription",
  "admin.access.errors.updateOidc":
    "Impossible de modifier le paramètre de création automatique OIDC",
  "admin.createUser.title": "Créer un utilisateur",
  "admin.createUser.username": "Nom d'utilisateur (facultatif)",
  "admin.createUser.accountType": "Type de compte",
  "admin.createUser.oidcInvite": "Invitation OIDC uniquement",
  "admin.createUser.localAccount": "Compte avec mot de passe local",
  "admin.createUser.oidcInviteHint":
    "Cet utilisateur peut se connecter via OIDC si l'e-mail du fournisseur d'identité correspond. Aucun mot de passe local n'est stocké.",
  "admin.createUser.localAccountHint":
    "Cet utilisateur peut se connecter avec un mot de passe local.",
  "admin.createUser.tempPassword": "Mot de passe temporaire",
  "admin.createUser.passwordReset": "Réinitialisation du mot de passe",
  "admin.createUser.notUsedForOidc": "Non utilisé en mode OIDC uniquement",
  "admin.createUser.mustReset": "Doit réinitialiser son mot de passe",
  "admin.createUser.noReset": "Aucune réinitialisation requise",
  "admin.createUser.accountStatus": "Statut du compte",
  "admin.createUser.create": "Créer",
  "admin.rateLimit.title": "Limitation des tentatives de connexion",
  "admin.rateLimit.subtitle": "Freiner les tentatives de connexion répétées",
  "admin.rateLimit.saved": "Enregistré",
  "admin.rateLimit.unsaved": "Non enregistré",
  "admin.rateLimit.rowTitle": "Limitation",
  "admin.rateLimit.active": "Protection contre la force brute active",
  "admin.rateLimit.inactive":
    "À ne désactiver que dans un environnement de confiance",
  "admin.rateLimit.toggle":
    "Activer/désactiver la limitation des tentatives de connexion",
  "admin.rateLimit.attempts": "Tentatives",
  "admin.rateLimit.attemptsDescription":
    "Nombre maximal d'échecs de connexion par période",
  "admin.rateLimit.maxAttempts": "Nombre maximal de tentatives",
  "admin.rateLimit.per": "par",
  "admin.rateLimit.windowMinutes": "Période en minutes",
  "admin.rateLimit.minutesShort": "min",
  "admin.rateLimit.resetLockout": "Débloquer un compte",
  "admin.rateLimit.resetLockoutDescription": "Lever le blocage d'un compte",
  "admin.rateLimit.accountToUnlock": "Compte à débloquer",
  "admin.rateLimit.changesSaved":
    "Modifications de la limitation des connexions enregistrées",
  "admin.rateLimit.resetDone":
    "Limitation des connexions levée pour {identifier}",
  "admin.rateLimit.errors.load":
    "Impossible de charger la configuration de la limitation",
  "admin.rateLimit.errors.save":
    "Impossible d'enregistrer la configuration de la limitation",
  "admin.rateLimit.errors.reset": "Impossible de lever la limitation",
  "admin.rateLimit.errors.identifierRequired":
    "Saisir un e-mail ou un nom d'utilisateur à débloquer",
  "admin.impersonate.title": "Emprunter l'identité\u202F?",
  "admin.impersonate.message":
    "Vous agirez en tant que {email} jusqu'à l'arrêt de l'emprunt d'identité. Continuer\u202F?",
  "admin.impersonate.confirm": "Emprunter l'identité",
  "admin.tempPassword.title": "Mot de passe temporaire",
  "admin.tempPassword.forPrefix": "Mot de passe temporaire pour",
  "admin.tempPassword.forSuffix":
    ". Un nouveau mot de passe sera demandé à la connexion.",
  "admin.users.title": "Utilisateurs",
  "admin.users.user": "Utilisateur",
  "admin.users.reset": "Réinit.\u202F?",
  "admin.users.actions": "Actions",
  "admin.users.roleFor": "Rôle de {name}",
  "admin.users.useProfileForOwn":
    "Pour votre propre compte, utiliser Profil → Changer le mot de passe",
  "admin.users.generateTempPassword": "Générer un mot de passe temporaire",
  "admin.users.generating": "Génération…",
  "admin.users.empty": "Aucun utilisateur trouvé.",

  // Editor (ExcaliDash UI around the Excalidraw canvas)
  "editor.savingChanges": "Enregistrement des modifications…",
  "editor.unsavedChanges": "Modifications non enregistrées",
  "editor.unsavedChangesHint":
    "Vos dernières modifications n'ont pas pu être enregistrées. Vérifier la connexion, puis réessayer.",
  "editor.readOnly": "Lecture seule",
  "editor.versionHistory": "Historique des versions",
  "editor.share": "Partager",
  "editor.enableAutoHide": "Activer le masquage automatique",
  "editor.disableAutoHide": "Désactiver le masquage automatique",
  "editor.exportDrawing": "Exporter le dessin",
  "editor.you": "{name} (vous)",
  "editor.unableToOpen": "Impossible d'ouvrir le dessin",
  "editor.backToDashboard": "Retour au tableau de bord",
  "editor.lightMode": "Mode clair",
  "editor.darkMode": "Mode sombre",
  "editor.loadingDrawing": "Chargement du dessin…",
  "editor.preparingCanvas": "Préparation du canevas…",
  "editor.history.title": "Historique des versions",
  "editor.history.close": "Fermer l'historique des versions",
  "editor.history.loading": "Chargement de l'historique…",
  "editor.history.empty": "Aucun historique pour l'instant",
  "editor.history.emptyHint":
    "Les versions sont enregistrées automatiquement pendant l'édition.",
  "editor.history.version": "Version {version}",
  "editor.history.justNow": "à l'instant",
  "editor.history.confirmRestore": "Confirmer\u202F?",
  "editor.history.restoring": "Restauration…",
  "editor.history.restore": "Restaurer",
  "editor.history.retention": "Les versions sont conservées 2\u00A0jours",
  "editor.history.preview": "Aperçu d'une version précédente",
  "editor.share.title": "Partager le dessin",
  "editor.share.copyLink": "Copier le lien",
  "editor.share.linkCopied": "Lien copié\u202F!",
  "editor.share.updating": "Mise à jour du partage",
  "editor.share.generalAccess": "Accès général",
  "editor.share.linkAccess": "Accès par lien",
  "editor.share.restricted": "Restreint",
  "editor.share.anyoneWithLink": "Toute personne disposant du lien",
  "editor.share.linkPermission": "Droits du lien",
  "editor.share.setExpiration": "Définir l'expiration du lien",
  "editor.share.customExpiry": "Date d'expiration personnalisée",
  "editor.share.expiry.1h": "Désactiver dans 1\u00A0heure",
  "editor.share.expiry.1d": "Désactiver dans 1\u00A0jour",
  "editor.share.expiry.2d": "Désactiver dans 2\u00A0jours",
  "editor.share.expiry.7d": "Désactiver dans 7\u00A0jours",
  "editor.share.expiry.30d": "Désactiver dans 30\u00A0jours",
  "editor.share.expiry.never": "Ne jamais désactiver",
  "editor.share.expiry.custom": "Désactiver le…",
  "editor.share.people": "Personnes",
  "editor.share.canView": "Peut consulter",
  "editor.share.canEdit": "Peut modifier",
  "editor.share.newPeoplePermission": "Droits des nouvelles personnes",
  "editor.share.accessFor": "Accès de {name}",
  "editor.share.remove": "Retirer",
  "editor.share.errors.revokeAccess": "Impossible de retirer l'accès",
  "editor.share.errors.updateAccess": "Impossible de modifier l'accès",
  "editor.share.errors.updateLink": "Impossible de modifier le lien",
  "editor.share.errors.revokeLink": "Impossible de désactiver le lien",
  "editor.toast.saved": "Modifications enregistrées sur le serveur",
  "editor.toast.saveFailed": "Impossible d'enregistrer les modifications",
  "editor.toast.saveBeforeLeaveFailed":
    "Impossible d'enregistrer les modifications. Réessayer avant de quitter.",
  "editor.toast.blankSceneSkipped":
    "Scène vide détectée au chargement. Enregistrement ignoré pour protéger les données existantes.",
  "editor.toast.conflict":
    "Le dessin a été modifié dans un autre onglet. Actualiser pour charger la dernière version.",
  "editor.toast.renameFailed": "Impossible de renommer le dessin",
  "editor.toast.exported": "Dessin exporté",
  "editor.toast.exportFailed":
    "Impossible de regrouper les images du dessin. Veuillez réessayer.",
  "editor.toast.saveLibraryFailed": "Impossible d'enregistrer la bibliothèque",
  "editor.toast.serverStorageChanged":
    "Le stockage du dessin a changé sur le serveur. Rechargement de l'éditeur.",
  "editor.library.confirmExternal":
    "Importer une bibliothèque depuis un site externe\u202F?\n\n{origin}\n\nNe continuer que si vous faites confiance à cette source.",
  "editor.library.canceled": "Import de la bibliothèque annulé",
  "editor.library.importing": "Import de la bibliothèque…",
  "editor.library.imported": "Bibliothèque importée",
  "editor.library.failed": "Impossible d'importer la bibliothèque",
  "editor.load.failed": "Impossible de charger le dessin",
  "editor.load.forbidden": "Vous n'avez pas accès à ce dessin",
  "editor.load.notFound": "Dessin introuvable",

  // Password policy
  "password.policy.mustBe": "Le mot de passe doit contenir {requirements}",
  "password.policy.atLeastChars": "au moins {count} caractères",
  "password.policy.oneUppercase": "une majuscule",
  "password.policy.oneLowercase": "une minuscule",
  "password.policy.oneNumber": "un chiffre",
  "password.policy.oneSymbol": "un symbole",
  "password.policy.requirementsText": "{requirements}.",
  "password.policy.charRange": "{min} à {max} caractères",
  "password.policy.oneUppercaseShort": "1 majuscule",
  "password.policy.oneLowercaseShort": "1 minuscule",
  "password.policy.oneNumberShort": "1 chiffre",
  "password.policy.oneSymbolShort": "1 symbole",
  "password.policy.tooLong":
    "Le mot de passe doit contenir au plus {max} caractères",
  "password.requirement.minLength": "Au moins {count} caractères",
  "password.requirement.uppercase": "Une majuscule (A-Z)",
  "password.requirement.lowercase": "Une minuscule (a-z)",
  "password.requirement.number": "Un chiffre (0-9)",
  "password.requirement.symbol": "Un symbole",

  // Import & upload
  "import.defaultName": "Dessin importé",
  "import.defaultNameNumbered": "Dessin importé {number}",
  "import.errors.noSupportedFiles": "Aucun fichier pris en charge trouvé.",
  "import.errors.invalidFileStructure":
    "Structure de fichier invalide\u00A0: {name}",
  "import.errors.uploadFailed": "Échec de l'envoi",
  "import.errors.legacyNoDrawings":
    "Le JSON d'export ne contient aucun dessin.",
  "import.errors.invalidLegacyDrawing":
    "dessin {number}\u00A0: structure invalide (elements/appState manquants)",
  "import.errors.looksLikeBackup":
    "Ce fichier ressemble à une sauvegarde ExcaliDash (.excalidash). Utiliser «\u00A0Importer une sauvegarde\u00A0» plutôt que l'import d'anciens formats.",
  "import.errors.zipNoDrawings":
    "Le ZIP ne contient aucun dessin .excalidraw/.json.",
  "import.errors.invalidJson": "JSON invalide\u00A0: {name}",
  "import.errors.invalidDrawingStructure":
    "Structure de dessin invalide\u00A0: {name}",
  "import.errors.zipEntryFailed": "Impossible d'importer l'élément du ZIP",
  "upload.errors.unsupportedFileType": "Type de fichier non pris en charge",
  "upload.errors.unexpected": "L'envoi a échoué de manière inattendue",
};
