-- CreateTable
CREATE TABLE "RolePageAccess" (
    "role" "Role" NOT NULL,
    "page" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePageAccess_pkey" PRIMARY KEY ("role","page")
);
