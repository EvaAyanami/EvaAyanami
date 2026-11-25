-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'fr';

-- AlterTable
ALTER TABLE "Language" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'code',
ADD COLUMN     "icon" TEXT NOT NULL DEFAULT '💻',
ADD COLUMN     "runtime" TEXT NOT NULL DEFAULT 'runner';

-- AlterTable
ALTER TABLE "Friendship" ADD COLUMN     "aDate" TEXT,
ADD COLUMN     "bDate" TEXT,
ADD COLUMN     "flame" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "flameBest" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "flameDate" TEXT,
ADD COLUMN     "milestones" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizDuel" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "opponentId" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'mix',
    "questions" TEXT[],
    "creatorAnswers" JSONB,
    "opponentAnswers" JSONB,
    "creatorScore" INTEGER,
    "opponentScore" INTEGER,
    "creatorTimeMs" INTEGER,
    "opponentTimeMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "QuizDuel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "page" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "adminReply" TEXT,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackVote" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "FeedbackVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_idx" ON "EmailToken"("userId");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerId_key" ON "OAuthAccount"("provider", "providerId");

-- CreateIndex
CREATE INDEX "QuizDuel_creatorId_idx" ON "QuizDuel"("creatorId");

-- CreateIndex
CREATE INDEX "QuizDuel_opponentId_idx" ON "QuizDuel"("opponentId");

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackVote_feedbackId_userId_key" ON "FeedbackVote"("feedbackId", "userId");

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizDuel" ADD CONSTRAINT "QuizDuel_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizDuel" ADD CONSTRAINT "QuizDuel_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Les comptes existants sont considérés comme vérifiés.
UPDATE "User" SET "emailVerified" = true;
