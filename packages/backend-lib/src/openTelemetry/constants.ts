let SERVICE_NAME: string | null = null;

export function setServiceName(serviceName: string) {
  SERVICE_NAME = serviceName;
}

export function getServiceName() {
  if (!SERVICE_NAME) {
    throw new Error("Service name not set");
  }
  return SERVICE_NAME;
}
