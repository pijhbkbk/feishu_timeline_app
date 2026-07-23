'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';

import { ArrowLeftIcon, CheckIcon, ResetIcon, UploadIcon } from './icons';
import { useR26PrototypeStore } from './prototype-store';
import { PageIntro, StatusPill } from './ui';

const steps = [
  { number: 1, title: '做了什么', description: '记录实际完成内容' },
  { number: 2, title: '是否阻塞', description: '说明协同与风险' },
  { number: 3, title: '上传材料', description: '补齐交付证据' },
];

export function ProgressPage() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { progressSubmitted, submitProgress, resetPrototype } = useR26PrototypeStore();
  const [step, setStep] = useState(1);
  const [completedPercent, setCompletedPercent] = useState('100');
  const [completedWork, setCompletedWork] = useState('已完成到货数量核对，并确认涂料批次与采购订单一致。');
  const [nextPlan, setNextPlan] = useState('补齐到货确认记录后，交接首台生产计划。');
  const [blockerStatus, setBlockerStatus] = useState<'clear' | 'blocked'>('clear');
  const [blockerType, setBlockerType] = useState('材料缺口');
  const [blockerDescription, setBlockerDescription] = useState('');
  const [helper, setHelper] = useState('项目经理');
  const [expectedResolution, setExpectedResolution] = useState('明天 12:00');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(progressSubmitted);

  const taskId = searchParams.get('taskId') ?? 't006';
  const projectId = searchParams.get('projectId') ?? 'demo-r26';

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  }

  function nextStep() {
    if (step === 1 && (!completedWork.trim() || !nextPlan.trim())) {
      showNotice('请填写已完成事项和下一步计划。');
      return;
    }
    if (
      step === 2 &&
      blockerStatus === 'blocked' &&
      (!blockerType.trim() || !blockerDescription.trim() || !helper.trim() || !expectedResolution.trim())
    ) {
      showNotice('有阻塞时，请完整填写阻塞类型、描述、协助人和预计解决时间。');
      return;
    }
    setStep((value) => Math.min(3, value + 1));
  }

  function acceptFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setSelectedFileName(file.name);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    acceptFile(event.dataTransfer.files[0]);
  }

  function submit() {
    if (submitted) {
      return;
    }
    submitProgress();
    setSubmitted(true);
  }

  function reset() {
    resetPrototype();
    setSubmitted(false);
    setStep(1);
    setSelectedFileName(null);
    setBlockerStatus('clear');
  }

  if (submitted) {
    return (
      <div className="r26-page r26-progress-page" data-testid="r26-progress-success">
        <section className="r26-success-state">
          <span className="r26-success-state__icon"><CheckIcon /></span>
          <p className="r26-eyebrow">本地状态已联动</p>
          <h1>进展已提交（静态原型）</h1>
          <p>“涂料采购”已更新为已完成。系统已创建：标准板制作、涂料性能试验、首台生产计划。</p>
          <p>工作台、项目地图和最近动态已同步；没有向任何真实业务 API 提交数据。</p>
          <div className="r26-success-state__summary">
            <div><span>项目</span><strong>深海蓝</strong></div>
            <div><span>工序</span><strong>第 06 步 · 涂料采购</strong></div>
            <div><span>材料</span><strong>{selectedFileName ?? '到货确认记录.pdf'}</strong></div>
          </div>
          <div className="r26-success-state__actions">
            <Link href="/v2/projects/demo-r26?taskId=t006" className="r26-button r26-button--primary">
              查看更新后的项目
            </Link>
            <Link href="/v2/dashboard" className="r26-button r26-button--secondary">
              返回工作台
            </Link>
            <button type="button" className="r26-reset-button" onClick={reset}>
              <ResetIcon />
              重置本地原型
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="r26-page r26-progress-page" data-testid="r26-progress">
      <PageIntro
        eyebrow="60 秒完成"
        title="提交工序进展"
        description="项目和工序已经自动带入，只需记录事实、阻塞和材料。"
      />

      <section className="r26-progress-context" aria-label="当前进展上下文">
        <div className="r26-progress-context__identity">
          <span className="r26-color-swatch" style={{ background: '#1f4e79' }} aria-label="深海蓝色样" />
          <div>
            <span>深海蓝 · 轻卡定制色开发项目</span>
            <strong>第 06 步 · 涂料采购</strong>
          </div>
        </div>
        <div className="r26-progress-context__facts">
          <span>负责人：张七巧</span>
          <span>截止：今天 17:00</span>
          <StatusPill tone="current">进行中</StatusPill>
        </div>
        <span className="r26-context-id" aria-hidden="true">{projectId} · {taskId}</span>
      </section>

      <nav className="r26-progress-steps" aria-label="进展提交步骤">
        {steps.map((item) => (
          <button
            key={item.number}
            type="button"
            className={step === item.number ? 'is-current' : step > item.number ? 'is-complete' : undefined}
            aria-current={step === item.number ? 'step' : undefined}
            onClick={() => setStep(item.number)}
          >
            <span>{step > item.number ? <CheckIcon /> : item.number}</span>
            <div><strong>{item.title}</strong><small>{item.description}</small></div>
          </button>
        ))}
      </nav>

      <section className="r26-progress-panel">
        {step === 1 ? (
          <div className="r26-form-section" data-testid="progress-step-1">
            <div className="r26-form-section__heading">
              <span>1</span>
              <div><h2>做了什么</h2><p>只记录可以被后续人员理解和复核的事实。</p></div>
            </div>
            <label className="r26-field">
              <span>本工序完成度</span>
              <select value={completedPercent} onChange={(event) => setCompletedPercent(event.target.value)}>
                <option value="75">75%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
              </select>
            </label>
            <label className="r26-field">
              <span>已完成事项</span>
              <textarea rows={5} value={completedWork} onChange={(event) => setCompletedWork(event.target.value)} />
              <small>建议写明数量、批次、确认结果和可追溯证据。</small>
            </label>
            <label className="r26-field">
              <span>下一步计划</span>
              <textarea rows={4} value={nextPlan} onChange={(event) => setNextPlan(event.target.value)} />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="r26-form-section" data-testid="progress-step-2">
            <div className="r26-form-section__heading">
              <span>2</span>
              <div><h2>是否阻塞</h2><p>阻塞信息会帮助项目经理明确介入对象和时间。</p></div>
            </div>
            <div className="r26-choice-grid" role="radiogroup" aria-label="阻塞状态">
              <label className={blockerStatus === 'clear' ? 'is-selected' : undefined}>
                <input type="radio" name="blocker" checked={blockerStatus === 'clear'} onChange={() => setBlockerStatus('clear')} />
                <span><CheckIcon /></span>
                <div><strong>没有阻塞</strong><small>可以按计划进入下一项</small></div>
              </label>
              <label className={blockerStatus === 'blocked' ? 'is-selected is-risk' : undefined}>
                <input type="radio" name="blocker" checked={blockerStatus === 'blocked'} onChange={() => setBlockerStatus('blocked')} />
                <span>!</span>
                <div><strong>存在阻塞</strong><small>需要协同或调整计划</small></div>
              </label>
            </div>

            {blockerStatus === 'blocked' ? (
              <div className="r26-blocker-fields" data-testid="blocker-fields">
                <label className="r26-field">
                  <span>阻塞类型</span>
                  <select value={blockerType} onChange={(event) => setBlockerType(event.target.value)}>
                    <option>材料缺口</option>
                    <option>供应商延迟</option>
                    <option>质量问题</option>
                    <option>跨部门协同</option>
                  </select>
                </label>
                <label className="r26-field">
                  <span>需要谁协助</span>
                  <input value={helper} onChange={(event) => setHelper(event.target.value)} />
                </label>
                <label className="r26-field r26-field--wide">
                  <span>阻塞描述</span>
                  <textarea rows={4} value={blockerDescription} onChange={(event) => setBlockerDescription(event.target.value)} placeholder="说明发生了什么、影响什么、需要什么决定" />
                </label>
                <label className="r26-field r26-field--wide">
                  <span>预计解决时间</span>
                  <input value={expectedResolution} onChange={(event) => setExpectedResolution(event.target.value)} />
                </label>
              </div>
            ) : (
              <div className="r26-clear-state"><CheckIcon /><span>当前无阻塞，可以继续补齐材料并提交。</span></div>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="r26-form-section" data-testid="progress-step-3">
            <div className="r26-form-section__heading">
              <span>3</span>
              <div><h2>上传材料</h2><p>本轮只保存文件名，不读取、不上传真实文件内容。</p></div>
            </div>

            <div className="r26-required-materials">
              <h3>本工序必交材料</h3>
              <ul>
                <li className="is-complete"><CheckIcon /><span><strong>采购订单</strong><small>已具备</small></span></li>
                <li className="is-complete"><CheckIcon /><span><strong>供应商送货单</strong><small>已具备</small></span></li>
                <li className={selectedFileName ? 'is-complete' : 'is-missing'}>
                  {selectedFileName ? <CheckIcon /> : <span>!</span>}
                  <span><strong>到货确认记录</strong><small>{selectedFileName ?? '待补充'}</small></span>
                </li>
              </ul>
            </div>

            <div
              className="r26-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              data-testid="progress-dropzone"
            >
              <UploadIcon />
              <strong>{selectedFileName ? '已选择材料' : '拖入材料，或从本机选择'}</strong>
              <p>{selectedFileName ?? '仅记录文件名；不会读取或上传文件内容。'}</p>
              <button type="button" className="r26-button r26-button--secondary" onClick={() => fileInputRef.current?.click()}>
                选择文件
              </button>
              <input
                ref={fileInputRef}
                type="file"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => acceptFile(event.target.files?.[0])}
              />
            </div>

            <div className="r26-submit-summary">
              <h3>提交摘要</h3>
              <dl>
                <div><dt>完成度</dt><dd>{completedPercent}%</dd></div>
                <div><dt>阻塞状态</dt><dd>{blockerStatus === 'clear' ? '无阻塞' : `${blockerType} · ${helper}`}</dd></div>
                <div><dt>材料</dt><dd>{selectedFileName ? '3 / 3' : '2 / 3'}</dd></div>
              </dl>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="r26-progress-footer">
        <button type="button" className="r26-button r26-button--ghost" onClick={() => showNotice('草稿仅保存在当前页面，不会写入后端。')}>
          保存本页草稿
        </button>
        <div>
          {step > 1 ? (
            <button type="button" className="r26-button r26-button--secondary" onClick={() => setStep((value) => value - 1)}>
              <ArrowLeftIcon />
              上一步
            </button>
          ) : null}
          {step < 3 ? (
            <button type="button" className="r26-button r26-button--primary" onClick={nextStep} data-testid="progress-next">
              下一步
            </button>
          ) : (
            <button type="button" className="r26-button r26-button--primary" onClick={submit} data-testid="progress-submit">
              提交进展
            </button>
          )}
        </div>
      </footer>

      {notice ? <div className="r26-toast" role="status">{notice}</div> : null}
    </div>
  );
}
