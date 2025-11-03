export class McpClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'McpClientError';
  }
}

export class McpTimeoutError extends McpClientError {
  constructor(message: string) {
    super(message);
    this.name = 'McpTimeoutError';
  }
}

export class McpCircuitOpenError extends McpClientError {
  constructor(message: string) {
    super(message);
    this.name = 'McpCircuitOpenError';
  }
}

export class McpTransportError extends McpClientError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'McpTransportError';
  }
}
