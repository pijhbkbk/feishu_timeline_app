import Link from 'next/link';
import React from 'react';

import { ProjectEditor } from '../../../../components/project-editor';
import { toProductHref } from '../../../../features/v2/production-ui';
import { PageIntro } from '../../../../features/v2/ui';

export default function NewProjectPage() {
  return (
    <div className="r26-page r26-project-create-page" data-testid="r26-project-create">
      <PageIntro
        eyebrow="项目立项"
        title="新建定制色开发项目"
        description="填写项目基础信息和成员，创建后系统将自动初始化 18 步开发流程。"
        action={
          <Link
            className="r26-button r26-button--secondary"
            href={toProductHref('/v2/projects')}
          >
            返回项目列表
          </Link>
        }
      />
      <ProjectEditor mode="create" />
    </div>
  );
}
