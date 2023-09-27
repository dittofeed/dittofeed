-- CreateTable
CREATE TABLE "DefaultSmsProvider" (
    "workspaceId" UUID NOT NULL,
    "smsProviderId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "SmsProvider" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DefaultSmsProvider_workspaceId_key" ON "DefaultSmsProvider"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsProvider_workspaceId_type_key" ON "SmsProvider"("workspaceId", "type");

-- AddForeignKey
ALTER TABLE "DefaultSmsProvider" ADD CONSTRAINT "DefaultSmsProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultSmsProvider" ADD CONSTRAINT "DefaultSmsProvider_smsProviderId_fkey" FOREIGN KEY ("smsProviderId") REFERENCES "SmsProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsProvider" ADD CONSTRAINT "SmsProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
