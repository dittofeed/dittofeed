/**
 * Type-safe service container using Symbol keys
 */
export class DiContainer {
  private services = new Map<symbol, unknown>();

  /**
   * Create a typed service key
   */
  static createServiceKey<T>(description: string): symbol & { __type?: T } {
    return Symbol(description) as symbol & { __type?: T };
  }

  /**
   * Register a service
   */
  register<T>(key: symbol & { __type?: T }, implementation: T): void {
    this.services.set(key, implementation);
  }

  /**
   * Resolve a service
   */
  resolve<T>(key: symbol & { __type?: T }): T {
    const service = this.services.get(key);

    if (service === undefined) {
      throw new Error(`Service ${key.description} not registered`);
    }

    return service as T;
  }

  /**
   * Check if a service exists
   */
  has(key: symbol): boolean {
    return this.services.has(key);
  }
}
