/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Temporary build flag: render the "QA-Modus starten" button in LegalFooter.
   * Set to 'true' during the soft-launch QA window; leave unset in production.
   *
   * Cleanup task: .scratch/qa-feedback-mode/issues/18-temporary-footer-button-to-activate-qa.md
   */
  readonly VITE_QA_FOOTER_BUTTON?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
