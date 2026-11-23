-- CreateTable
CREATE TABLE "FatSecretConnection" (
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestToken" TEXT,
    "requestSecret" TEXT,
    "returnUrl" TEXT,
    "accessToken" TEXT,
    "accessSecret" TEXT,
    "importStatus" TEXT NOT NULL DEFAULT 'idle',
    "importMonth" TEXT,
    "importMonthsDone" INTEGER NOT NULL DEFAULT 0,
    "importedEntries" INTEGER NOT NULL DEFAULT 0,
    "importedDays" INTEGER NOT NULL DEFAULT 0,
    "importedWeights" INTEGER NOT NULL DEFAULT 0,
    "importOldestDate" TEXT,
    "importError" TEXT,
    "importStartedAt" TIMESTAMP(3),
    "importFinishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatSecretConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ExternalImport" (
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalImport_pkey" PRIMARY KEY ("userId","source","externalId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FatSecretConnection_requestToken_key" ON "FatSecretConnection"("requestToken");

-- AddForeignKey
ALTER TABLE "FatSecretConnection" ADD CONSTRAINT "FatSecretConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalImport" ADD CONSTRAINT "ExternalImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
