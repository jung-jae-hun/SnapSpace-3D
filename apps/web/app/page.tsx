'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

type Project = { id: string; name: string };
type Scene = { id: string; name: string; archivedAt?: string | null };

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@snapspace.io');
  const [name, setName] = useState('Snap Owner');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  function toEpoch(value?: string | null) {
    if (!value) {
      return 0;
    }

    const ts = Date.parse(value);
    return Number.isNaN(ts) ? 0 : ts;
  }

  async function createWorkspaceProject(): Promise<Project> {
    const createProjectRes = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Workspace Demo',
        description: 'Auto-created workspace'
      })
    });

    if (!createProjectRes.ok) {
      throw new Error('프로젝트 자동 생성 실패');
    }

    return (await createProjectRes.json()) as Project;
  }

  async function ensureSceneForProject(projectId: string): Promise<string | null> {
    const scenesRes = await fetch(`/api/projects/${projectId}/scenes?includeArchived=0`, {
      cache: 'no-store'
    });

    if (scenesRes.status === 404) {
      return null;
    }

    if (!scenesRes.ok) {
      throw new Error('씬 목록 조회 실패');
    }

    const scenes = (await scenesRes.json()) as Array<
      Scene & { createdAt?: string; updatedAt?: string }
    >;
    const active = [...scenes]
      .filter((scene) => !scene.archivedAt)
      .sort((a, b) => {
        const aTime = toEpoch(a.updatedAt) || toEpoch(a.createdAt);
        const bTime = toEpoch(b.updatedAt) || toEpoch(b.createdAt);
        return bTime - aTime;
      })[0];

    if (active) {
      return active.id;
    }

    const createSceneRes = await fetch(`/api/projects/${projectId}/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Main Scene', version: 1 })
    });

    if (!createSceneRes.ok) {
      throw new Error('씬 자동 생성 실패');
    }

    const createdScene = (await createSceneRes.json()) as Scene;
    return createdScene.id;
  }

  async function ensureWorkspaceSceneId(): Promise<string> {
    const projectsRes = await fetch('/api/projects', { cache: 'no-store' });
    if (!projectsRes.ok) {
      throw new Error('프로젝트 목록 조회 실패');
    }

    const projects = (await projectsRes.json()) as Array<
      Project & { createdAt?: string; updatedAt?: string }
    >;

    const orderedProjects = [...projects].sort((a, b) => {
      const aTime = toEpoch(a.updatedAt) || toEpoch(a.createdAt);
      const bTime = toEpoch(b.updatedAt) || toEpoch(b.createdAt);
      return bTime - aTime;
    });

    for (const project of orderedProjects) {
      const sceneId = await ensureSceneForProject(project.id);
      if (sceneId) {
        return sceneId;
      }
    }

    const createdProject = await createWorkspaceProject();
    const createdSceneId = await ensureSceneForProject(createdProject.id);
    if (!createdSceneId) {
      throw new Error('씬 자동 생성 실패');
    }
    return createdSceneId;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('로그인 중...');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as { message?: string };
        setMessage(error.message ?? '로그인 실패');
        return;
      }

      setMessage('로그인 성공, 작업 화면으로 이동 중...');
      const sceneId = await ensureWorkspaceSceneId();
      router.push(`/scenes/${sceneId}/editor`);
    } catch {
      setMessage('로그인은 성공했지만 작업 화면 준비에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-md-10 col-lg-7 col-xl-6">
          <div className="card border-0 shadow-sm">
            <div className="card-body p-4 p-md-5">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <span className="badge text-bg-primary">SnapSpace 3D</span>
                <span className="text-body-secondary small">
                  <i className="bi bi-box-arrow-in-right me-1" aria-hidden="true" />
                  Sign In
                </span>
              </div>

              <h1 className="h3 fw-semibold mb-2">로그인</h1>
              <p className="text-body-secondary mb-4">로그인 후 바로 작업 페이지로 이동합니다.</p>

              <form onSubmit={handleLogin} className="d-grid gap-3">
                <label className="form-label mb-0">
                  <span className="small text-uppercase text-body-secondary fw-semibold">Email</span>
                  <div className="input-group mt-2 input-with-icon">
                    <span className="input-group-text">
                      <i className="bi bi-envelope" aria-hidden="true" />
                    </span>
                    <input
                      className="form-control"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="owner@snapspace.io"
                      required
                    />
                  </div>
                </label>

                <label className="form-label mb-0">
                  <span className="small text-uppercase text-body-secondary fw-semibold">Display Name</span>
                  <div className="input-group mt-2 input-with-icon">
                    <span className="input-group-text">
                      <i className="bi bi-person" aria-hidden="true" />
                    </span>
                    <input
                      className="form-control"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Snap Owner"
                      required
                    />
                  </div>
                </label>

                <button className="btn btn-primary w-100" type="submit" disabled={submitting}>
                  <i className="bi bi-door-open me-1" aria-hidden="true" />
                  {submitting ? '로그인 중...' : '로그인'}
                </button>
              </form>

              <div className="alert alert-light border mt-4 mb-0 py-2" role="status">
                <span className="small text-body-secondary">{message || '대기 중'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
