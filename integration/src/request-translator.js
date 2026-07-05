export class RequestTranslator {
  translate(request) {
    return {
      id: request.id,
      objective: request.objective,
      context: request.context ?? {}
    };
  }
}
