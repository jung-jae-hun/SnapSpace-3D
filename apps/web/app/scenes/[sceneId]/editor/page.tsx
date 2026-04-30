'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

const Canvas = dynamic(
  () => import('@react-three/fiber').then((mod) => mod.Canvas),
  { ssr: false }
);
const OrbitControls = dynamic(
  () => import('@react-three/drei').then((mod) => mod.OrbitControls),
  { ssr: false }
);

type ActiveSection = 'arrange-tools' | 'layout-2d' | 'export-history';

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
  const router = useRouter();
  const sceneId = params.sceneId;

  const [catalog, setCatalog] = useState<ObjectDefinition[]>([]);
  const [placements, setPlacements] = useState<PlacedObject[]>([]);
  const [generated, setGenerated] = useState<GeneratedObject[]>([]);
  const [sceneExports, setSceneExports] = useState<SceneExport[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [status, setStatus] = useState('초기화 중...');
  const [saving, setSaving] = useState(false);
  const [sceneAvailable, setSceneAvailable] = useState(true);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<'all' | string>('all');
  const [density, setDensity] = useState<'cozy' | 'compact'>('cozy');
  const [activeSection, setActiveSection] = useState<ActiveSection>('layout-2d');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [moveStep, setMoveStep] = useState<0.1 | 0.5 | 1>(0.5);
  const [snapMode, setSnapMode] = useState<'strict' | 'soft'>('soft');
  const [smoothDrag, setSmoothDrag] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedPlacements, setLastSavedPlacements] = useState<PlacedObject[]>([]);
  const [hasSavedSnapshot, setHasSavedSnapshot] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const latestPlacementsRef = useRef<PlacedObject[]>([]);
  const sectionIds = ['arrange-tools', 'layout-2d', 'export-history'] as const;

  const activePlacement =
    activeIndex !== null && activeIndex >= 0 && activeIndex < placements.length
      ? placements[activeIndex]
      : null;

  useEffect(() => {
    if (!sceneId) {
      setSceneAvailable(false);
      setStatus('씬 ID를 확인할 수 없습니다.');
      return;
    }

    setSceneAvailable(true);
    void loadInitial();

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, [sceneId]);

  useEffect(() => {
    latestPlacementsRef.current = placements;
  }, [placements]);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (sectionIds.includes(hash as ActiveSection)) {
        setActiveSection(hash as ActiveSection);
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);

    const visibility = new Map<ActiveSection, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id as ActiveSection;
          if (!sectionIds.includes(id)) {
            continue;
          }

          if (entry.isIntersecting) {
            visibility.set(id, entry.intersectionRatio);
          } else {
            visibility.delete(id);
          }
        }

        let candidate: ActiveSection | null = null;
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

  async function readErrorMessage(response: Response) {
    try {
      const data = (await response.json()) as { message?: string };
      return data?.message;
    } catch {
      return undefined;
    }
  }

  function clonePlacements(items: PlacedObject[]) {
    return items.map((item) => ({
      ...item,
      position: { ...item.position },
      scale: { ...item.scale }
    }));
  }

  async function loadInitial() {
    setStatus('카탈로그/씬 로드 중...');

    try {
      const authRes = await fetch('/api/auth/me', { cache: 'no-store' });
      if (authRes.status === 401) {
        setSceneAvailable(false);
        setStatus('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
        router.replace('/');
        return;
      }

      const [sceneRes, catalogRes, placementsRes, generatedRes, exportsRes] = await Promise.all([
        fetch(`/api/scenes/${sceneId}`, { cache: 'no-store' }),
        fetch('/api/object-definitions', { cache: 'no-store' }),
        fetch(`/api/scenes/${sceneId}/placed-objects`, { cache: 'no-store' }),
        fetch(`/api/scenes/${sceneId}/generated-objects`, { cache: 'no-store' }),
        fetch(`/api/scenes/${sceneId}/exports`, { cache: 'no-store' })
      ]);

      if (sceneRes.status === 401) {
        setSceneAvailable(false);
        setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
        router.replace('/');
        return;
      }

      if (!sceneRes.ok) {
        const message = await readErrorMessage(sceneRes);
        setSceneAvailable(false);
        setStatus(message ?? '씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
        return;
      }

      if (catalogRes.status === 401 || placementsRes.status === 401 || generatedRes.status === 401 || exportsRes.status === 401) {
        setSceneAvailable(false);
        setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
        router.replace('/');
        return;
      }

      if (!catalogRes.ok || !placementsRes.ok || !generatedRes.ok) {
        setSceneAvailable(false);
        setStatus('로드 실패: 인증 또는 서버 상태를 확인하세요.');
        return;
      }

      setSceneAvailable(true);

      const catalogData = (await catalogRes.json()) as ObjectDefinition[];
      const placementData = (await placementsRes.json()) as PlacedObject[];
      const generatedData = (await generatedRes.json()) as GeneratedObject[];
      const exportData = exportsRes.ok ? ((await exportsRes.json()) as SceneExport[]) : [];

      const normalizedPlacements = placementData.map((item) => ({
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
      }));

      setCatalog(catalogData);
      setPlacements(normalizedPlacements);
      setGenerated(generatedData);
      setSceneExports(exportData);
      setLastSavedPlacements(clonePlacements(normalizedPlacements));
      setHasSavedSnapshot(true);
      setSaveError(null);

      setStatus('로드 완료');
    } catch {
      setSceneAvailable(false);
      setStatus('네트워크 또는 서버 오류로 로드에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  const catalogById = useMemo(
    () => new Map(catalog.map((item) => [item.id, item])),
    [catalog]
  );

  const topDownRange = useMemo(() => {
    if (placements.length === 0) {
      return 5;
    }

    const maxX = Math.max(...placements.map((item) => Math.abs(item.position.x)));
    const maxZ = Math.max(...placements.map((item) => Math.abs(item.position.z)));
    return Math.max(5, Math.ceil(Math.max(maxX, maxZ) + 1));
  }, [placements]);

  const filteredCatalog = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();
    const selectedCategory = catalogCategory;

    return catalog.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = `${item.name} ${item.code} ${item.category}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [catalog, catalogQuery, catalogCategory]);

  const catalogCategories = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalog) {
      if (item.category) {
        set.add(item.category);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  function scheduleAutosave(nextPlacements: PlacedObject[]) {
    if (!sceneAvailable || !sceneId) {
      return;
    }

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      void saveScene(nextPlacements);
    }, 1200);
  }

  async function runArrange(action: 'align-x' | 'align-z' | 'space-x' | 'snap-grid') {
    if (!sceneAvailable) {
      setStatus('씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
      return;
    }

    const actionLabel: Record<'align-x' | 'align-z' | 'space-x' | 'snap-grid', string> = {
      'align-x': 'X축 정렬',
      'align-z': 'Z축 정렬',
      'space-x': 'X축 간격 정렬',
      'snap-grid': '격자 정렬'
    };
    const label = actionLabel[action];

    setStatus(`배치 정리 요청 중: ${label}`);

    let response: Response;
    try {
      response = await fetch(`/api/scenes/${sceneId}/arrange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
    } catch {
      setStatus(`네트워크 오류로 배치 정리 요청에 실패했습니다: ${label}`);
      return;
    }

    if (response.status === 401) {
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return;
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      setStatus(message ?? `배치 정리 요청에 실패했습니다: ${label}`);
      return;
    }

    await loadInitial();
    setStatus(`배치 정리 완료: ${label}`);
  }

  async function runGenerate() {
    if (!sceneAvailable) {
      setStatus('씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
      return;
    }

    setStatus('Generate 요청 중...');

    let response: Response;
    try {
      response = await fetch(`/api/scenes/${sceneId}/generate`, {
        method: 'POST'
      });
    } catch {
      setStatus('네트워크 오류로 Generate 요청에 실패했습니다.');
      return;
    }

    if (response.status === 401) {
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return;
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      setStatus(message ?? 'Generate 요청에 실패했습니다.');
      return;
    }

    await loadInitial();
    setStatus('Generate 완료');
  }

  async function runExport() {
    if (!sceneAvailable) {
      setStatus('씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
      return;
    }

    setStatus('Export 요청 중...');

    let response: Response;
    try {
      response = await fetch(`/api/scenes/${sceneId}/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'glb' })
      });
    } catch {
      setStatus('네트워크 오류로 Export 요청에 실패했습니다.');
      return;
    }

    if (response.status === 401) {
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return;
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      setStatus(message ?? 'Export 요청에 실패했습니다.');
      return;
    }

    await loadInitial();
    setStatus('Export 완료');
  }

  function downloadExport(exportId: string) {
    const link = document.createElement('a');
    link.href = `/api/exports/${exportId}/download`;
    link.download = `scene-${exportId}.glb`;
    link.click();
  }

  async function saveScene(nextPlacements: PlacedObject[], retryCount = 0) {
    if (!sceneAvailable || !sceneId) {
      return;
    }

    setSaving(true);
    setStatus('자동저장 중...');

    let response: Response;
    try {
      response = await fetch(`/api/scenes/${sceneId}/placed-objects/bulk`, {
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
    } catch {
      setSaving(false);
      if (retryCount < 1) {
        setStatus('자동저장 재시도 중...');
        window.setTimeout(() => {
          void saveScene(nextPlacements, retryCount + 1);
        }, 500);
        return;
      }

      const errorMessage = '네트워크 오류로 자동저장에 실패했습니다.';
      setStatus(errorMessage);
      setSaveError(errorMessage);
      setSaveNotice('저장 실패');
      return;
    }

    setSaving(false);

    if (!response.ok) {
      if (response.status === 404) {
        setSceneAvailable(false);
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
        }
        const message = await readErrorMessage(response);
        const errorMessage =
          message ?? '씬이 존재하지 않아 자동저장을 중단했습니다. 씬 목록에서 다시 선택하세요.';
        setStatus(errorMessage);
        setSaveError(errorMessage);
        return;
      }

      const message = await readErrorMessage(response);
      if (retryCount < 1) {
        setStatus('자동저장 재시도 중...');
        window.setTimeout(() => {
          void saveScene(nextPlacements, retryCount + 1);
        }, 500);
        return;
      }

      const errorMessage = message ?? '자동저장 실패';
      setStatus(errorMessage);
      setSaveError(errorMessage);
      setSaveNotice('저장 실패');
      return;
    }

    setStatus('자동저장 완료');
    setSaveNotice('저장 완료');
    setSaveError(null);
    setLastSavedPlacements(clonePlacements(nextPlacements));
    setHasSavedSnapshot(true);
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
    }
    noticeTimer.current = setTimeout(() => {
      setSaveNotice(null);
    }, 1400);
  }

  function rollbackPlacements() {
    if (!hasSavedSnapshot) {
      return;
    }

    const restored = clonePlacements(lastSavedPlacements);
    latestPlacementsRef.current = restored;
    setPlacements(restored);
    setActiveIndex(null);
    setSaveError(null);
    setStatus('마지막 저장 상태로 되돌렸습니다.');
  }

  async function retrySaveNow() {
    if (!sceneAvailable) {
      return;
    }

    setStatus('저장 재시도 중...');
    await saveScene(latestPlacementsRef.current, 0);
  }

  function addFromCatalog(def: ObjectDefinition) {
    if (!sceneAvailable) {
      setStatus('씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
      return;
    }

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
    if (!sceneAvailable) {
      setStatus('씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
      return;
    }

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
    if (!sceneAvailable) {
      setStatus('씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
      return;
    }

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

  function quantize(value: number) {
    if (!snapToGrid) {
      return Number(value.toFixed(2));
    }

    const step = moveStep;
    const snapped = Number((Math.round(value / step) * step).toFixed(2));

    if (snapMode === 'strict') {
      return snapped;
    }

    const delta = Math.abs(snapped - value);
    if (delta <= step * 0.25) {
      return snapped;
    }

    return Number(value.toFixed(2));
  }

  function movePlacementByClientPoint(clientX: number, clientY: number, commit: boolean) {
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || !sceneAvailable) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const ratioX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const ratioY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const rawX = (ratioX - 0.5) * 2 * topDownRange * 0.88;
    const rawZ = (ratioY - 0.5) * 2 * topDownRange * 0.88;

    const targetX = quantize(rawX);
    const targetZ = quantize(rawZ);

    const current = latestPlacementsRef.current;
    if (dragIndex < 0 || dragIndex >= current.length) {
      return;
    }

    const active = current[dragIndex];
    const nextX =
      !commit && smoothDrag
        ? Number((active.position.x + (targetX - active.position.x) * 0.45).toFixed(2))
        : targetX;
    const nextZ =
      !commit && smoothDrag
        ? Number((active.position.z + (targetZ - active.position.z) * 0.45).toFixed(2))
        : targetZ;

    if (active.position.x === nextX && active.position.z === nextZ) {
      if (commit) {
        void saveScene(current);
      }
      return;
    }

    const next = current.map((item, i) =>
      i === dragIndex
        ? {
            ...item,
            position: {
              ...item.position,
              x: nextX,
              z: nextZ
            }
          }
        : item
    );

    latestPlacementsRef.current = next;
    setPlacements(next);
    setStatus(commit ? '배치 이동 저장' : '배치 이동 중...');

    if (commit) {
      void saveScene(next);
      scheduleAutosave(next);
    } else {
      scheduleAutosave(next);
    }
  }

  function stopDragging() {
    dragIndexRef.current = null;
    dragStartRef.current = null;
    didDragRef.current = false;
    setDragging(false);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragIndexRef.current === null) {
      return;
    }

    if (!dragStartRef.current) {
      return;
    }

    if (!didDragRef.current) {
      const dx = event.clientX - dragStartRef.current.x;
      const dy = event.clientY - dragStartRef.current.y;
      const distance = Math.hypot(dx, dy);

      // 클릭 선택과 실제 드래그 이동을 분리하기 위한 최소 이동 거리.
      if (distance < 6) {
        return;
      }

      didDragRef.current = true;
      setDragging(true);
    }

    event.preventDefault();
    movePlacementByClientPoint(event.clientX, event.clientY, false);
  }

  function handleCanvasPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragIndexRef.current === null) {
      return;
    }

    if (didDragRef.current) {
      movePlacementByClientPoint(event.clientX, event.clientY, true);
    }
    stopDragging();
  }

  function handleCanvasKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (activeIndex === null) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudge(0, -moveStep);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudge(0, moveStep);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      nudge(-moveStep, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      nudge(moveStep, 0);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeAt(activeIndex);
    }
  }

  useEffect(() => {
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (dragIndexRef.current === null) {
        return;
      }

      if (didDragRef.current) {
        movePlacementByClientPoint(event.clientX, event.clientY, true);
      }
      stopDragging();
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [sceneAvailable, snapToGrid, moveStep, topDownRange]);

  return (
    <main className={`page-shell ${density === 'compact' ? 'density-compact' : 'density-cozy'}`}>
      <header className="page-header">
        <div>
          <p className="label">Scene Workspace</p>
          <h1 className="headline" style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.4rem)' }}>
            SnapSpace 3D Layout Editor
          </h1>
          <p className="subtle" style={{ margin: '8px 0 0' }}>
            sceneId: {sceneId}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="status-pill">
            <i className="bi bi-activity" aria-hidden="true" />
            {saving ? 'saving...' : status}
          </span>
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" onClick={() => void runGenerate()}>
            <i className="bi bi-magic me-1" aria-hidden="true" />
            <span className="d-none d-md-inline">Generate</span>
          </button>
        </div>
      </header>

      <nav id="arrange-tools" className="top-nav" aria-label="Editor main navigation">
        <div className="menu-links">
          <Link href="/" className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="홈으로" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="bi bi-house" aria-hidden="true" />
            <span className="d-none d-md-inline">홈</span>
          </Link>
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="X 정렬" onClick={() => void runArrange('align-x')}>
            <i className="bi bi-distribute-horizontal" aria-hidden="true" />
            <span className="d-none d-md-inline">Align X</span>
          </button>
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="격자 정렬" onClick={() => void runArrange('snap-grid')}>
            <i className="bi bi-grid-3x3-gap" aria-hidden="true" />
            <span className="d-none d-md-inline">Arrange</span>
          </button>
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="Z 정렬" onClick={() => void runArrange('align-z')}>
            <i className="bi bi-distribute-vertical" aria-hidden="true" />
            <span className="d-none d-md-inline">Align Z</span>
          </button>
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="3D 미리보기" onClick={() => setShowPreviewModal(true)}>
            <i className="bi bi-badge-3d" aria-hidden="true" />
            <span className="d-none d-md-inline">3Dview</span>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="btn-group btn-group-sm" role="group" aria-label="move step">
            <button
              className={`btn ${moveStep === 0.1 ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setMoveStep(0.1)}
            >
              0.1
            </button>
            <button
              className={`btn ${moveStep === 0.5 ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setMoveStep(0.5)}
            >
              0.5
            </button>
            <button
              className={`btn ${moveStep === 1 ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setMoveStep(1)}
            >
              1.0
            </button>
          </div>
          <button
            className={`btn btn-sm ${snapToGrid ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSnapToGrid((prev) => !prev)}
          >
            <i className="bi bi-magnet me-1" aria-hidden="true" />
            Snap {snapToGrid ? 'ON' : 'OFF'}
          </button>
          {snapToGrid ? (
            <div className="btn-group btn-group-sm" role="group" aria-label="snap mode">
              <button
                className={`btn ${snapMode === 'strict' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSnapMode('strict')}
              >
                Strict
              </button>
              <button
                className={`btn ${snapMode === 'soft' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSnapMode('soft')}
              >
                Soft
              </button>
            </div>
          ) : null}
          <button
            className={`btn btn-sm ${smoothDrag ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSmoothDrag((prev) => !prev)}
          >
            Smooth {smoothDrag ? 'ON' : 'OFF'}
          </button>
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
          <button className="btn btn-primary btn-sm toolbar-icon-btn" onClick={() => void runExport()}>
            <i className="bi bi-download me-1" aria-hidden="true" />
            <span className="d-none d-md-inline">Export GLB</span>
          </button>
        </div>
      </nav>

      <div className="section-jump" aria-label="section navigation">
        <a href="#arrange-tools" className={`btn btn-ghost btn-sm ${activeSection === 'arrange-tools' ? 'is-active' : ''}`}>툴바</a>
        <a href="#layout-2d" className={`btn btn-ghost btn-sm ${activeSection === 'layout-2d' ? 'is-active' : ''}`}>2D 배치도</a>
        <a href="#export-history" className={`btn btn-ghost btn-sm ${activeSection === 'export-history' ? 'is-active' : ''}`}>Export 이력</a>
      </div>

      {saveError ? (
        <div className="alert alert-warning" role="alert" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{saveError}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => void retrySaveNow()}>
                <i className="bi bi-arrow-repeat me-1" aria-hidden="true" />
                저장 재시도
              </button>
              <button className="btn btn-outline-secondary btn-sm" onClick={rollbackPlacements} disabled={!hasSavedSnapshot}>
                <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true" />
                마지막 저장으로 되돌리기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="content-layout">
        <aside>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>등록 오브젝트</h2>
          <div className="sidebar-list">
            {placements.length === 0 ? (
              <p className="subtle" style={{ margin: 0, padding: '8px 0' }}>
                배치된 오브젝트가 없습니다.
              </p>
            ) : (
              placements.map((item, idx) => {
                const def = catalogById.get(item.objectDefinitionId);
                const active = idx === activeIndex;

                return (
                  <div
                    key={`${item.id ?? 'new'}-${idx}`}
                    className={`list-row ${active ? 'active' : ''}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <strong style={{ fontSize: 14 }}>{item.name || def?.name || 'Unnamed'}</strong>
                        <p className="subtle" style={{ margin: '6px 0 0' }}>
                          x: {item.position.x} / z: {item.position.z}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => setActiveIndex(idx)}>
                          <i className="bi bi-cursor-fill me-1" aria-hidden="true" />
                          선택
                        </button>
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => removeAt(idx)}>
                          <i className="bi bi-trash3 me-1" aria-hidden="true" />
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>오브젝트 추가</p>
            <input
              className="form-control form-control-sm"
              placeholder="이름/코드/카테고리 검색"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              aria-label="catalog search"
            />
            <select
              className="form-select form-select-sm"
              value={catalogCategory}
              onChange={(e) => setCatalogCategory(e.target.value)}
              aria-label="catalog category filter"
              style={{ marginTop: 8 }}
            >
              <option value="all">전체 카테고리</option>
              {catalogCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <p className="subtle" style={{ margin: '8px 0 10px' }}>
              {filteredCatalog.length} / {catalog.length} 표시 중
            </p>
            <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflow: 'auto' }}>
              {filteredCatalog.length === 0 ? (
                <p className="subtle" style={{ margin: 0, padding: '8px 0' }}>
                  검색 결과가 없습니다.
                </p>
              ) : (
                filteredCatalog.map((def) => (
                  <div key={def.id} className="list-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <strong style={{ fontSize: 14 }}>{def.name}</strong>
                        <p className="subtle" style={{ margin: '4px 0 0' }}>
                          {def.category} / {def.code}
                        </p>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={() => addFromCatalog(def)}>
                        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                        추가
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section id="layout-2d" style={{ minWidth: 0 }}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>2D 배치도</h2>
          <div
            ref={canvasRef}
            className={`scene-canvas ${dragging ? 'is-dragging' : ''}`}
            tabIndex={0}
            role="application"
            aria-label="2D 배치도 캔버스"
            onKeyDown={handleCanvasKeyDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            style={{
              width: '100%',
              height: 'min(72vh, 720px)',
              minHeight: 420,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid #d8e1e8',
              background:
                'linear-gradient(0deg, rgba(10,143,106,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(10,143,106,0.05) 1px, transparent 1px), #fbfdfb',
              backgroundSize: '20px 20px, 20px 20px, auto',
              position: 'relative'
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                width: 1,
                height: '100%',
                background: 'rgba(10, 143, 106, 0.35)'
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '50%',
                width: '100%',
                height: 1,
                background: 'rgba(10, 143, 106, 0.35)'
              }}
            />
            <span
              className="label"
              style={{ position: 'absolute', right: 8, top: 8, background: 'rgba(255,255,255,0.85)', padding: '2px 6px', borderRadius: 6 }}
            >
              범위: ±{topDownRange}
            </span>

            {placements.map((item, idx) => {
              const left = 50 + (item.position.x / topDownRange) * 44;
              const top = 50 + (item.position.z / topDownRange) * 44;
              const active = idx === activeIndex;
              const def = catalogById.get(item.objectDefinitionId);
              const label = item.name || def?.name || `Obj ${idx + 1}`;

              return (
                <div
                  key={`${item.id ?? 'new'}-dot-${idx}`}
                  style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <button
                    className={`scene-dot-btn ${active ? 'is-active' : ''}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setActiveIndex(idx);
                      dragIndexRef.current = idx;
                      dragStartRef.current = { x: event.clientX, y: event.clientY };
                      didDragRef.current = false;
                      setDragging(false);
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onClick={() => setActiveIndex(idx)}
                    style={{
                      width: active ? 14 : 10,
                      height: active ? 14 : 10,
                      borderRadius: 999,
                      border: active ? '2px solid #0a8f6a' : '1px solid #3f6a59',
                      background: active ? '#34b37d' : '#b9dfcb',
                      cursor: 'pointer'
                    }}
                    aria-label={`placed-object-${idx}`}
                  />
                  <span
                    className="label"
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: -4,
                      whiteSpace: 'nowrap',
                      background: active ? 'rgba(10,143,106,0.16)' : 'rgba(255,255,255,0.86)',
                      border: '1px solid rgba(10,143,106,0.22)',
                      borderRadius: 6,
                      padding: '1px 5px'
                    }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}

          </div>
          <p className="subtle" style={{ margin: '8px 0 0' }}>조작: 오브젝트 점을 드래그하거나, 캔버스 포커스 후 방향키로 이동 (step {moveStep})</p>
        </section>
      </section>

      <section id="export-history" className="plain-section">
        <h2 style={{ marginTop: 0 }}>export 이력</h2>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {sceneExports.length === 0 ? (
            <p className="subtle" style={{ margin: 0 }}>
              아직 export 이력이 없습니다.
            </p>
          ) : (
            sceneExports.map((item) => (
              <article key={item.id} className="list-row">
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
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => downloadExport(item.id)}
                    disabled={item.status !== 'succeeded'}
                  >
                    <i className="bi bi-download me-1" aria-hidden="true" />
                    다운로드
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {showPreviewModal ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowPreviewModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 90
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(980px, 92vw)',
              maxHeight: '86vh',
              overflow: 'auto',
              borderRadius: 14,
              background: '#ffffff',
              border: '1px solid #d8d5cb',
              padding: 14
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 style={{ margin: 0 }}>3D Preview</h3>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowPreviewModal(false)}>
                <i className="bi bi-x-lg me-1" aria-hidden="true" />
                닫기
              </button>
            </div>

            {generated.length === 0 ? (
              <p className="subtle" style={{ marginTop: 10 }}>
                생성된 3D 오브젝트가 없습니다. 상단의 Generate 버튼을 먼저 실행하세요.
              </p>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: 'min(68vh, 640px)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid #d8d5cb',
                  marginTop: 10
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
            )}
          </div>
        </div>
      ) : null}

      <div aria-live="polite" className="sr-only">{saveNotice ?? status}</div>
      {saveNotice ? (
        <div className="save-toast" role="status" aria-live="polite">
          {saveNotice}
        </div>
      ) : null}
    </main>
  );
}
