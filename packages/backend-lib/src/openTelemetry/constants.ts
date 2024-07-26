let SERVICE_NAME = "backend-lib";

export function setServiceName(serviceName: string) {
  SERVICE_NAME = serviceName;
}

export function getServiceName() {
  return SERVICE_NAME;
}
