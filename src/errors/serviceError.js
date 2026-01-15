class ServiceError extends Error {
  constructor(message, status = 500, code = 'SERVICE_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = ServiceError;
