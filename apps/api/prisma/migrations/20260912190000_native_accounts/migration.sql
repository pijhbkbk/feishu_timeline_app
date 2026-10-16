-- Add native credentials without changing historical users or any business foreign keys.
ALTER TABLE "users"
  ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "requestedJob" VARCHAR(32),
  ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "local_credentials" (
  "userId" TEXT NOT NULL,
  "loginName" VARCHAR(64) NOT NULL,
  "passwordHash" TEXT,
  "resetTokenHash" VARCHAR(64),
  "resetExpiresAt" TIMESTAMP(3),
  "resetVersion" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "local_credentials_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "local_credentials_loginName_key" ON "local_credentials"("loginName");
CREATE UNIQUE INDEX "local_credentials_resetTokenHash_key" ON "local_credentials"("resetTokenHash");
ALTER TABLE "local_credentials" ADD CONSTRAINT "local_credentials_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "auth_initialization" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_initialization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_initialization_userId_key" ON "auth_initialization"("userId");
ALTER TABLE "auth_initialization" ADD CONSTRAINT "auth_initialization_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
