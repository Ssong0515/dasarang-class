import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  FileText,
  Edit3,
  Save,
  X,
  LayoutGrid,
  Type,
  Code,
  Trash2,
  Eye,
  Maximize2,
  GripVertical,
  Presentation,
  FolderOpen,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LessonCategory, LessonContent, NotebookLmFolderSyncResult } from '../types';
import { StudentContentCard, StudentContentPreviewFrame, SlideEmbed } from './StudentContentPreview';
import {
  openDriveFolderPicker,
  openDriveSlidePicker,
  requestDriveSyncAccessToken,
  type DriveFolder,
} from '../utils/drivePicker';

interface ContentLibraryProps {
  categories: LessonCategory[];
  contents: LessonContent[];
  userEmail?: string;
  onSaveCategory: (category: Partial<LessonCategory>) => Promise<void>;
  onSaveContent: (content: Partial<LessonContent>) => Promise<LessonContent>;
  onReorderCategories: (nextCategories: LessonCategory[]) => Promise<void>;
  onReorderContents: (updates: Array<{ id: string; categoryId: string | null; order: number }>) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onDeleteContent: (id: string) => Promise<void>;
  onSyncNotebookLmFolder: (folderId: string, driveAccessToken: string) => Promise<NotebookLmFolderSyncResult>;
  onDirtyStateChange: (isDirty: boolean) => void;
}

export const CONTENT_EDIT_DISCARD_WARNING =
  '저장하지 않은 변경 사항이 있습니다. 저장하지 않고 이동하면 수정한 내용이 모두 사라집니다. 계속할까요?';

type EditorTab = 'edit' | 'preview' | 'description';
type CategoryDropTarget = { targetId: string; position: 'before' | 'after' } | null;
type DraggedContent = { id: string; categoryId: string | null };
type ContentDropTarget = { categoryId: string | null; index: number } | null;

const UNCATEGORIZED_ID = '__uncategorized__';
const NOTEBOOKLM_SYNC_FOLDER_STORAGE_KEY = 'notebooklm-sync-folder';

const readStoredNotebookLmFolder = (): DriveFolder | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(NOTEBOOKLM_SYNC_FOLDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DriveFolder>;
    if (!parsed.id || !parsed.name || parsed.id === parsed.name) return null;
    return { id: parsed.id, name: parsed.name };
  } catch (_) {
    return null;
  }
};

const storeNotebookLmFolder = (folder: DriveFolder | null) => {
  if (typeof window === 'undefined') return;

  if (!folder) {
    window.localStorage.removeItem(NOTEBOOKLM_SYNC_FOLDER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(NOTEBOOKLM_SYNC_FOLDER_STORAGE_KEY, JSON.stringify(folder));
};

const getContainerId = (categoryId: string | null) => categoryId ?? UNCATEGORIZED_ID;
const getContentsForCategory = (items: LessonContent[], categoryId: string | null) =>
  items.filter((item) => (item.categoryId ?? null) === categoryId);
const createEmptyContentDraft = (categoryId: string | null): Partial<LessonContent> => ({
  categoryId,
  title: '',
  description: '',
  html: '',
  slideUrl: '',
});
const normalizeContentDraft = (draft: Partial<LessonContent> | null | undefined, fallbackCategoryId: string | null) => ({
  categoryId: typeof draft?.categoryId === 'string' ? draft.categoryId : fallbackCategoryId,
  title: draft?.title?.trim() ?? '',
  description: draft?.description ?? '',
  html: draft?.html ?? '',
  slideUrl: draft?.slideUrl?.trim() ?? '',
});


const toDriveEmbedUrl = (raw: string): string => {
  const trimmed = raw.trim();
  const slidesMatch = trimmed.match(/\/presentation\/d\/([^/?#]+)/);
  if (slidesMatch) return `https://docs.google.com/presentation/d/${slidesMatch[1]}/embed`;
  const fileMatch = trimmed.match(/\/file\/d\/([^/?#]+)/);
  if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  return trimmed;
};

const isContentDraftDirty = (
  draft: Partial<LessonContent> | null,
  snapshot: LessonContent | null
) => {
  if (!draft) return false;

  const current = normalizeContentDraft(
    draft,
    typeof draft.categoryId === 'string' ? draft.categoryId : null
  );
  const baseline = normalizeContentDraft(
    snapshot ?? createEmptyContentDraft(current.categoryId),
    current.categoryId
  );

  return (
    current.categoryId !== baseline.categoryId ||
    current.title !== baseline.title ||
    current.description !== baseline.description ||
    current.html !== baseline.html ||
    current.slideUrl !== baseline.slideUrl
  );
};

const reorderCategories = (
  items: LessonCategory[],
  draggingId: string,
  targetId: string,
  position: 'before' | 'after'
) => {
  const nextItems = [...items];
  const sourceIndex = nextItems.findIndex((item) => item.id === draggingId);
  if (sourceIndex === -1) return nextItems;
  const [draggingItem] = nextItems.splice(sourceIndex, 1);
  const targetIndex = nextItems.findIndex((item) => item.id === targetId);
  if (targetIndex === -1) return items;
  nextItems.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, draggingItem);
  return nextItems;
};

const hasCategoryOrderChanged = (currentItems: LessonCategory[], nextItems: LessonCategory[]) =>
  currentItems.length !== nextItems.length ||
  nextItems.some((item, index) => item.id !== currentItems[index]?.id);

const hasNumericOrder = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const compareContentCreatedAt = (left: LessonContent, right: LessonContent) =>
  new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

const sortDisplayedContents = (items: LessonContent[]) =>
  [...items].sort((left, right) => {
    const leftHasOrder = hasNumericOrder(left.order);
    const rightHasOrder = hasNumericOrder(right.order);

    if ((left.categoryId ?? '') !== (right.categoryId ?? '')) {
      return (left.categoryId ?? '').localeCompare(right.categoryId ?? '');
    }

    if (leftHasOrder && rightHasOrder && left.order !== right.order) {
      return left.order - right.order;
    }

    if (leftHasOrder !== rightHasOrder) {
      return leftHasOrder ? -1 : 1;
    }

    const createdAtDiff = compareContentCreatedAt(left, right);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return left.title.localeCompare(right.title);
  });

const applyContentReorderUpdates = (
  items: LessonContent[],
  updates: Array<{ id: string; categoryId: string | null; order: number }>
) => {
  const updateMap = new Map(updates.map((update) => [update.id, update]));

  return sortDisplayedContents(
    items.map((item) => {
      const update = updateMap.get(item.id);
      return update
        ? {
            ...item,
            categoryId: update.categoryId,
            order: update.order,
          }
        : item;
    })
  );
};

const buildContentReorderUpdates = (
  items: LessonContent[],
  draggingContentId: string,
  targetCategoryId: string | null,
  targetIndex: number
) => {
  const movingContent = items.find((item) => item.id === draggingContentId);
  if (!movingContent) return [];

  const sourceCategoryId = movingContent.categoryId ?? null;
  const sourceItems = getContentsForCategory(items, sourceCategoryId);
  const sourceIndex = sourceItems.findIndex((item) => item.id === draggingContentId);
  const sourceWithoutMoving = sourceItems.filter((item) => item.id !== draggingContentId);
  const targetBase =
    sourceCategoryId === targetCategoryId
      ? sourceWithoutMoving
      : getContentsForCategory(items, targetCategoryId).filter((item) => item.id !== draggingContentId);

  let safeTargetIndex = Math.max(0, Math.min(targetIndex, targetBase.length));
  if (sourceCategoryId === targetCategoryId && sourceIndex !== -1) {
    const isMovingDownWithinList = targetIndex > sourceIndex && targetIndex < sourceItems.length;
    const isAppendingToEnd = targetIndex >= sourceItems.length;

    if (isMovingDownWithinList) {
      safeTargetIndex -= 1;
    } else if (isAppendingToEnd) {
      safeTargetIndex = targetBase.length;
    }
  }

  const nextTarget = [...targetBase];
  nextTarget.splice(safeTargetIndex, 0, { ...movingContent, categoryId: targetCategoryId });

  const affectedLists =
    sourceCategoryId === targetCategoryId
      ? [{ categoryId: targetCategoryId, items: nextTarget }]
      : [
          { categoryId: sourceCategoryId, items: sourceWithoutMoving },
          { categoryId: targetCategoryId, items: nextTarget },
        ];

  return affectedLists
    .flatMap(({ categoryId, items: affectedItems }) =>
      affectedItems.map((item, index) => ({ id: item.id, categoryId, order: index }))
    )
    .filter((update) => {
      const original = items.find((item) => item.id === update.id);
      return Boolean(
        original &&
          ((original.categoryId ?? null) !== update.categoryId || original.order !== update.order)
      );
    });
};

export const ContentLibrary: React.FC<ContentLibraryProps> = ({
  categories,
  contents,
  userEmail,
  onSaveCategory,
  onSaveContent,
  onReorderCategories,
  onReorderContents,
  onDeleteCategory,
  onDeleteContent,
  onSyncNotebookLmFolder,
  onDirtyStateChange,
}) => {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingContent, setEditingContent] = useState<Partial<LessonContent> | null>(null);
  const [savedContentSnapshot, setSavedContentSnapshot] = useState<LessonContent | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editorTab, setEditorTab] = useState<EditorTab>('edit');
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [isPickingSlide, setIsPickingSlide] = useState(false);
  const [isPickingNotebookLmFolder, setIsPickingNotebookLmFolder] = useState(false);
  const [isSyncingNotebookLmFolder, setIsSyncingNotebookLmFolder] = useState(false);
  const [notebookLmFolder, setNotebookLmFolder] = useState<DriveFolder | null>(() => readStoredNotebookLmFolder());
  const [notebookLmSyncResult, setNotebookLmSyncResult] = useState<NotebookLmFolderSyncResult | null>(null);
  const [notebookLmSyncError, setNotebookLmSyncError] = useState<string | null>(null);
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [displayedCategories, setDisplayedCategories] = useState<LessonCategory[]>(categories);
  const [displayedContents, setDisplayedContents] = useState<LessonContent[]>(contents);
  const [categoryReorderError, setCategoryReorderError] = useState<string | null>(null);
  const [contentReorderError, setContentReorderError] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [categoryDropTarget, setCategoryDropTarget] = useState<CategoryDropTarget>(null);
  const [draggingContent, setDraggingContent] = useState<DraggedContent | null>(null);
  const [contentDropTarget, setContentDropTarget] = useState<ContentDropTarget>(null);
  const categoryDragRef = useRef<string | null>(null);
  const contentDragRef = useRef<DraggedContent | null>(null);
  const dragCleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewContent = editingContent
    ? ({
        id: editingContent.id ?? '__preview__',
        categoryId: editingContent.categoryId ?? null,
        ownerUid: editingContent.ownerUid ?? '',
        title: editingContent.title?.trim() || '미리보기 콘텐츠',
        description: editingContent.description ?? '',
        html: editingContent.html ?? '',
        slideUrl: editingContent.slideUrl ?? '',
        createdAt: editingContent.createdAt ?? new Date().toISOString(),
        order: editingContent.order,
      } satisfies LessonContent)
    : null;

  const uncategorizedContents = getContentsForCategory(displayedContents, null);
  const hasPreviewHtml = Boolean(previewContent?.html.trim());
  const hasPreviewContent = hasPreviewHtml || Boolean(previewContent?.slideUrl?.trim());
  const isExistingContent = Boolean(editingContent?.id);
  const hasUnsavedChanges = isContentDraftDirty(editingContent, savedContentSnapshot);
  const editorTitle = isExistingContent ? '콘텐츠 미리보기' : '새 콘텐츠 작성';
  const isDescriptionTab = editorTab === 'description';
  const editorSectionTitle = isDescriptionTab ? '수업 설명' : 'HTML 내용';

  useEffect(() => {
    if (!editingContent?.html?.trim()) setIsFullscreenPreviewOpen(false);
  }, [editingContent]);

  useEffect(() => {
    setDisplayedCategories(categories);
  }, [categories]);

  useEffect(() => {
    setDisplayedContents(contents);
  }, [contents]);

  useEffect(() => {
    if (!selectedContainerId || selectedContainerId === UNCATEGORIZED_ID) return;
    if (!categories.some((category) => category.id === selectedContainerId)) setSelectedContainerId(null);
  }, [categories, selectedContainerId]);

  useEffect(() => {
    onDirtyStateChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyStateChange]);

  useEffect(
    () => () => {
      onDirtyStateChange(false);
      if (dragCleanupTimeoutRef.current !== null) {
        clearTimeout(dragCleanupTimeoutRef.current);
      }
    },
    [onDirtyStateChange]
  );

  const clearDragState = () => {
    setDraggingCategoryId(null);
    setCategoryDropTarget(null);
    setDraggingContent(null);
    setContentDropTarget(null);
  };

  const cancelPendingDragCleanup = () => {
    if (dragCleanupTimeoutRef.current !== null) {
      clearTimeout(dragCleanupTimeoutRef.current);
      dragCleanupTimeoutRef.current = null;
    }
  };

  const finalizeDragState = () => {
    cancelPendingDragCleanup();
    clearDragState();
    categoryDragRef.current = null;
    contentDragRef.current = null;
  };

  const scheduleDragStateCleanup = () => {
    cancelPendingDragCleanup();
    dragCleanupTimeoutRef.current = setTimeout(() => {
      dragCleanupTimeoutRef.current = null;
      clearDragState();
      categoryDragRef.current = null;
      contentDragRef.current = null;
    }, 0);
  };

  const setCategoryDropTargetIfChanged = (nextTarget: CategoryDropTarget) => {
    setCategoryDropTarget((current) => {
      if (
        current?.targetId === nextTarget?.targetId &&
        current?.position === nextTarget?.position
      ) {
        return current;
      }

      return nextTarget;
    });
  };

  const setContentDropTargetIfChanged = (nextTarget: ContentDropTarget) => {
    setContentDropTarget((current) => {
      if (
        current?.categoryId === nextTarget?.categoryId &&
        current?.index === nextTarget?.index
      ) {
        return current;
      }

      return nextTarget;
    });
  };

  const getSaveErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) {
      return `콘텐츠 저장에 실패했습니다. ${error.message}`;
    }

    return '콘텐츠 저장에 실패했습니다. Firestore 규칙 배포 상태를 확인하세요.';
  };

  const getCategoryReorderErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) {
      return `카테고리 순서 저장에 실패했습니다. ${error.message}`;
    }

    return '카테고리 순서 저장에 실패했습니다. 잠시 후 다시 시도하세요.';
  };

  const getContentReorderErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) {
      return `콘텐츠 이동 저장에 실패했습니다. ${error.message}`;
    }

    return '콘텐츠 이동 저장에 실패했습니다. 잠시 후 다시 시도하세요.';
  };

  const ensureCategoryExpanded = (categoryId: string | null) => {
    if (!categoryId) return;
    setExpandedCategories((current) => {
      if (current.has(categoryId)) return current;
      const next = new Set(current);
      next.add(categoryId);
      return next;
    });
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedContainerId(id);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    await onSaveCategory({ name: newCategoryName.trim() });
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const confirmDiscardUnsavedChanges = () =>
    !hasUnsavedChanges || window.confirm(CONTENT_EDIT_DISCARD_WARNING);

  const handleStartNewContent = (categoryId: string | null) => {
    if (!confirmDiscardUnsavedChanges()) return;
    setEditingContent(createEmptyContentDraft(categoryId));
    setSavedContentSnapshot(null);
    setSelectedContainerId(getContainerId(categoryId));
    setEditorTab('edit');
    setIsFullscreenPreviewOpen(false);
    setIsSavingContent(false);
    setSaveError(null);
    ensureCategoryExpanded(categoryId);
  };

  const handleOpenSavedContent = (content: LessonContent) => {
    if (editingContent?.id === content.id) return;
    if (!confirmDiscardUnsavedChanges()) return;
    setEditingContent(content);
    setSavedContentSnapshot(content);
    setSelectedContainerId(getContainerId(content.categoryId ?? null));
    setEditorTab('preview');
    setIsFullscreenPreviewOpen(false);
    setIsSavingContent(false);
    setSaveError(null);
    ensureCategoryExpanded(content.categoryId ?? null);
  };

  const handleCloseEditor = () => {
    setEditingContent(null);
    setSavedContentSnapshot(null);
    setEditorTab('edit');
    setIsFullscreenPreviewOpen(false);
    setIsSavingContent(false);
    setSaveError(null);
    setDriveUrlInput('');
  };

  const handleSaveContent = async () => {
    if (!editingContent?.title?.trim() || !hasUnsavedChanges) return;
    setIsSavingContent(true);
    setSaveError(null);

    try {
      const savedContent = await onSaveContent({
        ...editingContent,
        categoryId: editingContent.categoryId ?? null,
        title: editingContent.title.trim(),
      });
      setEditingContent(savedContent);
      setSavedContentSnapshot(savedContent);
      setSelectedContainerId(getContainerId(savedContent.categoryId ?? null));
      ensureCategoryExpanded(savedContent.categoryId ?? null);
    } catch (error) {
      setSaveError(getSaveErrorMessage(error));
    } finally {
      setIsSavingContent(false);
    }
  };

  const handlePickNotebookLmFolder = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
    const apiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY;
    if (!clientId) return;

    setIsPickingNotebookLmFolder(true);
    setNotebookLmSyncError(null);

    try {
      const folder = await openDriveFolderPicker(apiKey, clientId, userEmail);
      if (folder) {
        setNotebookLmFolder(folder);
        storeNotebookLmFolder(folder);
        setNotebookLmSyncResult(null);
      }
    } catch (error) {
      setNotebookLmSyncError(error instanceof Error ? error.message : 'Drive 폴더 선택에 실패했습니다.');
    } finally {
      setIsPickingNotebookLmFolder(false);
    }
  };

  const handleClearNotebookLmFolder = () => {
    setNotebookLmFolder(null);
    storeNotebookLmFolder(null);
    setNotebookLmSyncResult(null);
    setNotebookLmSyncError(null);
  };

  const handleSyncNotebookLmFolder = async () => {
    if (!notebookLmFolder) return;

    setIsSyncingNotebookLmFolder(true);
    setNotebookLmSyncError(null);

    try {
      const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
      if (!clientId) {
        throw new Error('Google OAuth Client ID가 설정되어 있지 않습니다.');
      }

      const driveAccessToken = await requestDriveSyncAccessToken(clientId, userEmail);
      const result = await onSyncNotebookLmFolder(notebookLmFolder.id, driveAccessToken);
      setNotebookLmSyncResult(result);
    } catch (error) {
      setNotebookLmSyncError(error instanceof Error ? error.message : 'NotebookLM 폴더 동기화에 실패했습니다.');
    } finally {
      setIsSyncingNotebookLmFolder(false);
    }
  };

  const handleContentDelete = (contentId: string) => {
    void onDeleteContent(contentId);
    if (editingContent?.id === contentId) handleCloseEditor();
  };

  const handleCategoryDragStart = (event: React.DragEvent<HTMLDivElement>, categoryId: string) => {
    cancelPendingDragCleanup();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', categoryId);
    categoryDragRef.current = categoryId;
    contentDragRef.current = null;
    setDraggingCategoryId(categoryId);
    setDraggingContent(null);
    setContentDropTarget(null);
    setCategoryDropTarget(null);
    setCategoryReorderError(null);
  };

  const handleContentDragStart = (event: React.DragEvent<HTMLDivElement>, content: LessonContent) => {
    cancelPendingDragCleanup();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', content.id);
    const dragPayload = { id: content.id, categoryId: content.categoryId ?? null };
    categoryDragRef.current = null;
    contentDragRef.current = dragPayload;
    setDraggingCategoryId(null);
    setCategoryDropTarget(null);
    setDraggingContent(dragPayload);
    setContentDropTarget({
      categoryId: content.categoryId ?? null,
      index: getContentsForCategory(displayedContents, content.categoryId ?? null).findIndex((item) => item.id === content.id),
    });
    setContentReorderError(null);
  };

  const moveContentTo = async (targetCategoryId: string | null, targetIndex: number) => {
    cancelPendingDragCleanup();
    const activeDrag = contentDragRef.current ?? draggingContent;
    if (!activeDrag) return finalizeDragState();
    const previousContents = displayedContents;
    const updates = buildContentReorderUpdates(previousContents, activeDrag.id, targetCategoryId, targetIndex);
    finalizeDragState();
    if (updates.length === 0) return;
    const nextContents = applyContentReorderUpdates(previousContents, updates);
    if (targetCategoryId) ensureCategoryExpanded(targetCategoryId);
    setSelectedContainerId(getContainerId(targetCategoryId));
    setDisplayedContents(nextContents);
    setContentReorderError(null);

    try {
      await onReorderContents(updates);
    } catch (error) {
      setDisplayedContents(previousContents);
      setContentReorderError(getContentReorderErrorMessage(error));
    }
  };

  const inputBaseClassName = 'w-full rounded-2xl border-none px-6 py-4 outline-none transition-all';
  const editableInputClassName = `${inputBaseClassName} bg-[#F3F2EE] text-[#4A3728] focus:ring-2 focus:ring-[#8B5E3C]`;

  const getCategoryDragPosition = (event: React.DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };

  const handleCategoryDragOver = (event: React.DragEvent<HTMLElement>, categoryId: string) => {
    const activeCategoryId = categoryDragRef.current ?? draggingCategoryId;
    if (!activeCategoryId || activeCategoryId === categoryId) return;
    event.preventDefault();
    event.stopPropagation();
    setCategoryDropTargetIfChanged({
      targetId: categoryId,
      position: getCategoryDragPosition(event),
    });
  };

  const handleCategoryDropZoneDragOver = (
    event: React.DragEvent<HTMLElement>,
    categoryId: string,
    position: 'before' | 'after'
  ) => {
    const activeCategoryId = categoryDragRef.current ?? draggingCategoryId;
    if (!activeCategoryId || activeCategoryId === categoryId) return;
    event.preventDefault();
    event.stopPropagation();
    setCategoryDropTargetIfChanged({ targetId: categoryId, position });
  };

  const handleCategoryDrop = async (
    event: React.DragEvent<HTMLElement>,
    explicitTarget?: CategoryDropTarget
  ) => {
    cancelPendingDragCleanup();
    const activeCategoryId = categoryDragRef.current ?? draggingCategoryId;
    if (!activeCategoryId) return finalizeDragState();
    event.preventDefault();
    event.stopPropagation();

    const dropTarget = explicitTarget ?? categoryDropTarget;
    if (!dropTarget || dropTarget.targetId === activeCategoryId) {
      return finalizeDragState();
    }

    const previousCategories = displayedCategories;
    const nextCategories = reorderCategories(
      displayedCategories,
      activeCategoryId,
      dropTarget.targetId,
      dropTarget.position
    );

    finalizeDragState();
    if (!hasCategoryOrderChanged(previousCategories, nextCategories)) return;

    setDisplayedCategories(nextCategories);
    setCategoryReorderError(null);

    try {
      await onReorderCategories(nextCategories);
    } catch (error) {
      setDisplayedCategories(previousCategories);
      setCategoryReorderError(getCategoryReorderErrorMessage(error));
    }
  };

  const getContentDropIndex = (event: React.DragEvent<HTMLElement>, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? index : index + 1;
  };

  const getResolvedContentDropTarget = (
    categoryId: string | null,
    fallbackIndex: number
  ) => {
    if (contentDropTarget?.categoryId === categoryId) {
      return contentDropTarget;
    }

    return { categoryId, index: fallbackIndex };
  };

  const handleContentRowDragOver = (
    event: React.DragEvent<HTMLElement>,
    categoryId: string | null,
    index: number
  ) => {
    const activeDrag = contentDragRef.current ?? draggingContent;
    if (!activeDrag) return;
    event.preventDefault();
    event.stopPropagation();
    setContentDropTargetIfChanged({ categoryId, index: getContentDropIndex(event, index) });
  };

  const handleContentRowDrop = async (
    event: React.DragEvent<HTMLElement>,
    categoryId: string | null,
    index: number
  ) => {
    if (!(contentDragRef.current ?? draggingContent)) return;
    event.preventDefault();
    event.stopPropagation();
    const resolvedTarget = getResolvedContentDropTarget(
      categoryId,
      getContentDropIndex(event, index)
    );
    await moveContentTo(resolvedTarget.categoryId, resolvedTarget.index);
  };

  const handleContentAppendDragOver = (event: React.DragEvent<HTMLElement>, categoryId: string | null) => {
    const activeDrag = contentDragRef.current ?? draggingContent;
    if (!activeDrag) return;
    event.preventDefault();
    event.stopPropagation();
    setContentDropTargetIfChanged({
      categoryId,
      index: getContentsForCategory(displayedContents, categoryId).length,
    });
  };

  const handleContentAppendDrop = async (event: React.DragEvent<HTMLElement>, categoryId: string | null) => {
    if (!(contentDragRef.current ?? draggingContent)) return;
    event.preventDefault();
    event.stopPropagation();
    const resolvedTarget = getResolvedContentDropTarget(
      categoryId,
      getContentsForCategory(displayedContents, categoryId).length
    );
    await moveContentTo(resolvedTarget.categoryId, resolvedTarget.index);
  };

  const renderDropIndicator = (categoryId: string | null, index: number) => {
    const isActive =
      Boolean(draggingContent) &&
      contentDropTarget?.categoryId === categoryId &&
      contentDropTarget.index === index;
    return (
      <div className="px-1 py-0.5">
        <div
          className={`h-1 rounded-full bg-[#8B5E3C] transition-opacity ${
            isActive ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
    );
  };

  const renderAppendZone = (categoryId: string | null, isEmpty: boolean) => {
    const itemCount = getContentsForCategory(displayedContents, categoryId).length;
    const isActive =
      Boolean(draggingContent) &&
      contentDropTarget?.categoryId === categoryId &&
      contentDropTarget.index === itemCount;
    return (
      <div
        onDragOver={(event) => handleContentAppendDragOver(event, categoryId)}
        onDrop={(event) => void handleContentAppendDrop(event, categoryId)}
        className={isEmpty ? 'pt-1.5' : 'py-0.5'}
      >
        <div
          className={`rounded-2xl border border-dashed transition-colors ${
            isEmpty
              ? isActive
                ? 'min-h-[76px] border-[#8B5E3C] bg-[#FFF5E9]'
                : 'min-h-[76px] border-[#E5E3DD] bg-[#FBFBFA]'
              : isActive
                ? 'h-4 border-[#8B5E3C] bg-[#FFF5E9]'
                : 'h-4 border-transparent bg-transparent'
          }`}
        />
      </div>
    );
  };

  const renderContentRow = (content: LessonContent, categoryId: string | null, index: number) => (
    <React.Fragment key={content.id}>
      {renderDropIndicator(categoryId, index)}
      <div
        onDragOver={(event) => handleContentRowDragOver(event, categoryId, index)}
        onDrop={(event) => void handleContentRowDrop(event, categoryId, index)}
        className={`group grid grid-cols-[auto_auto_minmax(0,1fr)_2.5rem] items-center gap-1.5 rounded-xl px-1 py-0.5 transition-all sm:gap-2 ${draggingContent?.id === content.id ? 'opacity-40' : 'opacity-100'}`}
      >
        <div
          draggable
          onDragStart={(event) => handleContentDragStart(event, content)}
          onDragEnd={scheduleDragStateCleanup}
          className="cursor-grab rounded-lg p-1.5 text-[#A89F94] transition-all hover:bg-[#F3F2EE] hover:text-[#8B5E3C] active:cursor-grabbing sm:p-2"
        >
          <GripVertical size={14} />
        </div>
        <div className="flex h-8 w-8 items-center justify-center text-[#A89F94] sm:h-9 sm:w-9">
          <FileText size={16} />
        </div>
        <button
          onClick={() => handleOpenSavedContent(content)}
          className="min-w-0 rounded-xl px-2 py-2 text-left text-[13px] text-[#8B7E74] transition-all hover:bg-[#FFF5E9] hover:text-[#8B5E3C] sm:px-3 sm:text-sm"
        >
          <span className="block truncate font-medium">{content.title}</span>
        </button>
        <div className="flex w-10 justify-end">
          <button
            onClick={() => handleContentDelete(content.id)}
            className="rounded-lg p-1.5 text-[#A89F94] transition-all hover:bg-red-50 hover:text-red-500 sm:p-2"
            title="콘텐츠 삭제"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </React.Fragment>
  );

  const renderCategorySection = (category: LessonCategory) => {
    const categoryContents = getContentsForCategory(displayedContents, category.id);
    const isSelected = selectedContainerId === category.id;
    const isExpanded = expandedCategories.has(category.id);
    const isDropBefore = categoryDropTarget?.targetId === category.id && categoryDropTarget.position === 'before';
    const isDropAfter = categoryDropTarget?.targetId === category.id && categoryDropTarget.position === 'after';
    const isHeaderContentTarget =
      Boolean(draggingContent) &&
      contentDropTarget?.categoryId === category.id &&
      contentDropTarget.index === categoryContents.length;

    return (
      <div key={category.id} className="relative">
        {draggingCategoryId && draggingCategoryId !== category.id && (
          <>
            <div
              onDragOver={(event) => handleCategoryDropZoneDragOver(event, category.id, 'before')}
              onDrop={(event) => void handleCategoryDrop(event, { targetId: category.id, position: 'before' })}
              className="absolute inset-x-0 -top-2 z-20 h-4"
            >
              <div
                className={`pointer-events-none absolute inset-x-4 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#8B5E3C] transition-opacity ${
                  isDropBefore ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
            <div
              onDragOver={(event) => handleCategoryDropZoneDragOver(event, category.id, 'after')}
              onDrop={(event) => void handleCategoryDrop(event, { targetId: category.id, position: 'after' })}
              className="absolute inset-x-0 -bottom-2 z-20 h-4"
            >
              <div
                className={`pointer-events-none absolute inset-x-4 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#8B5E3C] transition-opacity ${
                  isDropAfter ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
          </>
        )}
        <div
          onDragOver={(event) => {
            if (draggingCategoryId) return handleCategoryDragOver(event, category.id);
            handleContentAppendDragOver(event, category.id);
          }}
          onDrop={(event) => {
            if (draggingCategoryId) {
              return void handleCategoryDrop(
                event,
                categoryDropTarget?.targetId === category.id ? categoryDropTarget : null
              );
            }
            void handleContentAppendDrop(event, category.id);
          }}
          className={`rounded-2xl border transition-all ${isSelected ? 'border-[#8B5E3C] bg-[#FFF5E9] text-[#8B5E3C]' : 'border-[#E5E3DD] bg-white text-[#4A3728]'} ${isHeaderContentTarget || isDropBefore || isDropAfter ? 'ring-2 ring-[#8B5E3C]/30' : ''}`}
        >
          <div className="flex items-center gap-2 p-2">
            <div
              draggable
              onDragStart={(event) => handleCategoryDragStart(event, category.id)}
              onDragEnd={scheduleDragStateCleanup}
              className="cursor-grab rounded-xl p-2 text-[#A89F94] transition-all hover:bg-[#F3F2EE] hover:text-[#8B5E3C] active:cursor-grabbing"
            >
              <GripVertical size={16} />
            </div>
            <button onClick={() => toggleCategory(category.id)} className="flex flex-1 items-center justify-between rounded-xl px-3 py-2 transition-all hover:bg-white/60">
              <div className="flex items-center gap-3">
                <LayoutGrid size={18} />
                <span className="font-bold">{category.name}</span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold text-[#8B7E74]">{categoryContents.length}</span>
              </div>
              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            <button onClick={() => void onDeleteCategory(category.id)} className="rounded-xl p-2 text-[#A89F94] transition-all hover:bg-red-50 hover:text-red-500" title="카테고리 삭제">
              <Trash2 size={16} />
            </button>
          </div>
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4 pb-4">
                <div className="space-y-0.5 border-l border-[#E5E3DD] pl-3 sm:pl-4">
                  {categoryContents.map((content, index) => renderContentRow(content, category.id, index))}
                  {renderDropIndicator(category.id, categoryContents.length)}
                  {renderAppendZone(category.id, categoryContents.length === 0)}
                  <button onClick={() => handleStartNewContent(category.id)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-[#8B5E3C] transition-all hover:bg-[#FFF5E9]">
                    <Plus size={16} />
                    새 콘텐츠 추가
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  const notebookLmSyncSummary = notebookLmSyncResult?.summary;

  return (
    <div className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-12 flex items-center justify-between gap-4">
          <div>
            <h1 className="mb-2 text-4xl font-bold text-[#4A3728]">수업 콘텐츠 라이브러리</h1>
            <p className="text-[#8B7E74]">카테고리 안팎에서 콘텐츠를 만들고 정리하세요.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleStartNewContent(null)}
              className="flex items-center gap-2 rounded-2xl bg-[#4A3728] px-6 py-3 font-bold text-white transition-all hover:bg-[#35271d]"
            >
              <Plus size={18} />
              새 콘텐츠
            </button>
            <button
              onClick={() => setIsAddingCategory(true)}
              className="flex items-center gap-2 rounded-2xl bg-[#8B5E3C] px-6 py-3 font-bold text-white shadow-lg shadow-[#8B5E3C]/10 transition-all hover:bg-[#724D31]"
            >
              <FolderPlus size={18} />
              새 카테고리
            </button>
          </div>
        </header>

        {isAddingCategory && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex items-center gap-4 rounded-3xl border border-[#E5E3DD] bg-white p-6"
          >
            <input
              type="text"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="카테고리 이름을 입력하세요"
              className="flex-1 rounded-xl border-none bg-[#F3F2EE] px-4 py-3 outline-none focus:ring-2 focus:ring-[#8B5E3C]"
            />
            <button onClick={() => void handleCreateCategory()} className="rounded-xl bg-[#8B5E3C] px-6 py-3 font-bold text-white">
              생성
            </button>
            <button onClick={() => setIsAddingCategory(false)} className="rounded-xl p-3 text-[#8B7E74] transition-all hover:bg-[#F3F2EE]">
              <X size={20} />
            </button>
          </motion.div>
        )}

        <section className="mb-8 rounded-[28px] border border-[#E5E3DD] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#8B5E3C]">
                <Presentation size={14} />
                NotebookLM 폴더 동기화
              </div>
              {notebookLmFolder ? (
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF5E9] text-[#8B5E3C]">
                    <FolderOpen size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[#4A3728]">{notebookLmFolder.name}</p>
                    <p className="truncate text-xs text-[#8B7E74]">선택된 Google Drive 폴더</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-medium text-[#8B7E74]">동기화할 Google Drive 폴더를 선택하세요.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handlePickNotebookLmFolder()}
                disabled={isPickingNotebookLmFolder || isSyncingNotebookLmFolder || !import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID}
                className="flex items-center gap-2 rounded-2xl border border-[#E5E3DD] bg-white px-4 py-3 text-sm font-bold text-[#8B5E3C] transition-all hover:border-[#8B5E3C] hover:bg-[#FFF5E9] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FolderOpen size={16} />
                {isPickingNotebookLmFolder ? '폴더 선택 중...' : notebookLmFolder ? '폴더 변경' : '폴더 선택'}
              </button>
              {notebookLmFolder ? (
                <button
                  type="button"
                  onClick={handleClearNotebookLmFolder}
                  disabled={isSyncingNotebookLmFolder}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E5E3DD] bg-white text-[#8B7E74] transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  title="선택한 폴더 해제"
                >
                  <X size={16} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSyncNotebookLmFolder()}
                disabled={!notebookLmFolder || isSyncingNotebookLmFolder || isPickingNotebookLmFolder}
                className="flex items-center gap-2 rounded-2xl bg-[#4A3728] px-5 py-3 text-sm font-bold text-white transition-all hover:bg-[#35271d] disabled:cursor-not-allowed disabled:bg-[#B8AA9A]"
              >
                <RefreshCw size={16} className={isSyncingNotebookLmFolder ? 'animate-spin' : ''} />
                {isSyncingNotebookLmFolder ? '동기화 중...' : '동기화 실행'}
              </button>
            </div>
          </div>

          {notebookLmSyncError ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{notebookLmSyncError}</span>
            </div>
          ) : null}

          {notebookLmSyncSummary ? (
            <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <div className="flex flex-wrap items-center gap-3 font-bold">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  스캔 {notebookLmSyncSummary.scanned}
                </span>
                <span>생성 {notebookLmSyncSummary.created}</span>
                <span>갱신 {notebookLmSyncSummary.updated}</span>
                <span>건너뜀 {notebookLmSyncSummary.skipped}</span>
                <span>실패 {notebookLmSyncSummary.failed}</span>
              </div>
              {notebookLmSyncResult.items.length > 0 ? (
                <div className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs font-medium">
                  {notebookLmSyncResult.items.map((item) => (
                    <div key={`${item.fileId}-${item.status}`} className="flex gap-2">
                      <span className="shrink-0 uppercase">{item.status}</span>
                      <span className="truncate">{item.fileName}</span>
                      {item.message ? <span className="shrink-0 text-green-700/70">{item.message}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-1">
            {contentReorderError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {contentReorderError}
              </div>
            )}
            <section
              onDragOver={(event) => handleContentAppendDragOver(event, null)}
              onDrop={(event) => void handleContentAppendDrop(event, null)}
              className={`rounded-[28px] border p-5 transition-all ${
                selectedContainerId === UNCATEGORIZED_ID ? 'border-[#8B5E3C] bg-[#FFF5E9]' : 'border-[#E5E3DD] bg-white'
              }`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <button onClick={() => setSelectedContainerId(UNCATEGORIZED_ID)} className="flex items-center gap-3 text-left">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F3F2EE] text-[#8B5E3C]">
                    <FileText size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-[#4A3728]">분류 없음</p>
                    <p className="text-xs text-[#8B7E74]">카테고리 밖에 바로 놓이는 콘텐츠</p>
                  </div>
                </button>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#8B7E74]">{uncategorizedContents.length}</span>
              </div>
              <div className="space-y-0.5">
                {uncategorizedContents.map((content, index) => renderContentRow(content, null, index))}
                {renderDropIndicator(null, uncategorizedContents.length)}
                {renderAppendZone(null, uncategorizedContents.length === 0)}
              </div>
            </section>

            <section className="space-y-3">
              <div className="px-2">
                <h2 className="text-lg font-bold text-[#4A3728]">카테고리</h2>
              </div>
              {categoryReorderError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {categoryReorderError}
                </div>
              )}
              {displayedCategories.length > 0 ? (
                displayedCategories.map((category) => renderCategorySection(category))
              ) : (
                <div className="rounded-3xl border border-dashed border-[#E5E3DD] bg-white p-8 text-center text-sm text-[#8B7E74]">
                  카테고리가 아직 없습니다.
                </div>
              )}
            </section>
          </div>

          <div className="lg:col-span-2">
            {editingContent ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-[40px] border border-[#E5E3DD] bg-white p-10 shadow-sm"
              >
                <div className="mb-8 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-[#4A3728]">{editorTitle}</h2>
                  <div className="flex gap-2">
                    {isExistingContent && (
                      <button
                        onClick={() => handleContentDelete(editingContent.id!)}
                        disabled={isSavingContent}
                        className="flex items-center gap-2 rounded-xl px-6 py-2.5 font-bold text-red-500 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={18} />
                        삭제
                      </button>
                    )}
                    <button
                      onClick={() => void handleSaveContent()}
                      disabled={isSavingContent || !editingContent.title?.trim() || !hasUnsavedChanges}
                      className="flex items-center gap-2 rounded-xl bg-[#8B5E3C] px-8 py-2.5 font-bold text-white shadow-lg shadow-[#8B5E3C]/10 transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:bg-[#B8AA9A] disabled:shadow-none"
                    >
                      <Save size={18} />
                      {isSavingContent ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>

                {saveError && (
                  <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {saveError}
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#8B5E3C]">
                      <Type size={14} /> 제목
                    </label>
                    <input
                      type="text"
                      value={editingContent.title ?? ''}
                      onChange={(event) => {
                        setSaveError(null);
                        setEditingContent({ ...editingContent, title: event.target.value });
                      }}
                      placeholder="콘텐츠 제목을 입력하세요"
                      className={`${editableInputClassName} text-lg font-bold`}
                    />
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#8B5E3C]">
                      <Presentation size={14} /> 슬라이드
                    </label>
                    {editingContent.slideUrl?.trim() ? (
                      <div className="flex items-center gap-3 rounded-2xl bg-[#F3F2EE] px-4 py-3">
                        <Presentation size={16} className="shrink-0 text-[#8B5E3C]" />
                        <span className="flex-1 truncate text-sm font-medium text-[#4A3728]">
                          슬라이드 연결됨
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSaveError(null);
                            setEditingContent({ ...editingContent, slideUrl: '' });
                          }}
                          className="shrink-0 rounded-lg p-1 text-[#A89F94] transition-all hover:bg-white hover:text-red-500"
                          title="슬라이드 연결 해제"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <button
                          type="button"
                          disabled={isPickingSlide || !import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID}
                          onClick={async () => {
                            const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
                            const apiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY;
                            if (!clientId) return;
                            setIsPickingSlide(true);
                            try {
                              const file = await openDriveSlidePicker(apiKey, clientId, userEmail);
                              if (file) {
                                setSaveError(null);
                                setDriveUrlInput('');
                                setEditingContent({ ...editingContent, slideUrl: file.embedUrl });
                              }
                            } finally {
                              setIsPickingSlide(false);
                            }
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-4 font-bold text-[#8B7E74] transition-all hover:border-[#8B5E3C] hover:bg-[#FFF5E9] hover:text-[#8B5E3C] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <FolderOpen size={18} />
                          {isPickingSlide ? '드라이브 열기 중...' : 'Google Drive에서 슬라이드 선택'}
                        </button>
                        <div className="flex items-center gap-2">
                          <div className="h-px flex-1 bg-[#E5E3DD]" />
                          <span className="text-xs font-bold text-[#A89F94]">또는 URL 직접 입력</span>
                          <div className="h-px flex-1 bg-[#E5E3DD]" />
                        </div>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!driveUrlInput.trim()) return;
                            const embedUrl = toDriveEmbedUrl(driveUrlInput);
                            setSaveError(null);
                            setDriveUrlInput('');
                            setEditingContent({ ...editingContent, slideUrl: embedUrl });
                          }}
                          className="flex gap-2"
                        >
                          <input
                            type="text"
                            value={driveUrlInput}
                            onChange={(event) => setDriveUrlInput(event.target.value)}
                            placeholder="Google Drive 링크를 붙여넣으세요"
                            className="flex-1 rounded-2xl border border-[#E5E3DD] bg-[#F3F2EE] px-4 py-3 text-sm text-[#4A3728] outline-none transition-all focus:border-[#8B5E3C] focus:ring-2 focus:ring-[#8B5E3C]"
                          />
                          <button
                            type="submit"
                            disabled={!driveUrlInput.trim()}
                            className="rounded-2xl bg-[#8B5E3C] px-5 py-3 text-sm font-bold text-white transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:bg-[#B8AA9A]"
                          >
                            적용
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#8B5E3C]">
                        {isDescriptionTab ? <FileText size={14} /> : <Code size={14} />}
                        {editorSectionTitle}
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 rounded-xl bg-[#F3F2EE] p-1">
                          <button
                            onClick={() => setEditorTab('edit')}
                            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                              editorTab === 'edit' ? 'bg-white text-[#8B5E3C] shadow-sm' : 'text-[#8B7E74] hover:text-[#4A3728]'
                            }`}
                          >
                            <Code size={13} />
                            편집
                          </button>
                          <button
                            onClick={() => setEditorTab('description')}
                            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                              editorTab === 'description' ? 'bg-white text-[#8B5E3C] shadow-sm' : 'text-[#8B7E74] hover:text-[#4A3728]'
                            }`}
                          >
                            <FileText size={13} />
                            수업 설명
                          </button>
                          <button
                            onClick={() => setEditorTab('preview')}
                            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                              editorTab === 'preview' ? 'bg-white text-[#8B5E3C] shadow-sm' : 'text-[#8B7E74] hover:text-[#4A3728]'
                            }`}
                          >
                            <Eye size={13} />
                            미리보기
                          </button>
                        </div>
                        <button
                          onClick={() => setIsFullscreenPreviewOpen(true)}
                          disabled={!hasPreviewContent}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E3DD] bg-white text-[#8B5E3C] transition-all hover:border-[#8B5E3C] hover:bg-[#FFF5E9] disabled:cursor-not-allowed disabled:border-[#ECE9E2] disabled:bg-[#F8F6F2] disabled:text-[#C8BEB2]"
                        >
                          <Maximize2 size={15} />
                        </button>
                      </div>
                    </div>

                    {editorTab === 'edit' ? (
                      <textarea
                        value={editingContent.html ?? ''}
                        onChange={(event) => {
                          setSaveError(null);
                          setEditingContent({ ...editingContent, html: event.target.value });
                        }}
                        placeholder="HTML 코드를 입력하세요"
                        className="h-[400px] w-full resize-none rounded-2xl border-none bg-[#F3F2EE] px-6 py-4 font-mono text-sm text-[#4A3728] outline-none transition-all focus:ring-2 focus:ring-[#8B5E3C]"
                      />
                    ) : editorTab === 'preview' ? (
                      <div className="w-full overflow-hidden rounded-2xl border border-[#E5E3DD] bg-white">
                        {editingContent.slideUrl?.trim() ? (
                          <SlideEmbed
                            slideUrl={editingContent.slideUrl}
                            title={editingContent.title?.trim() || '슬라이드 미리보기'}
                            roundedBottom={!editingContent.html?.trim()}
                          />
                        ) : null}
                        {editingContent.html?.trim() ? (
                          <div className="h-[400px]">
                            <StudentContentPreviewFrame
                              html={editingContent.html}
                              title={editingContent.title?.trim() || '콘텐츠 미리보기'}
                              autoHeight={false}
                              className="h-full w-full"
                            />
                          </div>
                        ) : null}
                        {!editingContent.slideUrl?.trim() && !editingContent.html?.trim() ? (
                          <div className="flex h-[400px] flex-col items-center justify-center text-[#8B7E74]">
                            <Eye size={32} className="mb-3 opacity-30" />
                            <p className="text-sm">슬라이드 URL 또는 HTML을 입력하면 미리보기가 표시됩니다.</p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <textarea
                        value={editingContent.description ?? ''}
                        onChange={(event) => {
                          setSaveError(null);
                          setEditingContent({ ...editingContent, description: event.target.value });
                        }}
                        placeholder="이 콘텐츠를 수업에서 어떻게 설명할지 입력하세요"
                        className="h-[240px] w-full resize-none rounded-2xl border-none bg-[#F3F2EE] px-6 py-4 text-sm leading-7 text-[#4A3728] outline-none transition-all focus:ring-2 focus:ring-[#8B5E3C]"
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-[40px] border border-dashed border-[#E5E3DD] bg-white p-12 text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#F3F2EE] text-[#8B7E74]">
                  <Edit3 size={32} />
                </div>
                <h3 className="mb-2 text-xl font-bold text-[#4A3728]">콘텐츠를 선택하거나 새로 만들어보세요</h3>
                <p className="max-w-xs text-[#8B7E74]">카테고리 안팎의 콘텐츠를 열어서 확인하고, 오른쪽 편집기에서 바로 수정할 수 있습니다.</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isFullscreenPreviewOpen && previewContent && hasPreviewContent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] overflow-y-auto bg-[#FBFBFA]/95 backdrop-blur-sm"
            >
              <div className="min-h-full px-4 py-6 sm:px-6 lg:px-8">
                <div className="sticky top-0 z-10 mx-auto flex max-w-6xl justify-end pb-4">
                  <button
                    onClick={() => setIsFullscreenPreviewOpen(false)}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E5E3DD] bg-white text-[#8B7E74] shadow-sm transition-all hover:border-[#8B5E3C] hover:text-[#4A3728]"
                  >
                    <X size={20} />
                  </button>
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 24 }}
                  className="mx-auto max-w-6xl pb-10"
                >
                  <StudentContentCard content={previewContent} />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
