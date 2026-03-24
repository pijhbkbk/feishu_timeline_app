import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ReviewsService } from './reviews.service';

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('projects/:projectId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Get('cabin')
  getCabinReviewWorkspace(@Param('projectId') projectId: string) {
    return this.reviewsService.getCabinReviewWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('cabin')
  createCabinReview(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.createCabinReview(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Patch('cabin/:reviewId')
  updateCabinReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.updateCabinReview(projectId, reviewId, body, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @UseInterceptors(FileInterceptor('file'))
  @Post('cabin/:reviewId/attachment')
  uploadCabinReviewAttachment(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.uploadCabinReviewAttachment(projectId, reviewId, file, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('cabin/:reviewId/submit')
  submitCabinReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.submitCabinReview(projectId, reviewId, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('cabin/:reviewId/approve')
  approveCabinReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.approveCabinReview(projectId, reviewId, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('cabin/:reviewId/reject')
  rejectCabinReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.rejectCabinReview(projectId, reviewId, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Get('consistency')
  getConsistencyReviewWorkspace(@Param('projectId') projectId: string) {
    return this.reviewsService.getConsistencyReviewWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('consistency')
  createConsistencyReview(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.createConsistencyReview(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Patch('consistency/:reviewId')
  updateConsistencyReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.updateConsistencyReview(projectId, reviewId, body, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @UseInterceptors(FileInterceptor('file'))
  @Post('consistency/:reviewId/attachment')
  uploadConsistencyReviewAttachment(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.uploadConsistencyReviewAttachment(projectId, reviewId, file, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('consistency/:reviewId/submit')
  submitConsistencyReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.submitConsistencyReview(projectId, reviewId, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('consistency/:reviewId/approve')
  approveConsistencyReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.approveConsistencyReview(projectId, reviewId, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('consistency/:reviewId/reject')
  rejectConsistencyReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.rejectConsistencyReview(projectId, reviewId, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Get('visual-delta')
  getVisualDeltaReviewWorkspace(@Param('projectId') projectId: string) {
    return this.reviewsService.getVisualDeltaReviewWorkspace(projectId);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('visual-delta')
  createVisualDeltaReview(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.createVisualDeltaReview(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Patch('visual-delta/:reviewId')
  updateVisualDeltaReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.updateVisualDeltaReview(projectId, reviewId, body, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @UseInterceptors(FileInterceptor('file'))
  @Post('visual-delta/:reviewId/attachment')
  uploadVisualDeltaReviewAttachment(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.uploadVisualDeltaReviewAttachment(projectId, reviewId, file, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('visual-delta/:reviewId/submit')
  submitVisualDeltaReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.submitVisualDeltaReview(projectId, reviewId, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('visual-delta/:reviewId/approve')
  approveVisualDeltaReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.approveVisualDeltaReview(projectId, reviewId, actor);
  }

  @Roles('admin', 'project_manager', 'quality_engineer', 'reviewer')
  @Post('visual-delta/:reviewId/reject')
  rejectVisualDeltaReview(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.rejectVisualDeltaReview(projectId, reviewId, actor);
  }
}
