'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

type ObjectDefinition = {
  id: string;
  code: string;
  name: string;
  category: string;
};

type PlacedObject = {
  id?: string;
  objectDefinitionId: string;
  name?: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  scale: { x: number; y: number; z: number };
};

type GeneratedObject = {
  id: string;
  sourcePlacedObjectId: string;
  meshType: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
};

type SceneExport = {
  id: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  format: 'glb';
  createdAt: string;
  completedAt?: string;
  retryCount: number;
  retryLimit: number;
  timeoutMs: number;
  lastError?: string;
};

export default function SceneEditorPage() {
  const params = useParams<{ sceneId: string }>();
  const sceneId = params.sceneId;

  const [catalog, setCatalog] = useState<ObjectDefinition[]>([]);
  const [placements, setPlacements] = useState<PlacedObject[]>([]);
  const [generated, setGenerated] = useState<GeneratedObject[]>([]);
  const [sceneExports, setSceneExports] = useState<SceneExport[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [status, setStatus] = useState('초기화 중...');
  const [saving, setSaving] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activePlacement =
    activeIndex !== null && activeIndex >= 0 && activeIndex < placements.length
      ? placements[activeIndex]
      : null;

  useEffect(() => {
    void loadInitial();

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [sceneId]);

  async function loadInitial() {
    setStatus('카탈로그/씬 로드 중...');

    const [catalogRes, placementsRes, generatedRes, exportsRes] = await Promise.all([
      fetch('/api/object-definitions', { cache: 'no-store' }),
      fetch(`/api/scenes/${sceneId}/placed-objects`, { cache: 'no-store' }),
      fetch(`/api/scenes/${sceneId}/generated-objects`, { cache: 'no-store' }),
      fetch(`/api/scenes/${sceneId}/exports`, { cache: 'no-store' })
    ]);

    if (!catalogRes.ok || !placementsRes.ok || !generatedRes.ok) {
      setStatus('로드 실패: 인증 또는 서버 상태를 확인하세요.');
      return;
    }

    const catalogData = (await catalogRes.json()) as ObjectDefinition[];
    const placementData = (await placementsRes.json()) as PlacedObject[];
    const generatedData = (await generatedRes.json()) as GeneratedObject[];
    const exportData = exportsRes.ok ? ((await exportsRes.json()) as SceneExport[]) : [];

    setCatalog(catalogData);
    setPlacements(
      placementData.map((item) => ({
        id: item.id,
        objectDefinitionId: item.objectDefinitionId,
        name: item.name,
        position: {
          x: Number(item.position?.x ?? 0),
          y: Number(item.position?.y ?? 0),
          z: Number(item.position?.z ?? 0)
        },
        rotationY: Number(item.rotationY ?? 0),
        scale: {
          x: Number(item.scale?.x ?? 1),
          y: Number(item.scale?.y ?? 1),
          z: Number(item.scale?.z ?? 1)
        }
      }))
    );
    setGenerated(generatedData);
    setSceneExports(exportData);

    setStatus('로드 완료');
  }

  const catalogById = useMemo(
    () => new Map(catalog.map((item) => [item.id, item])),
    [catalog]
  );

  function scheduleAutosave(nextPlacements: PlacedObject[]) {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      void saveScene(nextPlacements);
    }, 1200);
  }

  async function runArrange(action: 'align-x' | 'align-z' | 'space-x' | 'snap-grid') {
    setStatus(`arrange 실행 중: ${action}`);

    const response = await fetch(`/api/scenes/${sceneId}/arrange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      setStatus(`arrange 실패: ${action}`);
      return;
    }

    await loadInitial();
    setStatus(`arrange 완료: ${action}`);
  }

  async function runGenerate() {
    setStatus('generate 실행 중...');

    const response = await fetch(`/api/scenes/${sceneId}/generate`, {
      method: 'POST'
    });

    if (!response.ok) {
      setStatus('generate 실패');
      return;
    }

    await loadInitial();
    setStatus('generate 완료');
  }

  async function runExport() {
    setStatus('export job 생성 중...');

    const response = await fetch(`/api/scenes/${sceneId}/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'glb' })
    });

    if (!response.ok) {
      setStatus('export 생성 실패');
      return;
    }

    await loadInitial();
    setStatus('export job 생성 완료');
  }

  function downloadExport(exportId: string) {
    const link = document.createElement('a');
    link.href = `/api/exports/${exportId}/download`;
    link.download = `scene-${exportId}.glb`;
    link.click();
  }

  async function saveScene(nextPlacements: PlacedObject[]) {
    setSaving(true);
    setStatus('자동저장 중...');

    const response = await fetch(`/api/scenes/${sceneId}/placed-objects/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'replace',
        items: nextPlacements.map((item) => ({
          id: item.id,
          objectDefinitionId: item.objectDefinitionId,
          name: item.name,
          position: item.position,
          rotationY: item.rotationY,
          scale: item.scale
        }))
      })
    });

    setSaving(false);

    if (!response.ok) {
      setStatus('자동저장 실패');
      return;
    }

    setStatus('자동저장 완료');
  }

  function addFromCatalog(def: ObjectDefinition) {
    const next = [
      ...placements,
      {
        objectDefinitionId: def.id,
        name: def.name,
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        scale: { x: 1, y: 1, z: 1 }
      }
    ];
    setPlacements(next);
    setActiveIndex(next.length - 1);
    setStatus(`배치 추가: ${def.name}`);
    scheduleAutosave(next);
  }

  function removeAt(index: number) {
    const next = placements.filter((_, i) => i !== index);
    setPlacements(next);
    setActiveIndex((prev) => {
      if (prev === null) {
        return null;
      }
      if (prev === index) {
        return null;
      }
      return prev > index ? prev - 1 : prev;
    });
    setStatus('배치 삭제');
    scheduleAutosave(next);
  }

  function nudge(dx: number, dz: number) {
    if (activeIndex === null || !activePlacement) {
      return;
    }

    const next = placements.map((item, i) =>
      i === activeIndex
        ? {
            ...item,
            position: {
              ...item.position,
              x: Number((item.position.x + dx).toFixed(2)),
              z: Number((item.position.z + dz).toFixed(2))
            }
          }
        : item
    );

    setPlacements(next);
    setStatus('배치 이동');
    scheduleAutosave(next);
  }

  return (
    <main>
      <section className="panel" style={{ padding: 22, marginBottom: 16 }}>
        <p className="label">Scene Editor MVP</p>
        <h1 className="headline" style={{ fontSize: 'clamp(1.8rem, 3.6vw, 2.6rem)' }}>
          카탈로그 기반 배치 에디터 (초기)
        </h1>
        <p className="subtle" style={{ marginTop: 10, marginBottom: 0 }}>
          sceneId: {sceneId}
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-ghost" style={{ display: 'inline-block' }}>
            홈으로
          </Link>
          <span className="label">{saving ? 'saving...' : status}</span>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: '1fr 1.3fr' }}>
        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>오브젝트 카탈로그</h2>
          <div className="project-list">
            {catalog.length === 0 ? (
              <p className="subtle" style={{ margin: 0 }}>
                카탈로그가 비어있습니다.
              </p>
            ) : (
              catalog.map((def) => (
                <article key={def.id} className="project-item">
                  <strong>{def.name}</strong>
                  <p className="subtle" style={{ margin: '6px 0 8px' }}>
                    {def.category} / {def.code}
                  </p>
                  <button className="btn btn-primary" onClick={() => addFromCatalog(def)}>
                    배치 추가
                  </button>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>배치 목록 + 2D 제어(초기)</h2>
          <div className="project-list">
            {placements.length === 0 ? (
              <p className="subtle" style={{ margin: 0 }}>
                배치된 오브젝트가 없습니다.
              </p>
            ) : (
              placements.map((item, idx) => {
                const def = catalogById.get(item.objectDefinitionId);
                const active = idx === activeIndex;

                return (
                  <article
                    key={`${item.id ?? 'new'}-${idx}`}
                    className="project-item"
                    style={{
                      borderColor: active ? '#0a8f6a' : undefined,
                      boxShadow: active ? '0 0 0 2px rgba(10,143,106,0.12)' : undefined
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <strong>{item.name || def?.name || 'Unnamed'}</strong>
                        <p className="subtle" style={{ margin: '6px 0 0' }}>
                          x: {item.position.x} / z: {item.position.z}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-ghost" onClick={() => setActiveIndex(idx)}>
                          선택
                        </button>
                        <button className="btn btn-ghost" onClick={() => removeAt(idx)}>
                          삭제
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>이동 컨트롤</p>
            <p className="subtle" style={{ marginTop: 6 }}>
              선택된 오브젝트를 2D 평면에서 미세 이동합니다. 변경은 1.2초 디바운스로 자동저장됩니다.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 8, justifyContent: 'start' }}>
              <button className="btn btn-ghost" onClick={() => nudge(0, -0.5)}>
                ↑
              </button>
              <span />
              <span />
              <button className="btn btn-ghost" onClick={() => nudge(-0.5, 0)}>
                ←
              </button>
              <button className="btn btn-ghost" onClick={() => nudge(0, 0)}>
                •
              </button>
              <button className="btn btn-ghost" onClick={() => nudge(0.5, 0)}>
                →
              </button>
              <span />
              <button className="btn btn-ghost" onClick={() => nudge(0, 0.5)}>
                ↓
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>Arrange (초기)</p>
            <p className="subtle" style={{ marginTop: 6 }}>
              현재 배치 전체에 기본 정렬/스냅을 적용합니다.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => void runArrange('align-x')}>
                Align X
              </button>
              <button className="btn btn-ghost" onClick={() => void runArrange('align-z')}>
                Align Z
              </button>
              <button className="btn btn-ghost" onClick={() => void runArrange('space-x')}>
                Space X
              </button>
              <button className="btn btn-ghost" onClick={() => void runArrange('snap-grid')}>
                Snap Grid
              </button>
              <button className="btn btn-primary" onClick={() => void runGenerate()}>
                Generate
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>3D Preview (초기)</p>
            <p className="subtle" style={{ marginTop: 6 }}>
              generated 객체 기준으로 간단한 box mesh를 렌더링합니다.
            </p>
            <div
              style={{
                width: '100%',
                height: 320,
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid #d8d5cb',
                background: 'linear-gradient(180deg, #f3f8ff 0%, #f9fff8 100%)'
              }}
            >
              <Canvas camera={{ position: [8, 8, 8], fov: 50 }}>
                <color attach="background" args={['#f8fcff']} />
                <ambientLight intensity={0.6} />
                <directionalLight position={[8, 12, 6]} intensity={1} />
                <gridHelper args={[20, 20, '#b8c3cc', '#d8e1e8']} />

                {generated.map((obj) => (
                  <mesh
                    key={obj.id}
                    position={[obj.position.x, obj.position.y + obj.scale.y / 2, obj.position.z]}
                    rotation={[obj.rotation.x, obj.rotation.y, obj.rotation.z]}
                  >
                    <boxGeometry args={[obj.scale.x, obj.scale.y, obj.scale.z]} />
                    <meshStandardMaterial color="#1f8a70" metalness={0.15} roughness={0.7} />
                  </mesh>
                ))}

                <OrbitControls makeDefault />
              </Canvas>
            </div>
            <p className="subtle" style={{ margin: '8px 0 0' }}>
              generated count: {generated.length}
            </p>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>Export (GLB)</p>
            <p className="subtle" style={{ marginTop: 6 }}>
              worker 큐에 export job을 넣고 완료 시 GLB 다운로드가 가능합니다.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => void runExport()}>
                Export GLB
              </button>
              <button className="btn btn-ghost" onClick={() => void loadInitial()}>
                상태 새로고침
              </button>
            </div>

            <div className="project-list" style={{ marginTop: 10 }}>
              {sceneExports.length === 0 ? (
                <p className="subtle" style={{ margin: 0 }}>
                  아직 export 이력이 없습니다.
                </p>
              ) : (
                sceneExports.map((item) => (
                  <article key={item.id} className="project-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{item.id.slice(0, 8)}</strong>
                      <span className="label">{item.status}</span>
                    </div>
                    <p className="subtle" style={{ margin: '6px 0 0' }}>
                      retry {item.retryCount}/{item.retryLimit} · timeout {Math.round(item.timeoutMs / 1000)}s
                    </p>
                    {item.lastError ? (
                      <p className="subtle" style={{ margin: '6px 0 0', color: '#a03030' }}>
                        error: {item.lastError}
                      </p>
                    ) : null}
                    <div style={{ marginTop: 8 }}>
                      <button
                        className="btn btn-ghost"
                        onClick={() => downloadExport(item.id)}
                        disabled={item.status !== 'succeeded'}
                      >
                        다운로드
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
