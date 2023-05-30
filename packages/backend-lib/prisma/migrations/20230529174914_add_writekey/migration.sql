-- CreateTable
CREATE TABLE "WriteKey" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "secretId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriteKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WriteKey_workspaceId_secretId_key" ON "WriteKey"("workspaceId", "secretId");

-- AddForeignKey
ALTER TABLE "WriteKey" ADD CONSTRAINT "WriteKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriteKey" ADD CONSTRAINT "WriteKey_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "Secret"("id") ON DELETE CASCADE ON UPDATE CASCADE;
