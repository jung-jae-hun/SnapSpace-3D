'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type ProjectSection = 'scene-create' | 'scene-detail' | 'scene-list';

type Scene = {
  id: string;
  name: string;
  version: number;
  archivedAt?: string | null;
  createdAt?: string;
};

type SceneDetail = {
  id: string;
  name: string;
  version: number;
  projectId: string;
};

type SceneCommandLog = {
  id: string;
  commandId: string;
  action: string;
  expectedVersion: number;
  status: string;
  createdAt: string;
  payload?: unknown;
  result?: Record<string, unknown> | null;
};

export default function ProjectScenesPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [sceneName, setSceneName] = useState('Main Hall Layout');
  const [sceneVersion, setSceneVersion] = useState(1);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedScene, setSelectedScene] = useState<SceneDetail | null>(null);
  const [commandLogs, setCommandLogs] = useState<SceneCommandLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sceneView, setSceneView] = useState<'active' | 'archived'>('active');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'succeeded' | 'failed'>('all');
  const [logActionFilter, setLogActionFilter] = useState<'all' | 'rename' | 'archive' | 'restore'>('all');
  const [density, setDensity] = useState<'cozy' | 'compact'>('cozy');
  const [activeSection, setActiveSection] = useState<ProjectSection>('scene-list');
  const sectionIds = ['scene-create', 'scene-detail', 'scene-list'] as const;

  function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString('ko-KR', { hour12: false });
  }

  function getResultError(log: SceneCommandLog): string | null {
    const value = log.result?.error;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  function getResultStatusCode(log: SceneCommandLog): number | null {
    const value = log.result?.statusCode;
    return typeof value === 'number' ? value : null;
  }

  const loadScenes = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setLoading(true);
    try {
      const includeArchived = sceneView === 'archived' ? '1' : '0';
      const response = await fetch(`/api/projects/${projectId}/scenes?includeArchived=${includeArchived}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        setScenes([]);
        setMessage('씬 목록을 불러오지 못했습니다.');
        return;
      }

      const items = (await response.json()) as Scene[];
      const filtered =
        sceneView === 'archived'
          ? items.filter((item) => Boolean(item.archivedAt))
          : items.filter((item) => !item.archivedAt);
      setScenes(filtered);
    } finally {
      setLoading(false);
    }
  }, [projectId, sceneView]);

  useEffect(() => {
    void loadScenes();
  }, [loadScenes]);

  async function handleCreateScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!projectId) {
      setMessage('프로젝트 ID를 확인할 수 없습니다.');
      return;
    }

    setMessage('씬 생성 중...');

    const response = await fetch(`/api/projects/${projectId}/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sceneName, version: sceneVersion })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      setMessage(error.message ?? '씬 생성 실패');
      return;
    }

    setMessage('씬 생성 완료');
    setSceneName('');
    setSceneVersion(1);
    await loadScenes();
  }

  async function handleSelectScene(sceneId: string) {
    setMessage('씬 상세 조회 중...');

    const response = await fetch(`/api/scenes/${sceneId}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      setMessage(error.message ?? '씬 상세 조회 실패');
      setSelectedScene(null);
      return;
    }

    const detail = (await response.json()) as SceneDetail;
    setSelectedScene(detail);
    setMessage(`씬 상세 조회 완료: ${detail.name}`);
    await loadCommandLogs(sceneId);
  }

  async function loadCommandLogs(sceneId: string) {
    const params = new URLSearchParams({ limit: '20' });
    if (logStatusFilter !== 'all') {
      params.set('status', logStatusFilter);
    }
    if (logActionFilter !== 'all') {
      params.set('action', logActionFilter);
    }

    const response = await fetch(`/api/scenes/${sceneId}/commands?${params.toString()}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      setCommandLogs([]);
      return;
    }

    const logs = (await response.json()) as SceneCommandLog[];
    setCommandLogs(logs);
  }

  useEffect(() => {
    if (!selectedScene) {
      return;
    }

    void loadCommandLogs(selectedScene.id);
  }, [selectedScene, logStatusFilter, logActionFilter]);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (sectionIds.includes(hash as ProjectSection)) {
        setActiveSection(hash as ProjectSection);
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);

    const visibility = new Map<ProjectSection, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id as ProjectSection;
          if (!sectionIds.includes(id)) {
            continue;
          }

          if (entry.isIntersecting) {
            visibility.set(id, entry.intersectionRatio);
          } else {
            visibility.delete(id);
          }
        }

        let candidate: ProjectSection | null = null;
        let maxRatio = 0;
        for (const id of sectionIds) {
          const ratio = visibility.get(id) ?? 0;
          if (ratio > maxRatio) {
            maxRatio = ratio;
            candidate = id;
          }
        }

        if (candidate) {
          setActiveSection(candidate);
        }
      },
      {
        root: null,
        threshold: [0.2, 0.4, 0.6, 0.8],
        rootMargin: '-80px 0px -42% 0px'
      }
    );

    for (const id of sectionIds) {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    }

    return () => {
      window.removeEventListener('hashchange', applyHash);
      observer.disconnect();
    };
  }, []);

  async function handleRenameScene(scene: Scene) {
    const nextName = window.prompt('새 씬 이름을 입력하세요.', scene.name)?.trim();
    if (!nextName) {
      return;
    }

    const response = await fetch(`/api/scenes/${scene.id}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        action: 'rename',
        expectedVersion: scene.version,
        payload: { name: nextName }
      })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      setMessage(error.message ?? '씬 이름 변경 실패');
      return;
    }

    setMessage('씬 이름 변경 완료');
    await loadScenes();
    await loadCommandLogs(scene.id);
  }

  async function handleArchiveScene(scene: Scene) {
    const response = await fetch(`/api/scenes/${scene.id}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        action: 'archive',
        expectedVersion: scene.version
      })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      setMessage(error.message ?? '씬 아카이브 실패');
      return;
    }

    setMessage('씬 아카이브 완료');
    await loadScenes();
    await loadCommandLogs(scene.id);
  }

  async function handleRestoreScene(scene: Scene) {
    const response = await fetch(`/api/scenes/${scene.id}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        action: 'restore',
        expectedVersion: scene.version
      })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      setMessage(error.message ?? '씬 복원 실패');
      return;
    }

    setMessage('씬 복원 완료');
    await loadScenes();
    await loadCommandLogs(scene.id);
  }

  return (
    <main className={`container-xxl py-4 ${density === 'compact' ? 'density-compact' : 'density-cozy'}`}>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <div>
          <span className="badge text-bg-primary mb-2">Project Scenes</span>
          <h1 className="h3 fw-semibold mb-1">프로젝트 씬 관리 콘솔</h1>
          <p className="text-body-secondary mb-0">현재 프로젝트 ID: {projectId}</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Link href="/" className="btn btn-outline-secondary btn-sm">
            <i className="bi bi-house me-1" aria-hidden="true" />
            <span className="d-none d-sm-inline">홈</span>
          </Link>
          <div className="btn-group btn-group-sm" role="group" aria-label="density switch">
            <button
              className={`btn ${density === 'cozy' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setDensity('cozy')}
            >
              <i className="bi bi-arrows-collapse-vertical me-1" aria-hidden="true" />
              <span className="d-none d-md-inline">Cozy</span>
            </button>
            <button
              className={`btn ${density === 'compact' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setDensity('compact')}
            >
              <i className="bi bi-distribute-vertical me-1" aria-hidden="true" />
              <span className="d-none d-md-inline">Compact</span>
            </button>
          </div>
        </div>
      </div>

      <div className="section-jump" aria-label="section navigation">
        <a href="#scene-create" className={`btn btn-ghost btn-sm ${activeSection === 'scene-create' ? 'is-active' : ''}`}>씬 생성</a>
        <a href="#scene-detail" className={`btn btn-ghost btn-sm ${activeSection === 'scene-detail' ? 'is-active' : ''}`}>씬 상세</a>
        <a href="#scene-list" className={`btn btn-ghost btn-sm ${activeSection === 'scene-list' ? 'is-active' : ''}`}>씬 목록</a>
      </div>

      <section className="row g-3">
        <div id="scene-create" className="col-12 col-xl-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <h2 className="h5">씬 생성</h2>
              <form onSubmit={handleCreateScene} className="d-grid gap-3 mt-3">
                <label className="form-label mb-0">
                  <span className="small text-uppercase text-body-secondary fw-semibold">Scene Name</span>
                  <input
                    className="form-control mt-2"
                    value={sceneName}
                    onChange={(e) => setSceneName(e.target.value)}
                    placeholder="Main Hall Layout"
                    required
                  />
                </label>
                <label className="form-label mb-0">
                  <span className="small text-uppercase text-body-secondary fw-semibold">Version</span>
                  <input
                    className="form-control mt-2"
                    type="number"
                    min={1}
                    value={sceneVersion}
                    onChange={(e) => setSceneVersion(Number(e.target.value))}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  <i className="bi bi-plus-square me-1" aria-hidden="true" />
                  씬 생성
                </button>
              </form>
              <div className="alert alert-light border mt-3 mb-0 py-2" role="status">
                <span className="small text-body-secondary">{message || '대기 중'}</span>
              </div>
            </div>
          </div>
        </div>

        <div id="scene-detail" className="col-12 col-xl-8">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <h2 className="h5">씬 상세</h2>
              {selectedScene ? (
                <div className="alert alert-secondary mt-3 mb-3">
                  <p className="mb-1 fw-semibold">{selectedScene.name}</p>
                  <p className="mb-0 small text-body-secondary">
                    sceneId: {selectedScene.id}
                    <br />
                    version: {selectedScene.version}
                  </p>
                </div>
              ) : (
                <p className="text-body-secondary mt-3 mb-3">씬을 선택하면 상세 정보가 표시됩니다.</p>
              )}

              <h3 className="h6 mb-2">커맨드 이력</h3>
              {selectedScene ? (
                <div className="row g-2 mb-3">
                  <div className="col-12 col-md-6">
                    <select
                      className="form-select"
                      value={logStatusFilter}
                      onChange={(e) => setLogStatusFilter(e.target.value as 'all' | 'succeeded' | 'failed')}
                    >
                      <option value="all">상태 전체</option>
                      <option value="succeeded">성공</option>
                      <option value="failed">실패</option>
                    </select>
                  </div>
                  <div className="col-12 col-md-6">
                    <select
                      className="form-select"
                      value={logActionFilter}
                      onChange={(e) =>
                        setLogActionFilter(e.target.value as 'all' | 'rename' | 'archive' | 'restore')
                      }
                    >
                      <option value="all">액션 전체</option>
                      <option value="rename">rename</option>
                      <option value="archive">archive</option>
                      <option value="restore">restore</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {selectedScene ? (
                commandLogs.length > 0 ? (
                  <div className="d-grid gap-2">
                    {commandLogs.map((log) => (
                      <article key={log.id} className="card bg-light border-0">
                        <div className="card-body py-2">
                          {(() => {
                            const resultError = getResultError(log);
                            const resultStatusCode = getResultStatusCode(log);

                            return (
                              <>
                                <div className="d-flex justify-content-between align-items-center gap-2">
                                  <strong>{log.action}</strong>
                                  <span className={`badge ${log.status === 'failed' ? 'text-bg-danger' : 'text-bg-success'}`}>
                                    {log.status}
                                  </span>
                                </div>
                                <p className="small text-body-secondary mb-0 mt-2">
                                  commandId: {log.commandId}
                                  <br />
                                  at: {formatDateTime(log.createdAt)}
                                  <br />
                                  expectedVersion: {log.expectedVersion}
                                  {log.status === 'failed' && resultError ? (
                                    <>
                                      <br />
                                      error: {resultError}
                                      {typeof resultStatusCode === 'number' ? (
                                        <>
                                          <br />
                                          statusCode: {resultStatusCode}
                                        </>
                                      ) : null}
                                    </>
                                  ) : null}
                                </p>
                                <details className="mt-2">
                                  <summary className="small text-body-secondary" style={{ cursor: 'pointer' }}>
                                    디버그 데이터 보기
                                  </summary>
                                  <pre
                                    className="bg-white border rounded p-2 mt-2 mb-0"
                                    style={{ overflowX: 'auto', fontSize: 12, lineHeight: 1.4 }}
                                  >
                                    {JSON.stringify(
                                      {
                                        payload: log.payload ?? null,
                                        result: log.result ?? null
                                      },
                                      null,
                                      2
                                    )}
                                  </pre>
                                </details>
                              </>
                            );
                          })()}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-body-secondary mb-0">이력이 없습니다.</p>
                )
              ) : (
                <p className="text-body-secondary mb-0">씬을 선택하면 이력이 표시됩니다.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="scene-list" className="card border-0 shadow-sm mt-3">
        <div className="card-body">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h2 className="h5 mb-0">씬 목록</h2>
            <div className="btn-group btn-group-sm" role="group" aria-label="scene view switch">
              <button
                className={`btn ${sceneView === 'active' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSceneView('active')}
              >
                <i className="bi bi-check2-circle me-1" aria-hidden="true" />
                활성
              </button>
              <button
                className={`btn ${sceneView === 'archived' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSceneView('archived')}
              >
                <i className="bi bi-archive me-1" aria-hidden="true" />
                아카이브
              </button>
              <button className="btn btn-outline-secondary" onClick={() => void loadScenes()}>
                <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
                새로고침
              </button>
            </div>
          </div>

          <div className="d-grid gap-2 mt-3">
            {scenes.length === 0 ? (
              <p className="text-body-secondary mb-0">
                {sceneView === 'active'
                  ? '씬이 없습니다. 첫 씬을 생성해보세요.'
                  : '아카이브된 씬이 없습니다.'}
              </p>
            ) : (
              scenes.map((scene) => (
                <article key={scene.id} className="card bg-light border-0">
                  <div className="card-body py-2 d-flex flex-wrap justify-content-between gap-2 align-items-center">
                    <div>
                      <strong>{scene.name}</strong>
                      <p className="small text-body-secondary mb-0">version {scene.version}</p>
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      <Link href={`/scenes/${scene.id}/editor`} className="btn btn-outline-secondary btn-sm">
                        <i className="bi bi-pencil-square me-1" aria-hidden="true" />
                        <span className="d-none d-md-inline">에디터</span>
                      </Link>
                      {!scene.archivedAt ? (
                        <>
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => void handleRenameScene(scene)}>
                            <i className="bi bi-type me-1" aria-hidden="true" />
                            <span className="d-none d-md-inline">이름 변경</span>
                          </button>
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => void handleArchiveScene(scene)}>
                            <i className="bi bi-archive me-1" aria-hidden="true" />
                            <span className="d-none d-md-inline">아카이브</span>
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => void handleRestoreScene(scene)}>
                          <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true" />
                          <span className="d-none d-md-inline">복원</span>
                        </button>
                      )}
                      <button className="btn btn-primary btn-sm" onClick={() => void handleSelectScene(scene.id)}>
                        <i className="bi bi-info-circle me-1" aria-hidden="true" />
                        <span className="d-none d-md-inline">상세 조회</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
