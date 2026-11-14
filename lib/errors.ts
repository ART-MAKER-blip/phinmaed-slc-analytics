/** An error whose message is safe to show the user, with the HTTP status to send. */
export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
