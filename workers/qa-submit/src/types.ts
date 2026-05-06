export interface SubmitRequest {
  title: string;
  body: string;
  screenshotBase64?: string;
  screenshotContentType?: string;
  turnstileToken: string;
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
