// Versionsangaben, beim Build von vite.config.ts eingesetzt (siehe scripts/version.mjs).
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_DATE__: string;

/** z. B. "0.4.23" */
export const APP_VERSION: string = __APP_VERSION__;
/** kurzer Commit-Hash, ggf. mit "-dirty" */
export const APP_COMMIT: string = __APP_COMMIT__;
/** Build-Datum YYYY-MM-DD */
export const APP_BUILD_DATE: string = __APP_BUILD_DATE__;
/** Anzeigetext, z. B. "v0.4.23" */
export const VERSION_LABEL = `v${APP_VERSION}`;
