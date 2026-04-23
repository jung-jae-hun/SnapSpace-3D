'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';

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
    const response = await fetch(`/api/scenes/${sceneId}/commands?limit=20`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      setCommandLogs([]);
      return;
    }

    const logs = (await response.json()) as SceneCommandLog[];
    setCommandLogs(logs);
  }

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
    <main>
      <section className="panel" style={{ padding: 22, marginBottom: 16 }}>
        <p className="label">Project Scenes</p>
        <h1 className="headline" style={{ fontSize: 'clamp(1.8rem, 3.6vw, 2.8rem)' }}>
          프로젝트 씬 관리 콘솔
        </h1>
        <p className="subtle" style={{ marginTop: 10, marginBottom: 0 }}>
          현재 프로젝트 ID: {projectId}
        </p>
        <div style={{ marginTop: 12 }}>
          <Link href="/" className="btn btn-ghost" style={{ display: 'inline-block' }}>
            프로젝트 목록으로
          </Link>
        </div>
      </section>

      <section className="grid">
        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>씬 생성</h2>
          <form onSubmit={handleCreateScene} style={{ display: 'grid', gap: 12 }}>
            <label>
              <span className="label">Scene Name</span>
              <input
                className="input"
                value={sceneName}
                onChange={(e) => setSceneName(e.target.value)}
                placeholder="Main Hall Layout"
                required
              />
            </label>
            <label>
              <span className="label">Version</span>
              <input
                className="input"
                type="number"
                min={1}
                value={sceneVersion}
                onChange={(e) => setSceneVersion(Number(e.target.value))}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              씬 생성
            </button>
          </form>
          <p className="subtle" style={{ marginTop: 14, marginBottom: 0 }}>
            {message || '대기 중'}
          </p>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>씬 상세</h2>
          {selectedScene ? (
            <div className="card">
              <p style={{ margin: 0 }}>
                <strong>{selectedScene.name}</strong>
              </p>
              <p className="subtle" style={{ marginBottom: 0 }}>
                sceneId: {selectedScene.id}
                <br />
                version: {selectedScene.version}
              </p>
            </div>
          ) : (
            <p className="subtle" style={{ margin: 0 }}>
              씬을 선택하면 상세 정보가 표시됩니다.
            </p>
          )}

          <h3 style={{ marginTop: 16, marginBottom: 10 }}>커맨드 이력</h3>
          {selectedScene ? (
            commandLogs.length > 0 ? (
              <div className="project-list">
                {commandLogs.map((log) => (
                  <article key={log.id} className="project-item">
                    <strong>{log.action}</strong>
                    <p className="subtle" style={{ margin: '6px 0 0' }}>
                      expectedVersion: {log.expectedVersion}
                      <br />
                      status: {log.status}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="subtle" style={{ margin: 0 }}>
                이력이 없습니다.
              </p>
            )
          ) : (
            <p className="subtle" style={{ margin: 0 }}>
              씬을 선택하면 이력이 표시됩니다.
            </p>
          )}
        </div>
      </section>

      <section className="panel" style={{ padding: 18, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>씬 목록</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => setSceneView('active')}
              style={{
                backgroundColor: sceneView === 'active' ? '#dff2e8' : undefined
              }}
            >
              활성
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setSceneView('archived')}
              style={{
                backgroundColor: sceneView === 'archived' ? '#ffe9d6' : undefined
              }}
            >
              아카이브
            </button>
            <button className="btn btn-ghost" onClick={() => void loadScenes()}>
              새로고침
            </button>
          </div>
        </div>
        <div className="project-list" style={{ marginTop: 14 }}>
          {scenes.length === 0 ? (
            <p className="subtle" style={{ margin: 0 }}>
              {sceneView === 'active'
                ? '씬이 없습니다. 첫 씬을 생성해보세요.'
                : '아카이브된 씬이 없습니다.'}
            </p>
          ) : (
            scenes.map((scene) => (
              <article key={scene.id} className="project-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <strong>{scene.name}</strong>
                    <p className="subtle" style={{ margin: '6px 0 0' }}>
                      version {scene.version}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!scene.archivedAt ? (
                      <>
                        <button className="btn btn-ghost" onClick={() => void handleRenameScene(scene)}>
                          이름 변경
                        </button>
                        <button className="btn btn-ghost" onClick={() => void handleArchiveScene(scene)}>
                          아카이브
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-ghost" onClick={() => void handleRestoreScene(scene)}>
                        복원
                      </button>
                    )}
                    <button className="btn btn-primary" onClick={() => void handleSelectScene(scene.id)}>
                      상세 조회
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
