'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type UserInfo = {
  id: string;
  email: string;
  name?: string | null;
};

type Project = {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
};

type ProgressStage = {
  label: string;
  done: number;
  total: number;
  note: string;
};

export default function HomePage() {
  const [email, setEmail] = useState('owner@snapspace.io');
  const [name, setName] = useState('Snap Owner');
  const [projectName, setProjectName] = useState('Station Layout Demo');
  const [projectDescription, setProjectDescription] = useState('초기 배치 검증 프로젝트');

  const [me, setMe] = useState<UserInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const progressStages: ProgressStage[] = [
    {
      label: '기반 세팅',
      done: 6,
      total: 6,
      note: '모노레포, Docker Home 정책, 실행 스크립트까지 완료'
    },
    {
      label: 'Sprint 1',
      done: 4,
      total: 4,
      note: 'Auth/Project/Scene + OpenAPI + MinIO 업로드 기초 완료'
    },
    {
      label: 'Sprint 2',
      done: 4,
      total: 4,
      note: 'object/placement API + 카탈로그/배치 초기 UI + 자동저장/씬 로드 반영'
    },
    {
      label: 'Sprint 3',
      done: 0,
      total: 3,
      note: 'arrange 엔진/3D preview 본 구현 대기'
    },
    {
      label: 'Sprint 4',
      done: 0,
      total: 4,
      note: 'export worker/GLB 다운로드/운영 안정화 대기'
    }
  ];

  const doneTotal = progressStages.reduce((sum, stage) => sum + stage.done, 0);
  const itemTotal = progressStages.reduce((sum, stage) => sum + stage.total, 0);
  const overallPercent = Math.round((doneTotal / itemTotal) * 100);

  const loadMeAndProjects = useCallback(async () => {
    setLoading(true);
    try {
      const meResponse = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!meResponse.ok) {
        setMe(null);
        setProjects([]);
        return;
      }

      const user = (await meResponse.json()) as UserInfo;
      setMe(user);

      const projectsResponse = await fetch('/api/projects', { cache: 'no-store' });
      if (!projectsResponse.ok) {
        setProjects([]);
        return;
      }

      const items = (await projectsResponse.json()) as Project[];
      setProjects(items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeAndProjects();
  }, [loadMeAndProjects]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('로그인 중...');

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

    setMessage('로그인 성공');
    await loadMeAndProjects();
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!me) {
      setMessage('먼저 로그인하세요.');
      return;
    }

    setMessage('프로젝트 생성 중...');

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: projectName,
        description: projectDescription
      })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      setMessage(error.message ?? '프로젝트 생성 실패');
      return;
    }

    setMessage('프로젝트 생성 완료');
    setProjectName('');
    setProjectDescription('');
    await loadMeAndProjects();
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setMe(null);
    setProjects([]);
    setMessage('로그아웃되었습니다.');
  }

  return (
    <main>
      <section className="panel" style={{ padding: 22, marginBottom: 16 }}>
        <p className="label">SnapSpace 3D</p>
        <h1 className="headline" style={{ fontSize: 'clamp(2rem, 4vw, 3.4rem)' }}>
          로그인 후 내 프로젝트를 바로 관리하는
          <br />
          초경량 운영 콘솔
        </h1>
        <p className="subtle" style={{ marginTop: 12, marginBottom: 0 }}>
          JWT 토큰은 브라우저에서 직접 백엔드로 보내지지 않고, 웹 앱의 내부 API 라우트를 통해 안전하게 전달됩니다.
        </p>
      </section>

      <section className="panel" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0 }}>개발 진행 현황</h2>
          <span className="label">계획 대비 {overallPercent}%</span>
        </div>

        <div
          style={{
            marginTop: 10,
            width: '100%',
            height: 10,
            borderRadius: 999,
            background: '#e8ebe6',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${overallPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #0a8f6a 0%, #5ebf8d 100%)'
            }}
          />
        </div>

        <div className="project-list" style={{ marginTop: 12 }}>
          {progressStages.map((stage) => {
            const stagePercent = Math.round((stage.done / stage.total) * 100);
            return (
              <article key={stage.label} className="project-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong>{stage.label}</strong>
                  <span className="label">
                    {stage.done}/{stage.total} ({stagePercent}%)
                  </span>
                </div>
                <p className="subtle" style={{ margin: '6px 0 0' }}>
                  {stage.note}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid">
        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>인증</h2>
          <form onSubmit={handleLogin} style={{ display: 'grid', gap: 12 }}>
            <label>
              <span className="label">Email</span>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@snapspace.io"
                required
              />
            </label>

            <label>
              <span className="label">Display Name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Snap Owner"
                required
              />
            </label>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                로그인
              </button>
              <button className="btn btn-ghost" type="button" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          </form>

          <div className="card" style={{ marginTop: 14 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>현재 사용자</p>
            {me ? (
              <p style={{ marginBottom: 0 }}>
                {me.email}
                {me.name ? ` (${me.name})` : ''}
              </p>
            ) : (
              <p className="subtle" style={{ marginBottom: 0 }}>
                로그인되지 않음
              </p>
            )}
          </div>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>프로젝트 생성</h2>
          <form onSubmit={handleCreateProject} style={{ display: 'grid', gap: 12 }}>
            <label>
              <span className="label">Project Name</span>
              <input
                className="input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Station Layout Demo"
                required
              />
            </label>
            <label>
              <span className="label">Description</span>
              <textarea
                className="input"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="설명"
                rows={3}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={loading || !me}>
              프로젝트 추가
            </button>
          </form>

          <p className="subtle" style={{ marginTop: 14, marginBottom: 0 }}>
            {message || '대기 중'}
          </p>
        </div>
      </section>

      <section className="panel" style={{ padding: 18, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>내 프로젝트</h2>
          <button className="btn btn-ghost" onClick={() => void loadMeAndProjects()}>
            새로고침
          </button>
        </div>

        <div className="project-list" style={{ marginTop: 14 }}>
          {projects.length === 0 ? (
            <p className="subtle" style={{ margin: 0 }}>
              프로젝트가 없습니다. 로그인 후 첫 프로젝트를 생성해보세요.
            </p>
          ) : (
            projects.map((project) => (
              <article key={project.id} className="project-item">
                <strong>{project.name}</strong>
                <p className="subtle" style={{ margin: '6px 0 0' }}>
                  {project.description || '설명 없음'}
                </p>
                <div style={{ marginTop: 10 }}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="btn btn-ghost"
                    style={{ display: 'inline-block' }}
                  >
                    씬 관리로 이동
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
