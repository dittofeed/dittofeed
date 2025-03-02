export class DiContainer<
  TServiceMap extends Record<string, unknown> = Record<string, never>,
> {
  private services = new Map<string, unknown>();

  /**
   * Register a new service
   * @returns A new container type with the registered service type information
   */
  register<K extends string, T>(
    name: K,
    implementation: T,
  ): DiContainer<TServiceMap & Record<K, T>> {
    this.services.set(name, implementation);
    return this as DiContainer<TServiceMap & Record<K, T>>;
  }

  /**
   * Resolve a service with complete type safety
   * The return type is inferred from the service name
   */
  resolve<K extends keyof TServiceMap>(name: K): TServiceMap[K] {
    const service = this.services.get(name as string);

    if (service === undefined) {
      throw new Error(`Service "${String(name)}" not registered`);
    }

    return service as TServiceMap[K];
  }

  /**
   * Check if a service exists
   */
  has<K extends string>(name: K): boolean {
    return this.services.has(name);
  }
}
