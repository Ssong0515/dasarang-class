import { useEffect, useRef } from 'react';

/**
 * 팝업/모달이 열려 있을 때 Esc 키를 누르면 닫는다. 각 모달에서 `useEscToClose(isOpen, closeFn)`로 호출한다.
 *
 * - `onClose`는 ref로 최신값을 잡으므로, 인라인 함수(() => setX(false))를 넘겨도 매 렌더 재구독하지 않고
 *   `active`가 바뀔 때만 리스너를 붙이고 뗀다.
 * - 컴포넌트 최상위에서 (조건문 밖에서) 호출해야 한다 — React 훅 규칙.
 * - 여러 모달이 동시에 열려 있으면(드묾) 각자 리스너가 있어 Esc에 함께 닫힐 수 있다(대개 하나만 열림).
 */
export function useEscToClose(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active]);
}
