export interface SubmitRequest {
  title: string;
  body: string;
  screenshotBase64?: string;
  screenshotContentType?: string;
  turnstileToken: string;
  /**
   * Optional maintainer dev-code. When present and equal to the Worker's
   * `MAINTAINER_DEV_CODE` secret, the created issue gets the
   * `from-maintainer` label. Never written to the issue body or any other
   * public surface — only the label is visible.
   */
  devCode?: string;
}

export interface SubmitResponse {
  ok: true;
  issueUrl: string;
  issueNumber: number;
}

export interface ErrorResponse {
  ok: false;
  error: string;
  message: string;
}
