ALTER TABLE "person_profiles" ADD COLUMN "importKey" VARCHAR(64);
CREATE UNIQUE INDEX "person_profiles_importKey_key" ON "person_profiles"("importKey");
