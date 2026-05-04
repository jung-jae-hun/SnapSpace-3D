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
  source?: 'manual' | 'ai';
  tags?: string[];
};

type ObjectDefinitionLifecycleEvent = {
  id: string;
  objectDefinitionId: string;
  action: 'activate' | 'deactivate' | 'new_version' | string;
  actorUserId: string;
  createdAt: string;
  details?: Record<string, unknown> | null;
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

type AiGenerationStatus = 'queued' | 'running' | 'post_processing' | 'ready' | 'failed';

type AiGeneratedAssetSummary = {
  id: string;
  glbAssetId: string;
  objAssetId?: string | null;
  previewImageAssetId?: string | null;
};

type AiGenerationJob = {
  id: string;
  status: AiGenerationStatus;
  progress: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  sourceImageAssetId: string;
  generatedAsset?: AiGeneratedAssetSummary | null;
};

type AiLogLevel = 'info' | 'warn' | 'error';

type AiLogCategory = 'poll' | 'upload' | 'promote' | 'system';

type AiLogEntry = {
  id: string;
  time: string;
  level: AiLogLevel;
  category: AiLogCategory;
  message: string;
};

type AiPollStopReason = 'completed' | 'failed' | 'timeout' | 'failure-limit' | null;
type AiErrorPolicy = {
  message: string;
  retryable: boolean;
  level: AiLogLevel;
};

const AI_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const AI_SOURCE_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const LIFECYCLE_INACTIVE_TAG = 'lifecycle:inactive';
const LIFECYCLE_VERSION_PREFIX = 'lifecycle:version:';
const LIFECYCLE_FAMILY_PREFIX = 'lifecycle:family:';
const AI_ERROR_POLICIES: Record<string, AiErrorPolicy> = {
  cancelled_by_user: {
    message: '생성 작업이 사용자에 의해 취소되었습니다.',
    retryable: true,
    level: 'warn'
  },
  provider_start_failed: {
    message: '생성 작업 시작에 실패했습니다.',
    retryable: true,
    level: 'error'
  },
  provider_poll_failed: {
    message: '생성 상태 조회 중 공급자 통신에 실패했습니다.',
    retryable: true,
    level: 'error'
  },
  provider_failed: {
    message: '공급자에서 생성 작업이 실패했습니다.',
    retryable: true,
    level: 'error'
  },
  post_processing_failed: {
    message: '생성 결과 후처리에 실패했습니다.',
    retryable: true,
    level: 'error'
  },
  quality_gate_failed: {
    message: '생성 결과 품질 검증을 통과하지 못했습니다.',
    retryable: true,
    level: 'warn'
  },
  timeout: {
    message: '생성 작업 시간이 초과되었습니다.',
    retryable: true,
    level: 'warn'
  }
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
  const [catalogSourceFilter, setCatalogSourceFilter] = useState<'all' | 'manual' | 'ai'>('all');
  const [catalogIncludeInactive, setCatalogIncludeInactive] = useState(false);
  const [catalogLatestByFamilyOnly, setCatalogLatestByFamilyOnly] = useState(true);
  const [catalogLifecycleBusyId, setCatalogLifecycleBusyId] = useState<string | null>(null);
  const [lifecycleEventsTargetId, setLifecycleEventsTargetId] = useState<string | null>(null);
  const [lifecycleEventsTargetName, setLifecycleEventsTargetName] = useState<string | null>(null);
  const [lifecycleEventsLoading, setLifecycleEventsLoading] = useState(false);
  const [lifecycleEvents, setLifecycleEvents] = useState<ObjectDefinitionLifecycleEvent[]>([]);
  const [lifecycleActionFilter, setLifecycleActionFilter] = useState<
    'all' | 'activate' | 'deactivate' | 'new_version'
  >('all');
  const [lifecycleExpandedEventIds, setLifecycleExpandedEventIds] = useState<
    Record<string, boolean>
  >({});
  const [catalogHighlightedId, setCatalogHighlightedId] = useState<string | null>(null);
  const [density, setDensity] = useState<'cozy' | 'compact'>('cozy');
  const [activeSection, setActiveSection] = useState<ActiveSection>('layout-2d');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [moveStep, setMoveStep] = useState<0.1 | 0.5 | 1>(0.5);
  const [snapMode, setSnapMode] = useState<'strict' | 'soft'>('soft');
  const [smoothDrag, setSmoothDrag] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'placed' | 'catalog'>('placed');
  const [lastSavedPlacements, setLastSavedPlacements] = useState<PlacedObject[]>([]);
  const [hasSavedSnapshot, setHasSavedSnapshot] = useState(false);
  const [aiSourceFile, setAiSourceFile] = useState<File | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCreating, setAiCreating] = useState(false);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [aiPromoting, setAiPromoting] = useState(false);
  const [aiCancelling, setAiCancelling] = useState(false);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [activeGeneration, setActiveGeneration] = useState<AiGenerationJob | null>(null);
  const [recentAiObjectId, setRecentAiObjectId] = useState<string | null>(null);
  const [aiAutoPollingEnabled, setAiAutoPollingEnabled] = useState(false);
  const [aiPollCountdownSec, setAiPollCountdownSec] = useState<number | null>(null);
  const [aiPollFailureCount, setAiPollFailureCount] = useState(0);
  const [aiPollStopReason, setAiPollStopReason] = useState<AiPollStopReason>(null);
  const [aiEventLog, setAiEventLog] = useState<AiLogEntry[]>([]);
  const [aiLogFilter, setAiLogFilter] = useState<'all' | AiLogLevel>('all');
  const [aiCategoryFilter, setAiCategoryFilter] = useState<'all' | AiLogCategory>('all');
  const [aiLogQuery, setAiLogQuery] = useState('');
  const [logRetryFeedback, setLogRetryFeedback] = useState<{
    entryId: string;
    tone: 'ok' | 'error';
    message: string;
  } | null>(null);
  const [lastGenerationFetchedAt, setLastGenerationFetchedAt] = useState<string | null>(null);
  const [generationPreviewUrl, setGenerationPreviewUrl] = useState<string | null>(null);
  const [generationPreviewLoading, setGenerationPreviewLoading] = useState(false);
  const [autoOpenPreviewOnReady, setAutoOpenPreviewOnReady] = useState(true);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catalogHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const latestPlacementsRef = useRef<PlacedObject[]>([]);
  const aiLogPanelRef = useRef<HTMLDivElement | null>(null);
  const aiPollStartedAtRef = useRef<number | null>(null);
  const aiPollFailureCountRef = useRef(0);
  const previousGenerationStatusRef = useRef<AiGenerationStatus | null>(null);
  const sectionIds = ['arrange-tools', 'layout-2d', 'export-history'] as const;

  const activePlacement =
    activeIndex !== null && activeIndex >= 0 && activeIndex < placements.length
      ? placements[activeIndex]
      : null;
  const isGenerationTerminal =
    activeGeneration?.status === 'ready' || activeGeneration?.status === 'failed';

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
      if (catalogHighlightTimer.current) {
        clearTimeout(catalogHighlightTimer.current);
      }
    };
  }, [sceneId]);

  useEffect(() => {
    if (!catalogHighlightedId) {
      return;
    }

    if (catalogHighlightTimer.current) {
      clearTimeout(catalogHighlightTimer.current);
    }

    catalogHighlightTimer.current = setTimeout(() => {
      setCatalogHighlightedId((current) =>
        current === catalogHighlightedId ? null : current
      );
      catalogHighlightTimer.current = null;
    }, 3000);

    return () => {
      if (catalogHighlightTimer.current) {
        clearTimeout(catalogHighlightTimer.current);
      }
    };
  }, [catalogHighlightedId]);

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
    const payload = await readErrorPayload(response);
    return payload.message;
  }

  async function readErrorPayload(response: Response) {
    try {
      const data = (await response.json()) as {
        message?: string;
        errorCode?: string;
      };
      return {
        message: data?.message,
        errorCode: data?.errorCode
      };
    } catch {
      return {
        message: undefined,
        errorCode: undefined
      };
    }
  }

  function resolveAiErrorPolicy(errorCode?: string | null, message?: string | null) {
    const policy = (errorCode && AI_ERROR_POLICIES[errorCode]) || {
      message: 'AI 생성 작업 처리 중 오류가 발생했습니다.',
      retryable: true,
      level: 'error' as AiLogLevel
    };

    return {
      ...policy,
      message: message?.trim() ? message : policy.message
    };
  }

  function hasTag(def: ObjectDefinition, tag: string) {
    return def.tags?.includes(tag) ?? false;
  }

  function isDefinitionInactive(def: ObjectDefinition) {
    return hasTag(def, LIFECYCLE_INACTIVE_TAG);
  }

  function getDefinitionVersion(def: ObjectDefinition) {
    const versionTag = def.tags?.find((tag) => tag.startsWith(LIFECYCLE_VERSION_PREFIX));
    if (!versionTag) {
      return null;
    }

    const version = Number(versionTag.slice(LIFECYCLE_VERSION_PREFIX.length));
    return Number.isFinite(version) && version > 0 ? Math.floor(version) : null;
  }

  function getDefinitionFamily(def: ObjectDefinition) {
    const familyTag = def.tags?.find((tag) => tag.startsWith(LIFECYCLE_FAMILY_PREFIX));
    if (!familyTag) {
      return def.code;
    }

    const family = familyTag.slice(LIFECYCLE_FAMILY_PREFIX.length).trim();
    return family || def.code;
  }

  function buildCatalogApiPath(includeInactive: boolean, source: 'all' | 'manual' | 'ai') {
    const params = new URLSearchParams();
    if (includeInactive) {
      params.set('includeInactive', 'true');
    }
    if (source !== 'all') {
      params.set('source', source);
    }

    const query = params.toString();
    return query ? `/api/object-definitions?${query}` : '/api/object-definitions';
  }

  async function fetchCatalogOnly(options?: {
    includeInactive?: boolean;
    source?: 'all' | 'manual' | 'ai';
    silent?: boolean;
  }) {
    const includeInactive = options?.includeInactive ?? catalogIncludeInactive;
    const source = options?.source ?? catalogSourceFilter;

    let response: Response;
    try {
      response = await fetch(buildCatalogApiPath(includeInactive, source), { cache: 'no-store' });
    } catch {
      if (!options?.silent) {
        setStatus('네트워크 오류로 카탈로그를 불러오지 못했습니다.');
      }
      return null;
    }

    if (response.status === 401) {
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return null;
    }

    if (!response.ok) {
      if (!options?.silent) {
        const message = await readErrorMessage(response);
        setStatus(message ?? '카탈로그를 불러오지 못했습니다.');
      }
      return null;
    }

    const catalogData = (await response.json()) as ObjectDefinition[];
    setCatalog(catalogData);
    return catalogData;
  }

  async function runCatalogLifecycleAction(
    def: ObjectDefinition,
    action: 'activate' | 'deactivate' | 'new-version'
  ) {
    if (catalogLifecycleBusyId) {
      return;
    }

    setCatalogLifecycleBusyId(def.id);
    const actionLabel: Record<'activate' | 'deactivate' | 'new-version', string> = {
      activate: '활성화',
      deactivate: '비활성화',
      'new-version': '신규 버전 생성'
    };
    setStatus(`카탈로그 ${actionLabel[action]} 처리 중...`);

    try {
      const response = await fetch(`/api/object-definitions/${def.id}/${action}`, {
        method: 'POST'
      });

      if (response.status === 401) {
        setSceneAvailable(false);
        setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
        router.replace('/');
        return;
      }

      if (!response.ok) {
        const message = await readErrorMessage(response);
        setStatus(message ?? `카탈로그 ${actionLabel[action]}에 실패했습니다.`);
        return;
      }

      if (action === 'new-version') {
        const payload = (await response.json()) as {
          created?: ObjectDefinition;
        };
        if (payload.created?.id) {
          setRecentAiObjectId(payload.created.id);

          const rollforwardResult = await rollforwardPlacementsToNewVersion(
            def.id,
            payload.created.id
          );

          await fetchCatalogOnly({ silent: true });

          if (!rollforwardResult) {
            setStatus('신규 버전 생성은 완료되었지만 씬 배치 교체는 실패했습니다.');
            return;
          }

          await loadLifecycleEvents(def.id, def.name);
          await loadInitial();
          setStatus(
            `신규 버전 생성 및 롤포워드 완료 (교체 ${rollforwardResult.replacedCount}건)`
          );
          return;
        }
      }

      await fetchCatalogOnly({ silent: true });
      await loadLifecycleEvents(def.id, def.name);
      setStatus(`카탈로그 ${actionLabel[action]} 완료`);
    } catch {
      setStatus(`네트워크 오류로 카탈로그 ${actionLabel[action]}에 실패했습니다.`);
    } finally {
      setCatalogLifecycleBusyId(null);
    }
  }

  async function rollforwardPlacementsToNewVersion(
    fromObjectDefinitionId: string,
    toObjectDefinitionId: string
  ) {
    let response: Response;
    try {
      response = await fetch(`/api/scenes/${sceneId}/placed-objects/rollforward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromObjectDefinitionId,
          toObjectDefinitionId
        })
      });
    } catch {
      setStatus('네트워크 오류로 씬 배치 롤포워드에 실패했습니다.');
      return null;
    }

    if (response.status === 401) {
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return null;
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      setStatus(message ?? '씬 배치 롤포워드에 실패했습니다.');
      return null;
    }

    return (await response.json()) as {
      replacedCount: number;
      fromObjectDefinitionId: string;
      toObjectDefinitionId: string;
    };
  }

  async function loadLifecycleEvents(definitionId: string, definitionName: string) {
    setLifecycleEventsTargetId(definitionId);
    setLifecycleEventsTargetName(definitionName);
    setLifecycleEventsLoading(true);
    setLifecycleExpandedEventIds({});

    let response: Response;
    try {
      response = await fetch(
        `/api/object-definitions/${definitionId}/lifecycle-events?limit=12`,
        { cache: 'no-store' }
      );
    } catch {
      setLifecycleEventsLoading(false);
      setStatus('네트워크 오류로 라이프사이클 이력을 불러오지 못했습니다.');
      return;
    }

    if (response.status === 401) {
      setLifecycleEventsLoading(false);
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return;
    }

    if (!response.ok) {
      setLifecycleEventsLoading(false);
      const message = await readErrorMessage(response);
      setStatus(message ?? '라이프사이클 이력을 불러오지 못했습니다.');
      return;
    }

    const data = (await response.json()) as ObjectDefinitionLifecycleEvent[];
    setLifecycleEvents(data);
    setLifecycleEventsLoading(false);
  }

  function formatLifecycleAction(action: string) {
    if (action === 'activate') {
      return '활성화';
    }
    if (action === 'deactivate') {
      return '비활성화';
    }
    if (action === 'new_version') {
      return '신규 버전 생성';
    }
    return action;
  }

  function getLifecycleActionTone(action: string) {
    if (action === 'activate') {
      return { fg: '#0a8f6a', bg: 'rgba(10, 143, 106, 0.15)' };
    }
    if (action === 'deactivate') {
      return { fg: '#8a5a00', bg: 'rgba(138, 90, 0, 0.15)' };
    }
    if (action === 'new_version') {
      return { fg: '#1f4f8f', bg: 'rgba(31, 79, 143, 0.14)' };
    }
    return { fg: '#3a4a5a', bg: 'rgba(58, 74, 90, 0.12)' };
  }

  function formatLifecycleDetailKey(key: string) {
    const labels: Record<string, string> = {
      fromObjectDefinitionId: '이전 오브젝트 ID',
      newObjectDefinitionId: '신규 오브젝트 ID',
      version: '버전',
      reason: '사유'
    };

    return labels[key] ?? key;
  }

  function isObjectDefinitionRefKey(key: string) {
    return (
      key === 'fromObjectDefinitionId' ||
      key === 'newObjectDefinitionId' ||
      key.endsWith('ObjectDefinitionId')
    );
  }

  function formatLifecycleDetailValue(key: string, value: unknown) {
    if (value === null || value === undefined) {
      return '-';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (typeof value === 'string' && isObjectDefinitionRefKey(key)) {
        const matched = catalogById.get(value);
        if (matched) {
          return `${value} (${matched.name} / ${matched.code})`;
        }
      }
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }

  function isUnresolvedLifecycleReference(key: string, value: unknown) {
    return (
      isObjectDefinitionRefKey(key) &&
      typeof value === 'string' &&
      value.trim().length > 0 &&
      !catalogById.has(value)
    );
  }

  function getLifecycleDetailEntries(details?: Record<string, unknown> | null) {
    if (!details || typeof details !== 'object') {
      return [] as Array<{
        key: string;
        value: string;
        unresolvedRef: boolean;
        objectDefinitionId?: string;
      }>;
    }

    const priority: Record<string, number> = {
      reason: 0,
      version: 1,
      fromObjectDefinitionId: 2,
      newObjectDefinitionId: 3
    };

    return Object.entries(details)
      .sort(([a], [b]) => {
        const pa = priority[a] ?? 50;
        const pb = priority[b] ?? 50;
        if (pa !== pb) {
          return pa - pb;
        }
        return a.localeCompare(b);
      })
      .map(([key, value]) => ({
        key,
        value: formatLifecycleDetailValue(key, value),
        unresolvedRef: isUnresolvedLifecycleReference(key, value),
        objectDefinitionId:
          isObjectDefinitionRefKey(key) && typeof value === 'string' && value.trim().length > 0
            ? value
            : undefined
      }))
      .slice(0, 6);
  }

  function toggleLifecycleEventJson(eventId: string) {
    setLifecycleExpandedEventIds((prev) => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  }

  function focusCatalogByObjectDefinitionId(objectDefinitionId: string) {
    const resolved = catalogById.get(objectDefinitionId);

    setSidebarTab('catalog');
    setCatalogCategory('all');
    setCatalogSourceFilter('all');
    setCatalogIncludeInactive(true);
    setCatalogLatestByFamilyOnly(false);
    setCatalogHighlightedId(objectDefinitionId);

    if (resolved) {
      setCatalogQuery(`${resolved.name} ${resolved.code}`);
      setStatus(`카탈로그에서 오브젝트를 찾았습니다: ${resolved.name} (${resolved.code})`);
    } else {
      setCatalogQuery(objectDefinitionId);
      setStatus(`카탈로그에서 오브젝트 ID를 검색합니다: ${objectDefinitionId}`);
    }

    void fetchCatalogOnly({ includeInactive: true, source: 'all', silent: true });

    window.setTimeout(() => {
      const target = document.getElementById(`catalog-item-${objectDefinitionId}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }

  function clonePlacements(items: PlacedObject[]) {
    return items.map((item) => ({
      ...item,
      position: { ...item.position },
      scale: { ...item.scale }
    }));
  }

  function formatGenerationStatus(status: AiGenerationStatus, errorCode?: string | null) {
    if (status === 'failed' && errorCode === 'cancelled_by_user') {
      return '취소됨';
    }

    const labels: Record<AiGenerationStatus, string> = {
      queued: '대기 중',
      running: '생성 중',
      post_processing: '후처리 중',
      ready: '완료',
      failed: '실패'
    };

    return labels[status];
  }

  function formatPollStopReason(reason: AiPollStopReason) {
    const labels: Record<Exclude<AiPollStopReason, null>, string> = {
      completed: '완료',
      failed: '실패',
      timeout: '시간 초과',
      'failure-limit': '실패 누적'
    };

    return reason ? labels[reason] : null;
  }

  function pushAiEvent(
    message: string,
    level: AiLogLevel = 'info',
    category: AiLogCategory = 'system'
  ) {
    const now = new Date();
    const hh = `${now.getHours()}`.padStart(2, '0');
    const mm = `${now.getMinutes()}`.padStart(2, '0');
    const ss = `${now.getSeconds()}`.padStart(2, '0');
    const time = `${hh}:${mm}:${ss}`;

    setAiEventLog((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time,
        level,
        category,
        message
      },
      ...prev
    ].slice(0, 8));
  }

  async function copyTextToClipboard(text: string, label: string) {
    try {
      if (!navigator.clipboard) {
        throw new Error('clipboard-unavailable');
      }

      await navigator.clipboard.writeText(text);
      pushAiEvent(`${label} 복사`);
      setStatus(`${label}를 복사했습니다.`);
    } catch {
      pushAiEvent('클립보드 복사 실패', 'error', 'system');
      setStatus('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
    }
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
        fetch(buildCatalogApiPath(catalogIncludeInactive, catalogSourceFilter), { cache: 'no-store' }),
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
      if (catalogSourceFilter !== 'all' && item.source !== catalogSourceFilter) {
        return false;
      }

      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = `${item.name} ${item.code} ${item.category}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [catalog, catalogQuery, catalogCategory, catalogSourceFilter]);

  const catalogFamilyStats = useMemo(() => {
    const latestByFamily = new Map<string, ObjectDefinition>();
    const familyCounts = new Map<string, number>();

    for (const item of filteredCatalog) {
      const family = getDefinitionFamily(item);
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);

      const prev = latestByFamily.get(family);
      if (!prev) {
        latestByFamily.set(family, item);
        continue;
      }

      const prevVersion = getDefinitionVersion(prev) ?? 0;
      const nextVersion = getDefinitionVersion(item) ?? 0;
      if (nextVersion > prevVersion) {
        latestByFamily.set(family, item);
      }
    }

    return {
      latestIdSet: new Set([...latestByFamily.values()].map((item) => item.id)),
      familyCount: latestByFamily.size,
      familyCounts
    };
  }, [filteredCatalog]);

  const displayedCatalog = useMemo(() => {
    if (!catalogLatestByFamilyOnly) {
      return filteredCatalog;
    }

    return filteredCatalog.filter((item) => catalogFamilyStats.latestIdSet.has(item.id));
  }, [catalogLatestByFamilyOnly, filteredCatalog, catalogFamilyStats.latestIdSet]);

  const catalogCategories = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalog) {
      if (item.category) {
        set.add(item.category);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const filteredAiEventLog = useMemo(() => {
    const query = aiLogQuery.trim().toLowerCase();

    return aiEventLog.filter((entry) => {
      const levelOk = aiLogFilter === 'all' || entry.level === aiLogFilter;
      const categoryOk = aiCategoryFilter === 'all' || entry.category === aiCategoryFilter;
      const searchTarget = `${entry.time} ${entry.category} ${entry.level} ${entry.message}`.toLowerCase();
      const queryOk = !query || searchTarget.includes(query);
      return levelOk && categoryOk && queryOk;
    });
  }, [aiEventLog, aiLogFilter, aiCategoryFilter, aiLogQuery]);

  const latestAiError = useMemo(
    () => aiEventLog.find((entry) => entry.level === 'error') ?? null,
    [aiEventLog]
  );

  const filteredLifecycleEvents = useMemo(() => {
    if (lifecycleActionFilter === 'all') {
      return lifecycleEvents;
    }

    return lifecycleEvents.filter((event) => event.action === lifecycleActionFilter);
  }, [lifecycleEvents, lifecycleActionFilter]);

  function focusLatestErrorLog() {
    setSidebarTab('catalog');
    setAiLogFilter('error');
    setAiCategoryFilter('all');

    window.setTimeout(() => {
      aiLogPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  }

  const exportStatusLabel: Record<SceneExport['status'], string> = {
    queued: '대기 중',
    processing: '처리 중',
    succeeded: '완료',
    failed: '실패'
  };

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

    setStatus('3D 생성 요청 중...');

    let response: Response;
    try {
      response = await fetch(`/api/scenes/${sceneId}/generate`, {
        method: 'POST'
      });
    } catch {
      setStatus('네트워크 오류로 3D 생성 요청에 실패했습니다.');
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
      setStatus(message ?? '3D 생성 요청에 실패했습니다.');
      return;
    }

    await loadInitial();
    setStatus('3D 생성 완료');
  }

  function sanitizeFilename(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function toAssetObjectKey(file: File) {
    const safeName = sanitizeFilename(file.name || 'source-image.png') || 'source-image.png';
    const timestamp = Date.now();
    return `images/ai-source/${sceneId}/${timestamp}-${safeName}`;
  }

  async function runImageTo3DGeneration() {
    if (!sceneAvailable) {
      setStatus('씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
      return;
    }

    if (!aiSourceFile) {
      setStatus('먼저 이미지를 선택해 주세요.');
      return;
    }

    if (!AI_SOURCE_ALLOWED_TYPES.has(aiSourceFile.type)) {
      setStatus('지원하지 않는 이미지 형식입니다. PNG/JPG/WebP 파일만 업로드할 수 있습니다.');
      return;
    }

    if (aiSourceFile.size > AI_SOURCE_MAX_BYTES) {
      setStatus('이미지 용량이 너무 큽니다. 10MB 이하 파일만 업로드할 수 있습니다.');
      return;
    }

    setAiCreating(true);
    setStatus('이미지 업로드 준비 중...');

    const objectKey = toAssetObjectKey(aiSourceFile);

    let uploadTicketRes: Response;
    try {
      uploadTicketRes = await fetch('/api/assets/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectKey,
          contentType: aiSourceFile.type || 'application/octet-stream',
          contentLength: aiSourceFile.size
        })
      });
    } catch {
      setAiCreating(false);
      setStatus('네트워크 오류로 업로드 URL 생성에 실패했습니다.');
      return;
    }

    if (!uploadTicketRes.ok) {
      setAiCreating(false);
      const message = await readErrorMessage(uploadTicketRes);
      setStatus(message ?? '업로드 URL 생성에 실패했습니다.');
      return;
    }

    const uploadTicket = (await uploadTicketRes.json()) as {
      uploadUrl: string;
    };

    setStatus('원본 이미지 업로드 중...');

    let uploadRes: Response;
    try {
      uploadRes = await fetch(uploadTicket.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': aiSourceFile.type || 'application/octet-stream'
        },
        body: aiSourceFile
      });
    } catch {
      setAiCreating(false);
      setStatus('네트워크 오류로 원본 이미지 업로드에 실패했습니다.');
      return;
    }

    if (!uploadRes.ok) {
      setAiCreating(false);
      setStatus('원본 이미지 업로드에 실패했습니다.');
      return;
    }

    setStatus('AI 3D 생성 요청 중...');

    let generationRes: Response;
    try {
      generationRes = await fetch('/api/ai/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId,
          sourceImageAssetId: objectKey,
          prompt: aiPrompt.trim() || undefined,
          quality: 'standard'
        })
      });
    } catch {
      setAiCreating(false);
      setStatus('네트워크 오류로 AI 생성 요청에 실패했습니다.');
      return;
    }

    if (generationRes.status === 401) {
      setAiCreating(false);
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return;
    }

    if (!generationRes.ok) {
      setAiCreating(false);
      const payload = await readErrorPayload(generationRes);
      const policy = resolveAiErrorPolicy(payload.errorCode, payload.message);
      pushAiEvent(
        `생성 요청 실패${payload.errorCode ? ` (${payload.errorCode})` : ''}`,
        policy.level,
        'upload'
      );
      setStatus(
        policy.retryable
          ? `${policy.message} 잠시 후 다시 시도해 주세요.`
          : policy.message
      );
      return;
    }

    const createdJob = (await generationRes.json()) as AiGenerationJob;
    setActiveGenerationId(createdJob.id);
    setActiveGeneration(createdJob);
    aiPollStartedAtRef.current = Date.now();
    aiPollFailureCountRef.current = 0;
    setAiPollFailureCount(0);
    setAiPollCountdownSec(null);
    setAiPollStopReason(null);
    setGenerationPreviewUrl(null);
    setAiAutoPollingEnabled(true);
    setAiCreating(false);
    pushAiEvent(`생성 작업 접수 (${createdJob.id.slice(0, 8)})`, 'info', 'upload');
    setStatus('AI 생성 요청이 접수되었습니다. 자동으로 상태를 확인합니다.');
  }

  function updateGenerationStatusMessage(job: AiGenerationJob) {
    if (job.status === 'ready') {
      setAiAutoPollingEnabled(false);
      setAiPollCountdownSec(null);
      setAiPollStopReason('completed');
      pushAiEvent('생성 상태 완료', 'info', 'poll');
      setStatus('AI 생성이 완료되었습니다. 오브젝트 등록 버튼을 눌러 카탈로그에 추가하세요.');
      return;
    }

    if (job.status === 'failed') {
      setAiAutoPollingEnabled(false);
      setAiPollCountdownSec(null);
      setAiPollStopReason('failed');
      const policy = resolveAiErrorPolicy(job.errorCode, job.errorMessage);
      pushAiEvent(
        `생성 상태 실패${job.errorCode ? ` (${job.errorCode})` : ''}`,
        policy.level,
        'poll'
      );
      setStatus(
        policy.retryable
          ? `${policy.message} 생성 상태 조회 또는 재시도를 시도해 주세요.`
          : policy.message
      );
      return;
    }
    setStatus(`AI 생성 진행 중: ${job.status} (${job.progress}%)`);
  }

  async function fetchGenerationStatus(options?: { silent?: boolean }) {
    if (!activeGenerationId) {
      if (!options?.silent) {
        setStatus('조회할 생성 작업이 없습니다. 먼저 생성을 요청해 주세요.');
      }
      return null;
    }

    if (!options?.silent) {
      setAiRefreshing(true);
      setStatus('생성 상태 조회 중...');
    }

    let response: Response;
    try {
      response = await fetch(`/api/ai/generations/${activeGenerationId}`, {
        cache: 'no-store'
      });
    } catch {
      if (!options?.silent) {
        pushAiEvent('상태 조회 실패 (network)', 'error', 'poll');
      }
      if (!options?.silent) {
        setAiRefreshing(false);
        setStatus('네트워크 오류로 생성 상태 조회에 실패했습니다.');
      }
      return null;
    }

    if (response.status === 401) {
      if (!options?.silent) {
        pushAiEvent('상태 조회 실패 (401 unauthorized)', 'error', 'poll');
      }
      if (!options?.silent) {
        setAiRefreshing(false);
      }
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return null;
    }

    if (!response.ok) {
      if (!options?.silent) {
        pushAiEvent(`상태 조회 실패 (${response.status})`, 'error', 'poll');
        setAiRefreshing(false);
        const payload = await readErrorPayload(response);
        const policy = resolveAiErrorPolicy(payload.errorCode, payload.message);
        setStatus(
          policy.retryable
            ? `${policy.message} 잠시 후 다시 조회해 주세요.`
            : policy.message
        );
      }
      return null;
    }

    const job = (await response.json()) as AiGenerationJob;
    setActiveGeneration(job);
    setLastGenerationFetchedAt(new Date().toLocaleTimeString('ko-KR'));

    if (!options?.silent) {
      setAiRefreshing(false);
      updateGenerationStatusMessage(job);
    }

    return job;
  }

  async function refreshGenerationStatus() {
    await fetchGenerationStatus();
    pushAiEvent('수동 상태 조회', 'info', 'poll');
  }

  async function retryStatusFromLog(entryId: string) {
    const job = await fetchGenerationStatus();

    if (job) {
      setLogRetryFeedback({
        entryId,
        tone: 'ok',
        message: `재조회 성공 · ${formatGenerationStatus(job.status, job.errorCode)} (${job.progress}%)`
      });
      pushAiEvent('로그 액션: 상태 재조회 성공', 'info', 'poll');
      return;
    }

    setLogRetryFeedback({
      entryId,
      tone: 'error',
      message: '재조회 실패 · 상태 메시지를 확인해 주세요.'
    });
    pushAiEvent('로그 액션: 상태 재조회 실패', 'error', 'poll');
  }

  function restartAutoPolling() {
    if (!activeGenerationId) {
      setStatus('다시 시작할 생성 작업이 없습니다. 먼저 생성을 요청해 주세요.');
      return;
    }

    if (activeGeneration?.status === 'ready' || activeGeneration?.status === 'failed') {
      setStatus('이미 완료된 작업입니다. 새 이미지를 업로드해 다시 생성해 주세요.');
      return;
    }

    aiPollStartedAtRef.current = Date.now();
    aiPollFailureCountRef.current = 0;
    setAiPollFailureCount(0);
    setAiPollCountdownSec(null);
    setAiPollStopReason(null);
    setAiAutoPollingEnabled(true);
    pushAiEvent('자동 확인 다시 시작', 'info', 'poll');
    setStatus('자동 상태 확인을 다시 시작했습니다.');
  }

  async function cancelActiveGeneration() {
    if (!activeGenerationId) {
      setStatus('취소할 생성 작업이 없습니다.');
      return;
    }

    setAiCancelling(true);
    setStatus('AI 생성 작업 취소 중...');

    let response: Response;
    try {
      response = await fetch(`/api/ai/generations/${activeGenerationId}/cancel`, {
        method: 'POST'
      });
    } catch {
      setAiCancelling(false);
      setStatus('네트워크 오류로 생성 작업 취소에 실패했습니다.');
      return;
    }

    if (response.status === 401) {
      setAiCancelling(false);
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return;
    }

    if (!response.ok) {
      setAiCancelling(false);
      const payload = await readErrorPayload(response);
      const policy = resolveAiErrorPolicy(payload.errorCode, payload.message);
      pushAiEvent(
        `생성 취소 실패${payload.errorCode ? ` (${payload.errorCode})` : ''}`,
        policy.level,
        'poll'
      );
      setStatus(
        policy.retryable
          ? `${policy.message} 잠시 후 다시 시도해 주세요.`
          : policy.message
      );
      return;
    }

    const canceledJob = (await response.json()) as AiGenerationJob;
    setActiveGeneration(canceledJob);
    setAiCancelling(false);
    setAiAutoPollingEnabled(false);
    setAiPollCountdownSec(null);
    setAiPollStopReason('failed');
    pushAiEvent('생성 작업 수동 취소', 'warn', 'poll');
    setStatus('AI 생성 작업을 취소했습니다.');
  }

  async function promoteGenerationToCatalog() {
    if (!activeGenerationId) {
      setStatus('등록할 생성 결과가 없습니다.');
      return;
    }

    setAiPromoting(true);
    setStatus('생성 결과를 카탈로그에 등록 중...');

    let response: Response;
    try {
      response = await fetch(`/api/ai/generations/${activeGenerationId}/promote`, {
        method: 'POST'
      });
    } catch {
      setAiPromoting(false);
      setStatus('네트워크 오류로 카탈로그 등록에 실패했습니다.');
      return;
    }

    if (response.status === 401) {
      setAiPromoting(false);
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return;
    }

    if (!response.ok) {
      setAiPromoting(false);
      const payload = await readErrorPayload(response);
      const policy = resolveAiErrorPolicy(payload.errorCode, payload.message);
      pushAiEvent(
        `카탈로그 등록 실패${payload.errorCode ? ` (${payload.errorCode})` : ''}`,
        policy.level,
        'promote'
      );
      setStatus(
        policy.retryable
          ? `${policy.message} 상태 확인 후 다시 시도해 주세요.`
          : policy.message
      );
      return;
    }

    const created = (await response.json()) as ObjectDefinition;
    setCatalog((prev) => {
      if (prev.some((item) => item.id === created.id)) {
        return prev;
      }
      return [created, ...prev];
    });
    setRecentAiObjectId(created.id);
    setAiPromoting(false);
    pushAiEvent(`카탈로그 등록 (${created.name})`, 'info', 'promote');
    setStatus(`카탈로그 등록 완료: ${created.name}`);
  }

  async function promoteAndPlaceGeneration() {
    if (!sceneAvailable) {
      setStatus('씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
      return;
    }

    if (!activeGenerationId) {
      setStatus('등록할 생성 결과가 없습니다.');
      return;
    }

    setAiPromoting(true);
    setStatus('생성 결과를 등록하고 배치 중...');

    let response: Response;
    try {
      response = await fetch(`/api/ai/generations/${activeGenerationId}/promote`, {
        method: 'POST'
      });
    } catch {
      setAiPromoting(false);
      setStatus('네트워크 오류로 등록/배치에 실패했습니다.');
      return;
    }

    if (response.status === 401) {
      setAiPromoting(false);
      setSceneAvailable(false);
      setStatus('세션이 만료되었습니다. 다시 로그인해 주세요.');
      router.replace('/');
      return;
    }

    if (!response.ok) {
      setAiPromoting(false);
      const payload = await readErrorPayload(response);
      const policy = resolveAiErrorPolicy(payload.errorCode, payload.message);
      pushAiEvent(
        `등록 후 배치 실패${payload.errorCode ? ` (${payload.errorCode})` : ''}`,
        policy.level,
        'promote'
      );
      setStatus(
        policy.retryable
          ? `${policy.message} 상태 확인 후 다시 시도해 주세요.`
          : policy.message
      );
      return;
    }

    const created = (await response.json()) as ObjectDefinition;
    setCatalog((prev) => {
      if (prev.some((item) => item.id === created.id)) {
        return prev;
      }
      return [created, ...prev];
    });
    setRecentAiObjectId(created.id);
    setAiPromoting(false);
    addFromCatalog(created);
    setSidebarTab('placed');
    pushAiEvent(`등록 후 배치 (${created.name})`, 'info', 'promote');
    setStatus(`등록 후 배치 완료: ${created.name}`);
  }

  useEffect(() => {
    if (!activeGenerationId || !activeGeneration || !sceneAvailable || !aiAutoPollingEnabled) {
      return;
    }

    if (activeGeneration.status === 'ready' || activeGeneration.status === 'failed') {
      return;
    }

    const startedAt = aiPollStartedAtRef.current;
    if (startedAt && Date.now() - startedAt > 1000 * 60 * 3) {
      setAiAutoPollingEnabled(false);
      setAiPollCountdownSec(null);
      setAiPollStopReason('timeout');
      pushAiEvent('자동 확인 시간 초과로 중단', 'warn', 'poll');
      setStatus('AI 생성 상태 자동 확인 시간이 초과되었습니다. 생성 상태 조회 버튼으로 다시 확인해 주세요.');
      return;
    }

    const failureCount = aiPollFailureCountRef.current;
    const delayMs = Math.min(2500 * Math.max(1, 2 ** failureCount), 15000);
    const delaySec = Math.max(1, Math.ceil(delayMs / 1000));
    setAiPollCountdownSec(delaySec);

    const countdown = window.setInterval(() => {
      setAiPollCountdownSec((prev) => {
        if (prev === null) {
          return null;
        }
        return prev <= 1 ? 0 : prev - 1;
      });
    }, 1000);

    const timer = window.setTimeout(() => {
      void fetchGenerationStatus({ silent: true }).then((job) => {
        if (job) {
          aiPollFailureCountRef.current = 0;
          setAiPollFailureCount(0);
          updateGenerationStatusMessage(job);
        } else {
          aiPollFailureCountRef.current += 1;
          setAiPollFailureCount(aiPollFailureCountRef.current);

          if (aiPollFailureCountRef.current >= 5) {
            setAiAutoPollingEnabled(false);
            setAiPollCountdownSec(null);
            setAiPollStopReason('failure-limit');
            pushAiEvent('자동 확인 실패 누적으로 중단', 'error', 'poll');
            setStatus('자동 상태 확인이 여러 번 실패했습니다. 생성 상태 조회 버튼으로 다시 시도해 주세요.');
          }
        }
      });
    }, delayMs);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(timer);
    };
  }, [activeGenerationId, activeGeneration, sceneAvailable, aiAutoPollingEnabled]);

  useEffect(() => {
    const previewAssetId = activeGeneration?.generatedAsset?.previewImageAssetId;
    if (!previewAssetId) {
      setGenerationPreviewUrl(null);
      setGenerationPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setGenerationPreviewLoading(true);

    void (async () => {
      try {
        const response = await fetch(
          `/api/assets/download-url?objectKey=${encodeURIComponent(previewAssetId)}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          throw new Error('preview-url-failed');
        }

        const payload = (await response.json()) as { downloadUrl?: string };
        if (cancelled) {
          return;
        }

        setGenerationPreviewUrl(payload.downloadUrl ?? null);
      } catch {
        if (!cancelled) {
          setGenerationPreviewUrl(null);
        }
      } finally {
        if (!cancelled) {
          setGenerationPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeGeneration?.generatedAsset?.previewImageAssetId]);

  useEffect(() => {
    const prev = previousGenerationStatusRef.current;
    const next = activeGeneration?.status ?? null;

    if (prev !== 'ready' && next === 'ready' && autoOpenPreviewOnReady) {
      if (generated.length > 0) {
        setShowPreviewModal(true);
        pushAiEvent('생성 완료로 3D 미리보기 자동 열기', 'info', 'system');
      } else {
        pushAiEvent('생성 완료: 미리보기 데이터 없음', 'warn', 'system');
      }
    }

    previousGenerationStatusRef.current = next;
  }, [activeGeneration?.status, autoOpenPreviewOnReady, generated.length]);

  async function runExport() {
    if (!sceneAvailable) {
      setStatus('씬을 찾을 수 없습니다. 씬 목록에서 다시 선택하세요.');
      return;
    }

    setStatus('GLB 내보내기 요청 중...');

    let response: Response;
    try {
      response = await fetch(`/api/scenes/${sceneId}/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'glb' })
      });
    } catch {
      setStatus('네트워크 오류로 GLB 내보내기 요청에 실패했습니다.');
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
      setStatus(message ?? 'GLB 내보내기 요청에 실패했습니다.');
      return;
    }

    await loadInitial();
    setStatus('GLB 내보내기 완료');
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
          <p className="label">씬 작업공간</p>
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
            {saving ? '저장 중...' : status}
          </span>
          {latestAiError ? (
            <span
              className="label"
              title={latestAiError.message}
              style={{ background: 'rgba(184, 37, 37, 0.16)', color: '#8c2020', cursor: 'pointer' }}
              onClick={focusLatestErrorLog}
            >
              <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" style={{ marginRight: 4 }} />
              최근 오류 [{latestAiError.level.toUpperCase()}/{latestAiError.category.toUpperCase()}]: {latestAiError.time} {latestAiError.message}
            </span>
          ) : null}
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" onClick={() => void runGenerate()}>
            <span className="d-none d-md-inline">3D 생성</span>
          </button>
        </div>
      </header>

      <nav id="arrange-tools" className="top-nav" aria-label="편집기 주 메뉴">
        <div className="menu-links">
          <Link href="/" className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="홈으로" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="d-none d-md-inline">홈</span>
          </Link>
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="X 정렬" onClick={() => void runArrange('align-x')}>
            <span className="d-none d-md-inline">X축 정렬</span>
          </button>
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="격자 정렬" onClick={() => void runArrange('snap-grid')}>
            <span className="d-none d-md-inline">격자 정렬</span>
          </button>
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="Z 정렬" onClick={() => void runArrange('align-z')}>
            <span className="d-none d-md-inline">Z축 정렬</span>
          </button>
          <button className="btn btn-outline-secondary btn-sm toolbar-icon-btn" title="3D 미리보기" onClick={() => setShowPreviewModal(true)}>
            <span className="d-none d-md-inline">3D 보기</span>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="btn-group btn-group-sm" role="group" aria-label="이동 간격">
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
            스냅 {snapToGrid ? '켜짐' : '꺼짐'}
          </button>
          {snapToGrid ? (
            <div className="btn-group btn-group-sm" role="group" aria-label="스냅 모드">
              <button
                className={`btn ${snapMode === 'strict' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSnapMode('strict')}
              >
                엄격
              </button>
              <button
                className={`btn ${snapMode === 'soft' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSnapMode('soft')}
              >
                부드럽게
              </button>
            </div>
          ) : null}
          <button
            className={`btn btn-sm ${smoothDrag ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSmoothDrag((prev) => !prev)}
          >
            부드러운 이동 {smoothDrag ? '켜짐' : '꺼짐'}
          </button>
          <div className="btn-group btn-group-sm" role="group" aria-label="밀도 전환">
            <button
              className={`btn ${density === 'cozy' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setDensity('cozy')}
            >
              <span className="d-none d-md-inline">넓게</span>
            </button>
            <button
              className={`btn ${density === 'compact' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setDensity('compact')}
            >
              <span className="d-none d-md-inline">촘촘히</span>
            </button>
          </div>
          <button className="btn btn-primary btn-sm toolbar-icon-btn" onClick={() => void runExport()}>
            <span className="d-none d-md-inline">GLB 내보내기</span>
          </button>
        </div>
      </nav>

      <div className="section-jump" aria-label="섹션 이동">
        <a href="#arrange-tools" className={`btn btn-ghost btn-sm ${activeSection === 'arrange-tools' ? 'is-active' : ''}`}>툴바</a>
        <a href="#layout-2d" className={`btn btn-ghost btn-sm ${activeSection === 'layout-2d' ? 'is-active' : ''}`}>2D 배치도</a>
        <a href="#export-history" className={`btn btn-ghost btn-sm ${activeSection === 'export-history' ? 'is-active' : ''}`}>내보내기 이력</a>
      </div>

      {saveError ? (
        <div className="alert alert-warning" role="alert" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{saveError}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => void retrySaveNow()}>
                저장 재시도
              </button>
              <button className="btn btn-outline-secondary btn-sm" onClick={rollbackPlacements} disabled={!hasSavedSnapshot}>
                마지막 저장으로 되돌리기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="content-layout">
        <aside>
          <div className="btn-group btn-group-sm" role="tablist" aria-label="오브젝트 패널 탭" style={{ marginBottom: 10 }}>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'placed'}
              className={`btn ${sidebarTab === 'placed' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setSidebarTab('placed')}
            >
              등록 오브젝트
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'catalog'}
              className={`btn ${sidebarTab === 'catalog' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setSidebarTab('catalog')}
            >
              오브젝트 추가
            </button>
          </div>

          {sidebarTab === 'placed' ? (
            <>
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
                            <strong style={{ fontSize: 14 }}>{item.name || def?.name || '이름 없음'}</strong>
                            <p className="subtle" style={{ margin: '6px 0 0' }}>
                              x: {item.position.x} / z: {item.position.z}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button className="btn btn-outline-secondary btn-sm" onClick={() => setActiveIndex(idx)}>
                              선택
                            </button>
                            <button className="btn btn-outline-secondary btn-sm" onClick={() => removeAt(idx)}>
                              삭제
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <>
              <div className="list-row" style={{ marginBottom: 10 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>이미지로 AI 오브젝트 생성</strong>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="form-control form-control-sm"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setAiSourceFile(file);
                    }}
                  />
                  <input
                    className="form-control form-control-sm"
                    placeholder="선택: 프롬프트 (예: wooden stool, clean silhouette)"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    maxLength={300}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => void runImageTo3DGeneration()} disabled={aiCreating || !aiSourceFile}>
                      {aiCreating ? '요청 중...' : '이미지 업로드 + 3D 생성'}
                    </button>
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => void refreshGenerationStatus()} disabled={aiRefreshing || !activeGenerationId}>
                      {aiRefreshing ? '조회 중...' : '생성 상태 조회'}
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => void cancelActiveGeneration()}
                      disabled={
                        aiCancelling ||
                        !activeGenerationId ||
                        !activeGeneration ||
                        activeGeneration.status === 'ready' ||
                        activeGeneration.status === 'failed'
                      }
                    >
                      {aiCancelling ? '취소 중...' : '생성 취소'}
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => void promoteGenerationToCatalog()}
                      disabled={
                        aiPromoting ||
                        !activeGenerationId ||
                        !activeGeneration ||
                        activeGeneration.status !== 'ready'
                      }
                    >
                      {aiPromoting ? '등록 중...' : '생성 결과 등록'}
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => void promoteAndPlaceGeneration()}
                      disabled={
                        aiPromoting ||
                        !activeGenerationId ||
                        !activeGeneration ||
                        activeGeneration.status !== 'ready'
                      }
                    >
                      {aiPromoting ? '배치 중...' : '등록 후 바로 배치'}
                    </button>
                    <button
                      className={`btn btn-sm ${autoOpenPreviewOnReady ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setAutoOpenPreviewOnReady((prev) => !prev)}
                      type="button"
                    >
                      완료 시 미리보기 자동 열기 {autoOpenPreviewOnReady ? '켜짐' : '꺼짐'}
                    </button>
                  </div>

                  {aiAutoPollingEnabled ? (
                    <div className="alert alert-info" role="status" style={{ margin: 0, padding: '6px 10px' }}>
                      자동 확인 중
                      {aiPollCountdownSec !== null ? ` · 다음 조회 ${aiPollCountdownSec}초 후` : ''}
                      {aiPollFailureCount > 0 ? ` · 실패 ${aiPollFailureCount}회` : ''}
                    </div>
                  ) : activeGenerationId && !isGenerationTerminal ? (
                    <div className="alert alert-secondary" role="status" style={{ margin: 0, padding: '6px 10px' }}>
                      자동 확인이 중단되었습니다.
                      {aiPollStopReason ? (
                        <span className="label" style={{ marginLeft: 8 }}>
                          사유: {formatPollStopReason(aiPollStopReason)}
                        </span>
                      ) : null}
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        style={{ marginLeft: 8 }}
                        onClick={restartAutoPolling}
                        disabled={aiRefreshing}
                      >
                        자동 확인 다시 시작
                      </button>
                    </div>
                  ) : activeGenerationId && activeGeneration?.status === 'ready' ? (
                    <div className="alert alert-success" role="status" style={{ margin: 0, padding: '6px 10px' }}>
                      자동 확인 완료 · 생성이 정상적으로 끝났습니다.
                    </div>
                  ) : null}

                  {activeGeneration ? (
                    <div className="list-row" style={{ borderColor: '#d6e9ff', background: '#f5faff' }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <strong style={{ fontSize: 14 }}>생성 결과</strong>
                        <p className="subtle" style={{ margin: 0 }}>
                          작업 {activeGeneration.id.slice(0, 8)} · 상태 {formatGenerationStatus(activeGeneration.status, activeGeneration.errorCode)} · 진행 {activeGeneration.progress}%
                        </p>
                        {lastGenerationFetchedAt ? (
                          <p className="subtle" style={{ margin: 0 }}>
                            마지막 조회: {lastGenerationFetchedAt}
                          </p>
                        ) : null}
                        {activeGeneration.errorMessage ? (
                            <p className="subtle" style={{ margin: 0, color: activeGeneration.errorCode === 'cancelled_by_user' ? '#8a5a00' : '#a03030' }}>
                            오류: {activeGeneration.errorMessage}
                          </p>
                        ) : null}
                        {activeGeneration.generatedAsset ? (
                          <>
                            {activeGeneration.generatedAsset.previewImageAssetId ? (
                              <div style={{ display: 'grid', gap: 6 }}>
                                <p className="subtle" style={{ margin: 0 }}>
                                  Preview 자산: {activeGeneration.generatedAsset.previewImageAssetId}
                                </p>
                                {generationPreviewLoading ? (
                                  <p className="subtle" style={{ margin: 0 }}>썸네일 불러오는 중...</p>
                                ) : generationPreviewUrl ? (
                                  <img
                                    src={generationPreviewUrl}
                                    alt="생성 썸네일"
                                    style={{ width: 176, height: 176, objectFit: 'cover', borderRadius: 8, border: '1px solid #d7d7d7' }}
                                  />
                                ) : (
                                  <p className="subtle" style={{ margin: 0 }}>썸네일 URL을 불러오지 못했습니다.</p>
                                )}
                              </div>
                            ) : null}
                            <p className="subtle" style={{ margin: 0 }}>
                              GLB 자산: {activeGeneration.generatedAsset.glbAssetId}
                            </p>
                            {activeGeneration.generatedAsset.objAssetId ? (
                              <p className="subtle" style={{ margin: 0 }}>
                                OBJ 자산: {activeGeneration.generatedAsset.objAssetId}
                              </p>
                            ) : null}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => setShowPreviewModal(true)}
                              >
                                3D 미리보기 열기
                              </button>
                              <button
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() =>
                                  void copyTextToClipboard(activeGeneration.generatedAsset!.glbAssetId, 'GLB 자산 ID')
                                }
                              >
                                GLB 자산 ID 복사
                              </button>
                              {activeGeneration.generatedAsset.objAssetId ? (
                                <button
                                  className="btn btn-outline-secondary btn-sm"
                                  onClick={() =>
                                    void copyTextToClipboard(
                                      activeGeneration.generatedAsset!.objAssetId as string,
                                      'OBJ 자산 ID'
                                    )
                                  }
                                >
                                  OBJ 자산 ID 복사
                                </button>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="subtle" style={{ margin: 0 }}>
                      생성 작업이 없습니다.
                    </p>
                  )}

                  {aiEventLog.length > 0 ? (
                    <div className="list-row" style={{ borderColor: '#ececec' }} ref={aiLogPanelRef}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 13 }}>이벤트 로그</strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div className="btn-group btn-group-sm" role="group" aria-label="로그 필터">
                              <button
                                className={`btn ${aiLogFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => setAiLogFilter('all')}
                              >
                                전체
                              </button>
                              <button
                                className={`btn ${aiLogFilter === 'info' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => setAiLogFilter('info')}
                              >
                                INFO
                              </button>
                              <button
                                className={`btn ${aiLogFilter === 'warn' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => setAiLogFilter('warn')}
                              >
                                WARN
                              </button>
                              <button
                                className={`btn ${aiLogFilter === 'error' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => setAiLogFilter('error')}
                              >
                                ERROR
                              </button>
                            </div>
                            <button
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => {
                                setAiEventLog([]);
                                setAiLogFilter('all');
                                setAiCategoryFilter('all');
                                setAiLogQuery('');
                                setLogRetryFeedback(null);
                              }}
                            >
                              로그 초기화
                            </button>
                          </div>
                        </div>
                        <input
                          className="form-control form-control-sm"
                          placeholder="로그 검색 (메시지/카테고리/레벨)"
                          value={aiLogQuery}
                          onChange={(e) => setAiLogQuery(e.target.value)}
                          aria-label="이벤트 로그 검색"
                        />
                        <div className="btn-group btn-group-sm" role="group" aria-label="카테고리 필터">
                          <button
                            className={`btn ${aiCategoryFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => setAiCategoryFilter('all')}
                          >
                            ALL
                          </button>
                          <button
                            className={`btn ${aiCategoryFilter === 'poll' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => setAiCategoryFilter('poll')}
                          >
                            POLL
                          </button>
                          <button
                            className={`btn ${aiCategoryFilter === 'upload' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => setAiCategoryFilter('upload')}
                          >
                            UPLOAD
                          </button>
                          <button
                            className={`btn ${aiCategoryFilter === 'promote' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => setAiCategoryFilter('promote')}
                          >
                            PROMOTE
                          </button>
                          <button
                            className={`btn ${aiCategoryFilter === 'system' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => setAiCategoryFilter('system')}
                          >
                            SYSTEM
                          </button>
                        </div>
                        {filteredAiEventLog.length === 0 ? (
                          <p className="subtle" style={{ margin: 0 }}>
                            표시할 로그가 없습니다.
                          </p>
                        ) : (
                          filteredAiEventLog.map((entry) => (
                            <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span
                                className="label"
                                style={{ background: 'rgba(120, 120, 120, 0.14)', color: '#4f4f4f' }}
                              >
                                {entry.category.toUpperCase()}
                              </span>
                              <span
                                className="label"
                                style={{
                                  background:
                                    entry.level === 'error'
                                      ? 'rgba(184, 37, 37, 0.16)'
                                      : entry.level === 'warn'
                                      ? 'rgba(181, 120, 0, 0.16)'
                                      : 'rgba(10, 143, 106, 0.16)',
                                  color:
                                    entry.level === 'error'
                                      ? '#8c2020'
                                      : entry.level === 'warn'
                                      ? '#8a5a00'
                                      : '#0a8f6a',
                                  cursor: 'pointer'
                                }}
                                onClick={() => setAiLogFilter(entry.level)}
                                title={`${entry.level.toUpperCase()} 필터 적용`}
                              >
                                {entry.level.toUpperCase()}
                              </span>
                              <p className="subtle" style={{ margin: 0 }}>
                                {entry.time} {entry.message}
                              </p>
                              {entry.category === 'poll' && entry.level === 'error' ? (
                                <button
                                  className="btn btn-outline-secondary btn-sm"
                                  onClick={() => void retryStatusFromLog(entry.id)}
                                  disabled={aiRefreshing}
                                >
                                  상태 재조회
                                </button>
                              ) : null}
                              {logRetryFeedback?.entryId === entry.id ? (
                                <p
                                  className="subtle"
                                  style={{
                                    margin: 0,
                                    color:
                                      logRetryFeedback.tone === 'error'
                                        ? '#8c2020'
                                        : '#0a8f6a'
                                  }}
                                >
                                  {logRetryFeedback.message}
                                </p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <input
                className="form-control form-control-sm"
                placeholder="이름/코드/카테고리 검색"
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                aria-label="카탈로그 검색"
              />
              <select
                className="form-select form-select-sm"
                value={catalogCategory}
                onChange={(e) => setCatalogCategory(e.target.value)}
                aria-label="카테고리 필터"
                style={{ marginTop: 8 }}
              >
                <option value="all">전체 카테고리</option>
                {catalogCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <select
                  className="form-select form-select-sm"
                  value={catalogSourceFilter}
                  aria-label="소스 필터"
                  onChange={(e) => {
                    const nextSource = e.target.value as 'all' | 'manual' | 'ai';
                    setCatalogSourceFilter(nextSource);
                    void fetchCatalogOnly({ source: nextSource, includeInactive: catalogIncludeInactive, silent: true });
                  }}
                  style={{ maxWidth: 180 }}
                >
                  <option value="all">전체 소스</option>
                  <option value="manual">수동</option>
                  <option value="ai">AI</option>
                </select>
                <button
                  className={`btn btn-sm ${catalogIncludeInactive ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => {
                    const next = !catalogIncludeInactive;
                    setCatalogIncludeInactive(next);
                    void fetchCatalogOnly({ includeInactive: next, source: catalogSourceFilter, silent: true });
                  }}
                  type="button"
                >
                  비활성 표시 {catalogIncludeInactive ? '켜짐' : '꺼짐'}
                </button>
              </div>
              <p className="subtle" style={{ margin: '8px 0 10px' }}>
                {displayedCatalog.length}
                {catalogLatestByFamilyOnly ? ` / ${filteredCatalog.length}` : ''} / {catalog.length} 표시 중
                {catalogLatestByFamilyOnly ? ` (패밀리 ${catalogFamilyStats.familyCount}개 최신)` : ''}
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <button
                  className={`btn btn-sm ${catalogLatestByFamilyOnly ? 'btn-primary' : 'btn-outline-secondary'}`}
                  type="button"
                  onClick={() => setCatalogLatestByFamilyOnly((prev) => !prev)}
                >
                  패밀리 최신만 {catalogLatestByFamilyOnly ? '켜짐' : '꺼짐'}
                </button>
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
                {displayedCatalog.length === 0 ? (
                  <p className="subtle" style={{ margin: 0, padding: '8px 0' }}>
                    검색 결과가 없습니다.
                  </p>
                ) : (
                  displayedCatalog.map((def) => (
                    <div
                      key={def.id}
                      id={`catalog-item-${def.id}`}
                      className="list-row"
                      style={
                        def.id === catalogHighlightedId
                          ? {
                              borderColor: '#1f4f8f',
                              background: 'rgba(31, 79, 143, 0.12)'
                            }
                          : def.id === recentAiObjectId
                          ? {
                              borderColor: '#0a8f6a',
                              background: 'rgba(10, 143, 106, 0.08)'
                            }
                          : undefined
                      }
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div>
                          <strong style={{ fontSize: 14 }}>
                            {def.name}
                            {def.id === recentAiObjectId ? ' (신규 AI)' : ''}
                            {catalogFamilyStats.latestIdSet.has(def.id) ? ' (최신)' : ''}
                          </strong>
                          <p className="subtle" style={{ margin: '4px 0 0' }}>
                            {def.category} / {def.code}
                            {def.source ? ` / ${def.source}` : ''}
                            {getDefinitionVersion(def) !== null ? ` / v${getDefinitionVersion(def)}` : ''}
                          </p>
                          <p className="subtle" style={{ margin: '4px 0 0' }}>
                            family: {getDefinitionFamily(def)}
                            {(catalogFamilyStats.familyCounts.get(getDefinitionFamily(def)) ?? 0) > 1
                              ? ` · 버전 ${catalogFamilyStats.familyCounts.get(getDefinitionFamily(def))}개`
                              : ''}
                          </p>
                          {isDefinitionInactive(def) ? (
                            <p className="subtle" style={{ margin: '4px 0 0', color: '#8a5a00' }}>
                              비활성 오브젝트
                            </p>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => addFromCatalog(def)}
                            disabled={isDefinitionInactive(def)}
                          >
                            추가
                          </button>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => void runCatalogLifecycleAction(def, isDefinitionInactive(def) ? 'activate' : 'deactivate')}
                            disabled={catalogLifecycleBusyId !== null}
                          >
                            {isDefinitionInactive(def) ? '활성화' : '비활성화'}
                          </button>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => void runCatalogLifecycleAction(def, 'new-version')}
                            disabled={catalogLifecycleBusyId !== null}
                          >
                            신규 버전
                          </button>
                            <button
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => void loadLifecycleEvents(def.id, def.name)}
                              disabled={lifecycleEventsLoading}
                            >
                              이력
                            </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

                {lifecycleEventsTargetId ? (
                  <div className="list-row" style={{ marginTop: 10 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 13 }}>
                          라이프사이클 이력: {lifecycleEventsTargetName ?? lifecycleEventsTargetId}
                        </strong>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            className="form-select form-select-sm"
                            value={lifecycleActionFilter}
                            aria-label="라이프사이클 액션 필터"
                            onChange={(e) =>
                              setLifecycleActionFilter(
                                e.target.value as 'all' | 'activate' | 'deactivate' | 'new_version'
                              )
                            }
                            style={{ maxWidth: 180 }}
                          >
                            <option value="all">전체 액션</option>
                            <option value="activate">활성화</option>
                            <option value="deactivate">비활성화</option>
                            <option value="new_version">신규 버전</option>
                          </select>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            type="button"
                            onClick={() =>
                              void copyTextToClipboard(
                                JSON.stringify(filteredLifecycleEvents, null, 2),
                                '라이프사이클 필터 결과 JSON'
                              )
                            }
                            disabled={filteredLifecycleEvents.length === 0}
                          >
                            필터 JSON 복사
                          </button>
                        </div>
                      </div>
                      {lifecycleEventsLoading ? (
                        <p className="subtle" style={{ margin: 0 }}>이력 조회 중...</p>
                      ) : filteredLifecycleEvents.length === 0 ? (
                        <p className="subtle" style={{ margin: 0 }}>이력이 없습니다.</p>
                      ) : (
                        filteredLifecycleEvents.map((event) => {
                          const tone = getLifecycleActionTone(event.action);
                          const detailEntries = getLifecycleDetailEntries(event.details);
                          const unresolvedRefCount = detailEntries.filter(
                            (entry) => entry.unresolvedRef
                          ).length;
                          const expanded = lifecycleExpandedEventIds[event.id] === true;

                          return (
                            <div
                              key={event.id}
                              style={{
                                display: 'grid',
                                gap: 6,
                                border: '1px solid #d8e1e8',
                                borderRadius: 8,
                                padding: '8px 10px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: 999,
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: tone.fg,
                                      background: tone.bg
                                    }}
                                  >
                                    {formatLifecycleAction(event.action)}
                                  </span>
                                  <span className="subtle" style={{ margin: 0, fontSize: 12 }}>
                                    {new Date(event.createdAt).toLocaleString('ko-KR')}
                                  </span>
                                </div>
                                <button
                                  className="btn btn-outline-secondary btn-sm"
                                  type="button"
                                  onClick={() =>
                                    void copyTextToClipboard(
                                      JSON.stringify(event, null, 2),
                                      '라이프사이클 이력 JSON'
                                    )
                                  }
                                >
                                  JSON 복사
                                </button>
                                <button
                                  className="btn btn-outline-secondary btn-sm"
                                  type="button"
                                  onClick={() => toggleLifecycleEventJson(event.id)}
                                >
                                  {expanded ? 'JSON 접기' : 'JSON 보기'}
                                </button>
                              </div>

                              <p className="subtle" style={{ margin: 0 }}>
                                actor: {event.actorUserId}
                              </p>

                              {unresolvedRefCount > 0 ? (
                                <p className="subtle" style={{ margin: 0, color: '#8a5a00' }}>
                                  미해결 참조 {unresolvedRefCount}건
                                </p>
                              ) : null}

                              {detailEntries.length > 0 ? (
                                <div style={{ display: 'grid', gap: 2 }}>
                                  {detailEntries.map((entry) => (
                                    <div
                                      key={`${event.id}-${entry.key}`}
                                      style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
                                    >
                                      <p className="subtle" style={{ margin: 0 }}>
                                        {formatLifecycleDetailKey(entry.key)}: {entry.value}
                                      </p>
                                      {entry.unresolvedRef ? (
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            borderRadius: 999,
                                            padding: '1px 6px',
                                            color: '#8a5a00',
                                            background: 'rgba(138, 90, 0, 0.15)'
                                          }}
                                        >
                                          미해결
                                        </span>
                                      ) : null}
                                      {entry.objectDefinitionId ? (
                                        <button
                                          className="btn btn-outline-secondary btn-sm"
                                          type="button"
                                          onClick={() =>
                                            focusCatalogByObjectDefinitionId(entry.objectDefinitionId!)
                                          }
                                        >
                                          카탈로그에서 찾기
                                        </button>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {expanded ? (
                                <pre
                                  style={{
                                    margin: 0,
                                    fontSize: 12,
                                    lineHeight: 1.5,
                                    background: '#f5f7fa',
                                    border: '1px solid #d8e1e8',
                                    borderRadius: 6,
                                    padding: 8,
                                    overflowX: 'auto'
                                  }}
                                >
                                  {JSON.stringify(event.details ?? {}, null, 2)}
                                </pre>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
            </>
          )}
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
          <p className="subtle" style={{ margin: '8px 0 0' }}>조작: 오브젝트 점을 드래그하거나, 캔버스 포커스 후 방향키로 이동 (간격 {moveStep})</p>
        </section>
      </section>

      <section id="export-history" className="plain-section">
        <h2 style={{ marginTop: 0 }}>내보내기 이력</h2>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {sceneExports.length === 0 ? (
            <p className="subtle" style={{ margin: 0 }}>
              아직 내보내기 이력이 없습니다.
            </p>
          ) : (
            sceneExports.map((item) => (
              <article key={item.id} className="list-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{item.id.slice(0, 8)}</strong>
                  <span className="label">{exportStatusLabel[item.status]}</span>
                </div>
                <p className="subtle" style={{ margin: '6px 0 0' }}>
                  재시도 {item.retryCount}/{item.retryLimit} · 제한 {Math.round(item.timeoutMs / 1000)}초
                </p>
                {item.lastError ? (
                  <p className="subtle" style={{ margin: '6px 0 0', color: '#a03030' }}>
                    오류: {item.lastError}
                  </p>
                ) : null}
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-outline-secondary btn-sm"
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
              <h3 style={{ margin: 0 }}>3D 미리보기</h3>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowPreviewModal(false)}>
                닫기
              </button>
            </div>

            {generated.length === 0 ? (
              <p className="subtle" style={{ marginTop: 10 }}>
                생성된 3D 오브젝트가 없습니다. 상단의 3D 생성 버튼을 먼저 실행하세요.
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
