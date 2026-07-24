import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { SecureSingleFileInterceptor } from '../../common/file-upload-options';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  R26ApplyAssignmentsDto,
  R26AssignmentPreviewDto,
  R26RemoveMemberDto,
  R26TransferTaskDto,
  R26UpsertMemberDto,
} from './dto/r26-member-assignment.dto';
import {
  R26DeleteProgressDraftDto,
  R26ProgressDraftDto,
  R26SubmitProgressDto,
  R26UploadMaterialDto,
} from './dto/r26-progress-material.dto';
import { R26MemberAssignmentService } from './r26-member-assignment.service';
import { R26ProgressMaterialService } from './r26-progress-material.service';
import { R26ReadModelService } from './r26-read-model.service';

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@ApiTags('r26-v2-read-model')
@ApiCookieAuth('ft_session')
@Controller('v2')
export class R26ReadModelController {
  constructor(
    private readonly service: R26ReadModelService,
    private readonly memberAssignmentService: R26MemberAssignmentService,
    private readonly progressMaterialService: R26ProgressMaterialService,
  ) {}

  @Permissions('dashboard.read')
  @ApiOperation({ summary: 'R26 V2 当前用户工作台只读模型' })
  @Get('dashboard')
  getDashboard(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.getDashboard(actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 V2 项目列表只读模型' })
  @Get('projects')
  getProjects(
    @Query() query: Record<string, unknown>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getProjects(query, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 V2 项目工作区、成员分工和自动分配预览只读模型' })
  @Get('projects/:projectId/workspace')
  getWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getWorkspace(projectId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 V2 工序详情只读模型' })
  @Get('tasks/:taskId')
  getTask(
    @Param('taskId') taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getTask(taskId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3B 进展、草稿、材料和权限上下文' })
  @Get('tasks/:taskId/progress-context')
  async getProgressContext(
    @Param('taskId') taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const [base, gate3b] = await Promise.all([
      this.service.getTask(taskId, actor),
      this.progressMaterialService.getContext(taskId, actor),
    ]);
    return {
      ...base,
      readOnly: false,
      ...gate3b,
      task: {
        ...base.task,
        availableActions: gate3b.availableActions,
      },
    };
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3B 查看正式进展与材料版本历史' })
  @Get('tasks/:taskId/progress-history')
  getProgressHistory(
    @Param('taskId') taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.progressMaterialService.getProgressHistory(taskId, actor);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3B 保存进展草稿' })
  @Put('tasks/:taskId/progress-draft')
  saveProgressDraft(
    @Param('taskId') taskId: string,
    @Body() body: R26ProgressDraftDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, idempotencyKey);
    return this.progressMaterialService.saveDraft(
      taskId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3B 删除本人进展草稿' })
  @Delete('tasks/:taskId/progress-draft')
  deleteProgressDraft(
    @Param('taskId') taskId: string,
    @Body() body: R26DeleteProgressDraftDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, idempotencyKey);
    return this.progressMaterialService.deleteDraft(
      taskId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3B 提交正式进展（不推进流程）' })
  @Post('tasks/:taskId/progress-updates')
  submitProgress(
    @Param('taskId') taskId: string,
    @Body() body: R26SubmitProgressDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, idempotencyKey);
    return this.progressMaterialService.submitProgress(
      taskId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @Permissions('project.read')
  @UseInterceptors(SecureSingleFileInterceptor('file'))
  @ApiOperation({ summary: 'R26 Gate 3B 上传工序材料 V1' })
  @Post('tasks/:taskId/materials')
  uploadMaterial(
    @Param('taskId') taskId: string,
    @Body() body: R26UploadMaterialDto,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, idempotencyKey);
    return this.progressMaterialService.uploadMaterial(
      taskId,
      body,
      file,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @Permissions('project.read')
  @UseInterceptors(SecureSingleFileInterceptor('file'))
  @ApiOperation({ summary: 'R26 Gate 3B 替换工序材料并创建新版本' })
  @Post('tasks/:taskId/materials/:attachmentId/versions')
  uploadMaterialVersion(
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() body: R26UploadMaterialDto,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertIdempotencyKey(body.idempotencyKey, idempotencyKey);
    if (
      body.replacesAttachmentId &&
      body.replacesAttachmentId !== attachmentId
    ) {
      throw new BadRequestException('路径材料版本与请求内容不一致。');
    }
    body.replacesAttachmentId = attachmentId;
    return this.progressMaterialService.uploadMaterial(
      taskId,
      body,
      file,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3B 查看当前或历史材料版本' })
  @Get('tasks/:taskId/materials/:attachmentId/content')
  async getMaterialVersionContent(
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @Query('disposition') disposition: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const content =
      await this.progressMaterialService.getHistoricalMaterialContent(
        taskId,
        attachmentId,
        actor,
        disposition,
      );
    response.setHeader('Content-Type', content.contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader(
      'Content-Security-Policy',
      "sandbox; default-src 'none'",
    );
    response.setHeader(
      'Content-Disposition',
      `${content.disposition}; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    response.send(content.buffer);
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3A 成员或分工变更影响预览（不写入）' })
  @Post('projects/:projectId/assignment-preview')
  previewAssignments(
    @Param('projectId') projectId: string,
    @Body() body: R26AssignmentPreviewDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.memberAssignmentService.previewAssignments(
      projectId,
      body,
      actor,
    );
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3A 添加项目成员' })
  @Post('projects/:projectId/members')
  async addMember(
    @Param('projectId') projectId: string,
    @Body() body: R26UpsertMemberDto,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const command = await this.memberAssignmentService.addMember(
      projectId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
    const workspace = await this.service.getWorkspace(projectId, actor);
    return { command, workspace };
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3A 修改项目成员职责' })
  @Patch('projects/:projectId/members/:userId')
  async updateMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() body: R26UpsertMemberDto,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const command = await this.memberAssignmentService.updateMember(
      projectId,
      userId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
    const workspace = await this.service.getWorkspace(projectId, actor);
    return { command, workspace };
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3A 安全移出项目成员' })
  @Delete('projects/:projectId/members/:userId')
  async removeMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() body: R26RemoveMemberDto,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const command = await this.memberAssignmentService.removeMember(
      projectId,
      userId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
    const workspace = await this.service.getWorkspace(projectId, actor);
    return { command, workspace };
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3A 应用未来与未开始任务分配' })
  @Post('projects/:projectId/assignments/apply')
  async applyAssignments(
    @Param('projectId') projectId: string,
    @Body() body: R26ApplyAssignmentsDto,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const command = await this.memberAssignmentService.applyAssignments(
      projectId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
    const workspace = await this.service.getWorkspace(projectId, actor);
    return { command, workspace };
  }

  @Permissions('project.read')
  @ApiOperation({ summary: 'R26 Gate 3A 转交单个活跃工序任务' })
  @Patch('projects/:projectId/tasks/:taskId/assignment')
  async transferTask(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: R26TransferTaskDto,
    @Headers('x-request-id') requestId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const command = await this.memberAssignmentService.transferTask(
      projectId,
      taskId,
      body,
      actor,
      requestId?.trim() || body.idempotencyKey,
    );
    const workspace = await this.service.getWorkspace(projectId, actor);
    return { command, workspace };
  }

  private assertIdempotencyKey(
    bodyKey: string,
    headerKey: string | undefined,
  ) {
    if (!headerKey?.trim()) {
      throw new BadRequestException('缺少 Idempotency-Key 请求头。');
    }
    if (headerKey.trim() !== bodyKey) {
      throw new BadRequestException(
        'Idempotency-Key 请求头与请求体不一致。',
      );
    }
  }
}
